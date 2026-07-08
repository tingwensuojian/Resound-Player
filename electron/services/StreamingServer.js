/**
 * StreamingServer — 独立的 HTTP 流媒体服务子进程
 *
 * 为什么需要独立进程：
 *   浏览器的 <audio> 对 HTTP Range Requests 有原生级支持（206 Partial Content）。
 *   将流媒体服务放在独立子进程中，音频数据不经过 Electron 主进程，
 *   避免大文件（WAV 50-100MB）通过主进程转发造成的 UI 卡顿。
 *
 * 通信协议（JSON over IPC via fork()）:
 *   发送: { type: "ready", port: number }   — 服务已就绪
 *   接收: { type: "shutdown" }              — 关闭服务
 *   接收: { type: "set-port", port: number } — 指定端口（可选）
 */

import http from "http";
import fs from "fs";
import path from "path";
import url from "url";
import { fork } from "child_process";
import { fileURLToPath } from "url";

const MIME_MAP = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".ape": "audio/ape",
  ".dsf": "audio/dsf",
  ".aiff": "audio/aiff",
  ".alac": "audio/alac",
  ".wma": "audio/x-ms-wma",
};

let server = null;
let currentPort = 0;

// ── IOWorker 子进程管理 ──
let ioWorker = null;
let ioSeqId = 0;
const ioPending = new Map();
let ioWorkerReady = false;

function startIOWorker() {
  const workerPath = path.resolve(
    fileURLToPath(import.meta.url), "..", "IOWorker.js"
  );
  
  try {
    ioWorker = fork(workerPath, [], {
      stdio: "pipe",
      env: {
        ...process.env,
        NATIVE_MODULE_PATH: path.resolve(
          fileURLToPath(import.meta.url),
          "..", "..", "native", "io-worker", "build", "Release", "io-worker.node"
        )
      }
    });

    ioWorker.on("message", (msg) => {
      if (msg.type === "ready") {
        ioWorkerReady = true;
        console.log("[StreamingServer] IOWorker ready");
        return;
      }
      const op = ioPending.get(msg.id);
      if (!op) return;
      ioPending.delete(msg.id);
      
      if (msg.type === "data") {
        op.resolve(Buffer.from(msg.buffer));
      } else if (msg.type === "stat-result") {
        op.resolve({ size: msg.size, isFile: msg.isFile, exists: msg.exists });
      } else if (msg.type === "error") {
        op.reject(new Error(msg.message || msg.code));
      }
    });

    ioWorker.on("exit", (code) => {
      console.warn("[StreamingServer] IOWorker exited with code", code);
      ioWorkerReady = false;
      ioWorker = null;
      // 拒绝所有待处理的请求
      for (const [id, op] of ioPending) {
        op.reject(new Error("IOWorker crashed"));
      }
      ioPending.clear();
      // 5 秒后自动重启
      setTimeout(startIOWorker, 5000);
    });

    ioWorker.on("error", (err) => {
      console.error("[StreamingServer] IOWorker error:", err.message);
    });
  } catch (err) {
    console.warn("[StreamingServer] Failed to start IOWorker:", err.message);
    ioWorker = null;
    ioWorkerReady = false;
  }
}

function ioWorkerStat(filePath) {
  return new Promise((resolve, reject) => {
    if (!ioWorker || !ioWorkerReady) {
      // Fallback to fs.promises.stat
      fs.promises.stat(filePath).then(
        (stat) => resolve({ size: stat.size, isFile: stat.isFile(), exists: true }),
        (err) => reject(err)
      );
      return;
    }
    const id = ++ioSeqId;
    ioPending.set(id, { resolve, reject });
    ioWorker.send({ type: "stat", id, path: filePath });
  });
}

function ioWorkerRead(filePath, offset, size) {
  return new Promise((resolve, reject) => {
    if (!ioWorker || !ioWorkerReady) {
      // Fallback to fs.createReadStream
      const chunks = [];
      const stream = fs.createReadStream(filePath, { start: offset, end: offset + size - 1 });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err) => reject(err));
      return;
    }
    const id = ++ioSeqId;
    ioPending.set(id, { resolve, reject });
    ioWorker.send({ type: "read", id, path: filePath, offset, size });
  });
}

function getMimeType(ext) {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const start = match[1] ? parseInt(match[1], 10) : 0;
  // Limit open-ended Range requests to 1MB
  // Browser only needs first chunk to start decoding, then sends subsequent Range requests
  const MAX_INITIAL_CHUNK = 1024 * 1024;
  if (!match[2] || match[2] === "") {
    return { start, end: Math.min(start + MAX_INITIAL_CHUNK - 1, fileSize - 1) };
  }
  const end = parseInt(match[2], 10);
  return { start, end: Math.min(end, fileSize - 1) };
}

async function handleRequest(req, res) {
  try {
    // CORS headers for all responses
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsed = url.parse(req.url, true);
    const filePath = parsed.query.path;

    if (!filePath) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing path parameter");
      return;
    }

    // Security: prevent directory traversal
    const normalized = path.normalize(filePath);
    if (normalized.includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    // 使用 IOWorker stat（或回退到 fs.promises.stat）
    let fileInfo;
    try { fileInfo = await ioWorkerStat(normalized); }
    catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("File not found");
      return;
    }

    if (!fileInfo.isFile) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Not a file");
      return;
    }

    const ext = path.extname(normalized);
    const mime = getMimeType(ext);
    const fileSize = fileInfo.size;
    const range = parseRange(req.headers.range, fileSize);

    if (range) {
      // Partial content (206)
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const buffer = await ioWorkerRead(normalized, start, chunkSize);

      res.writeHead(206, {
        "Content-Type": mime,
        "Content-Length": chunkSize,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.end(buffer);
    } else if (fileSize > 10 * 1024 * 1024) {
      // Large file: return 206 Partial Content with first 1MB
      // Browser will see Accept-Ranges and send subsequent Range requests
      const initialChunk = Math.min(1024 * 1024, fileSize);
      const buffer = await ioWorkerRead(normalized, 0, initialChunk);
      res.writeHead(206, {
        "Content-Type": mime,
        "Content-Length": initialChunk,
        "Content-Range": "bytes 0-" + (initialChunk - 1) + "/" + fileSize,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.end(buffer);
    } else {
      // Small file: full content
      const buffer = await ioWorkerRead(normalized, 0, fileSize);
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.end(buffer);
    }
  } catch (err) {
    console.error("[StreamingServer] request error:", err.message);
    if (!res.headersSent) {
      try { res.writeHead(500); res.end("Internal server error"); } catch {}
    }
  }
}

function startService(port) {
  // 启动 IOWorker 子进程（如果可用）
  startIOWorker();
  server = http.createServer(handleRequest);
  currentPort = port;

  server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    currentPort = addr.port;
    console.log("[StreamingServer] listening on 127.0.0.1:" + currentPort);
    if (process.send) {
      process.send({ type: "ready", port: currentPort });
    }
  });

  server.on("error", (err) => {
    console.error("[StreamingServer] error:", err.message);
    if (process.send) {
      process.send({ type: "error", message: err.message });
    }
  });
}

// ── IPC handlers ──
process.on("message", (msg) => {
  if (msg.type === "shutdown") {
    console.log("[StreamingServer] shutting down");
    if (server) {
      server.close(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }
  if (msg.type === "start") {
    startService(msg.port || 0);
  }
});

// Auto-start if port is provided as command line arg
const cliPort = parseInt(process.argv[2], 10);
if (!isNaN(cliPort)) {
  startService(cliPort);
}
