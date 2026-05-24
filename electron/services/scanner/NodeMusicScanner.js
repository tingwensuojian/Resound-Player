import * as mm from "music-metadata";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const SUPPORTED = new Set([
  ".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac",
  ".wma", ".ape", ".dsf", ".opus", ".aiff", ".alac"
]);

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

class NodeMusicScanner {
  supportedExtensions = [...SUPPORTED];

  async *scanDir(dirPath, cachedMtimes) {
    // 先通知开始收集文件
    if (!dirPath) { yield { type: "error", path: "", message: "扫描路径为空" }; return; }    yield { type: "progress", current: 0, total: 0, phase: "collecting" };

    const files = [];
    const collectState = { found: 0, error: null };

    // 在后台运行 collectFiles，同时轮询进度
    const collectPromise = (async () => {
      try {
        await this.collectFiles(dirPath, files, collectState);
      } catch (err) {
        collectState.error = err;
      }
    })();

    // 轮询收集进度
    let collecting = true;
    while (collecting) {
      const raced = await Promise.race([
        collectPromise.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 300)),
      ]);
      collecting = !raced;
      // 检查错误
      if (collectState.error) {
        yield { type: "error", path: dirPath, message: `无法读取目录: ${collectState.error.message}` };
        return;
      }
      // 如果有找到文件，发送进度
      if (collectState.found > 0) {
        yield { type: "progress", current: collectState.found, total: 0, phase: "collecting" };
      }
    }

    // 确保 Promise 完成
    await collectPromise;

    if (!files.length) {
      yield { type: "complete", total: 0 };
      return;
    }

    // log 收集到的文件数
    console.log(`[NodeMusicScanner] 收集到 ${files.length} 个文件`);

    // ── 区分新文件和已缓存未变更文件 ──
    let scanFiles;
    let skippedCount = 0;
    if (cachedMtimes && cachedMtimes.size > 0) {
      scanFiles = [];
      for (const fp of files) {
        const cachedMtime = cachedMtimes.get(fp);
        if (cachedMtime !== void 0) {
          try {
            const stat = await fs.stat(fp);
            if (stat.mtimeMs === cachedMtime) {
              skippedCount++;
              continue;
            }
          } catch {}
        }
        scanFiles.push(fp);
      }
    } else {
      scanFiles = files;
    }

    if (!scanFiles.length) {
      yield { type: "complete", total: skippedCount };
      return;
    }

    // ── 并发解析 ──
    const total = scanFiles.length;
    const concurrency = Math.min(8, Math.max(2, os.cpus().length - 1));
    let index = 0;
    let completed = 0;
    let resolveDone = null;
    const donePromise = new Promise((r) => { resolveDone = r; });
    const results = [];
    const scanErrors = [];

    const worker = async () => {
      while (index < scanFiles.length) {
        const filePath = scanFiles[index++];
        try {
          const track = await this.parseFile(filePath);
          if (track) results.push(track);
        } catch (err) {
          scanErrors.push({ type: "error", path: filePath, message: err.message });
        }
        completed++;
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    Promise.all(workers).then(() => resolveDone(true));

    let done = false;
    while (!done) {
      const pollDone = await Promise.race([
        donePromise,
        new Promise((r) => setTimeout(() => r(false), 250)),
      ]);
      done = pollDone === true;
      while (scanErrors.length) yield scanErrors.shift();
      if (results.length >= 20 || (done && results.length > 0)) {
        yield { type: "batch", tracks: results.splice(0) };
      }
      if (completed > 0) {
        yield { type: "progress", current: completed, total };
      }
    }
    yield { type: "complete", total };
  }

  async collectFiles(dirPath, result, state = { found: 0 }) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      throw new Error(`无法读取目录 ${dirPath}: ${err.message}`);
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.collectFiles(fullPath, result, state);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED.has(ext)) {
          result.push(fullPath);
          state.found++;
        }
      }
    }
  }

  async parseFile(filePath) {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }
    const base = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const hasExternalLyric = [".lrc", ".yrc", ".ttml"].some(
      (ext) => existsSync(path.join(base, name + ext))
    );

    const fallback = () => ({
      id: md5(filePath),
      path: filePath,
      title: name,
      artist: "未知艺术家",
      album: "未知专辑",
      albumArtist: "",
      duration: 0, bitrate: 0, sampleRate: 0,
      trackNo: 0, discNo: 0, genre: "", year: 0,
      coverPath: "", fileSize: stat.size, mtime: stat.mtimeMs,
      hasLyrics: hasExternalLyric,
      createdAt: "", updatedAt: "",
    });

    let meta;
    try {
      meta = await mm.parseFile(filePath, { duration: true, skipPostHeaders: true });
    } catch {
      return fallback();
    }

    const { common, format } = meta;
    return {
      id: md5(filePath),
      path: filePath,
      title: common.title || name,
      artist: common.artist || "未知艺术家",
      album: common.album || "未知专辑",
      albumArtist: common.albumartist || "",
      duration: format.duration || 0,
      bitrate: format.bitrate || 0,
      sampleRate: format.sampleRate || 0,
      trackNo: common.track?.no || 0,
      discNo: common.disk?.no || 0,
      genre: (common.genre || []).join(", "),
      year: common.year || 0,
      coverPath: "",
      fileSize: stat.size,
      mtime: stat.mtimeMs,
      hasLyrics: Boolean(common.lyrics?.length) || hasExternalLyric ? 1 : 0,
      createdAt: "", updatedAt: "",
    };
  }
}

export { NodeMusicScanner };