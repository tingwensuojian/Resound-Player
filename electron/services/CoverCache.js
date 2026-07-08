import { app } from "electron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as mm from "music-metadata";

// MIME → 文件扩展名
const FORMAT_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

const KNOWN_EXTENSIONS = Object.values(FORMAT_TO_EXT);

function extFromFormat(format) {
  return FORMAT_TO_EXT[format] || "jpg";
}

// 解析 data URL → { buffer, format }
function parseDataUrl(dataUrl) {
  // data:image/jpeg;base64,/9j/4AAQ...
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    format: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

class CoverCache {
  cacheDir;
  initPromise;

  constructor() {
    this.cacheDir = path.join(app.getPath("userData"), "covers");
    // Async init: ensure cache dir exists
    this.initPromise = fs.promises.mkdir(this.cacheDir, { recursive: true }).catch(() => {});
  }

  buildCacheKey(filePath) {
    return crypto.createHash("md5").update(filePath).digest("hex");
  }

  /**
   * 获取封面 covercache:// URL
   * 同时兼容旧格式（base64 文本文件，无扩展名）→ 自动迁移为原始二进制 + ext
   */
  async getCover(filePath) {
    await this.initPromise;
    const cacheKey = this.buildCacheKey(filePath);
    // 先查带 ext 的新格式
    for (const ext of KNOWN_EXTENSIONS) {
      const f = path.join(this.cacheDir, cacheKey + "." + ext);
      try {
        await fs.promises.access(f);
        return "covercache://" + cacheKey + "." + ext;
      } catch {}
    }
    // 兼容旧格式：无 ext 的 base64 文本文件
    const oldFile = path.join(this.cacheDir, cacheKey);
    try {
      const text = await fs.promises.readFile(oldFile, "utf-8");
      if (text.startsWith("data:")) {
        // 自动迁移为原始二进制
        const parsed = parseDataUrl(text);
        if (parsed) {
          const ext = extFromFormat(parsed.format);
          const newFile = path.join(this.cacheDir, cacheKey + "." + ext);
          await fs.promises.writeFile(newFile, parsed.buffer);
          try { await fs.promises.unlink(oldFile); } catch {}
          return "covercache://" + cacheKey + "." + ext;
        }
      }
    } catch {}
    return null;
  }

  /**
   * 从音乐文件或目录封面提取封面并缓存
   * 返回 covercache:// URL
   */
  async getCoverFromSource(filePath) {
    const cached = await this.getCover(filePath);
    if (cached) return cached;

    try {
      const meta = await mm.parseFile(filePath, { duration: false, skipPostHeaders: true });
      const pic = meta.common.picture?.[0];
      if (pic) {
        await this.saveCover(filePath, pic.data, pic.format);
        const cacheKey = this.buildCacheKey(filePath);
        const ext = extFromFormat(pic.format);
        return "covercache://" + cacheKey + "." + ext;
      }
    } catch {}

    // 目录内封面文件（cover.jpg / folder.jpg 等）
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const coverNames = [
      "cover.jpg", "cover.png", "cover.jpeg",
      "folder.jpg", "folder.png", "folder.jpeg",
      `${base}.jpg`, `${base}.png`, `${base}.jpeg`
    ];
    for (const name of coverNames) {
      const coverPath = path.join(dir, name);
      try {
        const data = await fs.promises.readFile(coverPath);
        const ext = path.extname(coverPath).toLowerCase().slice(1);
        const mimeExt = ext === "jpg" ? "jpeg" : ext;
        await this.saveCover(filePath, data, "image/" + mimeExt);
        const cacheKey = this.buildCacheKey(filePath);
        return "covercache://" + cacheKey + "." + ext;
      } catch {}
    }
    return null;
  }

  async hasCover(filePath) {
    await this.initPromise;
    const cacheKey = this.buildCacheKey(filePath);
    // 同时检查新格式（带 ext）和旧格式（无 ext）
    for (const ext of KNOWN_EXTENSIONS) {
      try {
        await fs.promises.stat(path.join(this.cacheDir, cacheKey + "." + ext));
        return true;
      } catch {}
    }
    try {
      await fs.promises.stat(path.join(this.cacheDir, cacheKey));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存封面原始二进制到缓存
   * @param {string} filePath - 原始音乐文件路径（用于生成 cacheKey）
   * @param {Buffer} rawBuffer - 原始图片二进制数据
   * @param {string} format - MIME 类型（如 "image/jpeg"）
   */
  async saveCover(filePath, rawBuffer, format) {
    await this.initPromise;
    const cacheKey = this.buildCacheKey(filePath);
    const ext = extFromFormat(format);
    const cacheFile = path.join(this.cacheDir, cacheKey + "." + ext);
    try {
      await fs.promises.writeFile(cacheFile, rawBuffer);
    } catch {}
  }

  /** 保存 base64 data URL（兼容调用方已生成 base64 的场景） */
  async saveCoverFromDataUrl(filePath, dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (parsed) {
      await this.saveCover(filePath, parsed.buffer, parsed.format);
    }
  }

  async removeCover(filePath) {
    const cacheKey = this.buildCacheKey(filePath);
    // 删除所有匹配 {cacheKey}.* 的文件
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const toRemove = files.filter(f => {
        const base = path.basename(f);
        return base === cacheKey || base.startsWith(cacheKey + ".");
      });
      await Promise.all(
        toRemove.map(f => fs.promises.unlink(path.join(this.cacheDir, f)).catch(() => {}))
      );
    } catch {}
  }

  async gcCovers(validPaths) {
    await this.initPromise;
    const validKeys = new Set(
      Array.from(validPaths).map(p => this.buildCacheKey(p))
    );
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      await Promise.all(
        files
          .filter(f => {
            // 提取文件名的 cacheKey 部分（去掉 .ext）
            const key = f.includes(".") ? f.split(".").slice(0, -1).join(".") : f;
            return !validKeys.has(key);
          })
          .map(f => fs.promises.unlink(path.join(this.cacheDir, f)).catch(() => {}))
      );
    } catch {}
  }

  async clearCache() {
    await this.initPromise;
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      await Promise.all(
        files.map(f => fs.promises.unlink(path.join(this.cacheDir, f)).catch(() => {}))
      );
    } catch {}
  }

  async getCacheSize() {
    await this.initPromise;
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      return files.length;
    } catch {
      return 0;
    }
  }
}

export { CoverCache };
