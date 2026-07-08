import * as mm from "music-metadata";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

const SUPPORTED = new Set([
  ".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac",
  ".ape", ".dsf", ".opus", ".aiff", ".alac"
]);

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * ScannerWorker — 独立子进程
 * 接收主进程发送的文件列表，调用 mm.parseFile 解析元数据，
 * 将解析结果（含封面原始数据）发回主进程。
 *
 * 通信协议（IPC via fork()）:
 *   接收: { type: "parse-batch", files: string[] }
 *   发送: { type: "batch-result", tracks: object[], covers: { [path]: { format: string, data: Uint8Array }|null } }
 *   发送: { type: "worker-error", path: string, message: string }
 *   发送: { type: "worker-progress", current: number, total: number }
 */

let currentTotal = 0;
let currentCompleted = 0;

// Debug: log when worker starts
console.error("[ScannerWorker] process started, PID:", process.pid);
process.send({ type: "worker-started", pid: process.pid });


process.on("message", async (msg) => {
  console.error("[ScannerWorker] received:", msg.type, "files:", msg.files?.length || 0);
  if (msg.type === "parse-batch") {
    await handleParseBatch(msg.files);
    process.send({ type: "batch-done" });
    return;
  }
  if (msg.type === "shutdown") {
    process.exit(0);
  }
});

async function handleParseBatch(files) {
  currentTotal = files.length;
  currentCompleted = 0;

  const concurrency = Math.min(6, Math.max(2, files.length));
  let index = 0;
  const results = [];
  const covers = {};
  const errors = [];

  const worker = async () => {
    while (index < files.length) {
      const filePath = files[index++];
      try {
        const parsed = await parseFile(filePath);
        if (parsed) {
          results.push(parsed.track);
          covers[filePath] = parsed.coverData || null;
        }
      } catch (err) {
        errors.push({ type: "worker-error", path: filePath, message: err.message });
      }
      currentCompleted++;
      if (currentCompleted % 5 === 0 || currentCompleted === currentTotal) {
        process.send({ type: "worker-progress", current: currentCompleted, total: currentTotal });
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Send any errors
  for (const err of errors) {
    process.send(err);
  }

  // Send accumulated results
  if (results.length > 0) {
    process.send({ type: "batch-result", tracks: results, covers });
  }
}

async function parseFile(filePath) {
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

  const fallbackTrack = {
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
  };

  let meta;
  try {
    meta = await mm.parseFile(filePath, { duration: true, skipPostHeaders: true });
  } catch {
    return { track: fallbackTrack, coverData: null };
  }

  const { common, format } = meta;
  let coverData = null;

  if (common.picture?.[0]) {
    try {
      const pic = common.picture[0];
      coverData = { format: pic.format, data: pic.data };
    } catch {}
  }

  const track = {
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

  return { track, coverData };
}
