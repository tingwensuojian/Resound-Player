import fs from "fs";
import path from "path";
import crypto from "crypto";
import { app } from "electron";

function inferMimeFromUrl(url, contentType = "") {
  if (contentType.includes("png")) return "image/png";
  if (contentType.includes("webp")) return "image/webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "image/jpeg";
  if (/\.png($|\?)/i.test(url)) return "image/png";
  if (/\.webp($|\?)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

export class ArtworkService {
  constructor() {
    this.cacheDir = path.join(app.getPath("userData"), "metadata-artwork-cache");
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  async fetch(url) {
    if (!url) throw new Error("缺少封面地址");
    const cacheKey = crypto.createHash("md5").update(url).digest("hex");
    const cachedPath = path.join(this.cacheDir, cacheKey);
    if (fs.existsSync(cachedPath)) {
      const buffer = fs.readFileSync(cachedPath);
      return {
        buffer,
        mime: inferMimeFromUrl(url),
        hash: crypto.createHash("md5").update(buffer).digest("hex"),
      };
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载封面失败: HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(cachedPath, buffer);
    return {
      buffer,
      mime: inferMimeFromUrl(url, response.headers.get("content-type") || ""),
      hash: crypto.createHash("md5").update(buffer).digest("hex"),
    };
  }
}

