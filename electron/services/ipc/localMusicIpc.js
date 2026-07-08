import { ipcMain, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import * as mm2 from "music-metadata";
import { MetadataWriteService } from "../metadata/MetadataWriteService.js";
import { isPathSafe } from "../pathSafety.js";
function readLyricFile(lrcPath) {
  const raw = fs.readFileSync(lrcPath);
  const detected = jschardet.detect(raw);
  const encoding = detected.encoding === "GB2312" || detected.encoding === "GBK" || detected.encoding === "gb2312" || detected.encoding === "gbk" ? "gbk" : detected.encoding?.toLowerCase() || "utf-8";
  const text = iconv.decode(raw, encoding);
  return text.replace(/^\uFEFF/, "");
}
ipcMain.handle("select-directory", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
function registerLocalMusicIpc(db, coverCache) {
  const metadataWriteService = new MetadataWriteService(db);
    ipcMain.handle("local:scan", async (event, dirPath) => {
    if (!dirPath) return { success: false, error: "\u626b\u63cf\u8def\u5f84\u4e3a\u7a7a" };
    if (typeof db.upsertScanDir === "function") {
      await db.upsertScanDir(dirPath);
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const send = (data) => {
      if (!win || win.isDestroyed()) return;
      event.sender.send("local:scan-progress", data);
    };
    const dirPrefix = path.normalize(dirPath);
    const cachedMtimes = await db.getAllMtimes();
    
    // Step 1: collect files in main process (fast, no mm.parseFile needed)
    const SUPPORTED = new Set([".mp3",".flac",".wav",".ogg",".m4a",".aac",".ape",".dsf",".opus",".aiff",".alac"]);
    const allFiles = [];
    async function collectFiles(dir) {
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
        const fp = path.join(dir, entry.name);
        if (entry.isDirectory()) await collectFiles(fp);
        else if (entry.isFile() && SUPPORTED.has(path.extname(entry.name).toLowerCase())) allFiles.push(fp);
      }
    }
    send({ type: "progress", current: 0, total: 0, phase: "collecting" });
    await collectFiles(dirPrefix);
    if (!allFiles.length) {
      send({ type: "error", message: "扫描目录不可访问或无音乐文件: " + dirPath });
      console.warn("[local:scan] 目录无效或无音乐文件:", dirPath);
      send({ type: "complete", total: 0 });
      return { success: true, scanned: 0 };
    }
    
    // Step 2: filter by mtime
    let scanFiles = allFiles;
    let skippedCount = 0;
    if (cachedMtimes && cachedMtimes.size > 0) {
      scanFiles = [];
      for (const fp of allFiles) {
        const cachedMtime = cachedMtimes.get(fp);
        if (cachedMtime !== undefined) {
          try {
            const st = await fs.promises.stat(fp);
            if (st.mtimeMs === cachedMtime) { skippedCount++; continue; }
          } catch {}
        }
        scanFiles.push(fp);
      }
    }
    if (!scanFiles.length) { send({ type: "complete", total: skippedCount }); return { success: true }; }
    

    // Step 3: fork ScannerWorker child process
    const { fork } = await import("child_process");
    const workerPath = fileURLToPath(new URL("../scanner/ScannerWorker.js", import.meta.url));
    console.log("[local:scan] forking ScannerWorker:", workerPath, "files:", scanFiles.length);
    const worker = fork(workerPath, [], { stdio: "pipe", silent: true });
    
    // Handle worker stdout for debugging
    if (worker.stdout) worker.stdout.on("data", (d) => process.stdout.write("[ScannerWorker] " + d));
    if (worker.stderr) worker.stderr.on("data", (d) => process.stderr.write("[ScannerWorker] " + d));
    
    // Step 4: process results from worker
    let completed = 0;
    const total = scanFiles.length;
    
    const { app: electronApp2 } = await import("electron");
    const coverCacheDir = path.join(electronApp2.getPath("userData"), "covers");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.kill();
        reject(new Error("ScannerWorker timeout"));
      }, 3600000); // 1 hour max
    
      worker.on("message", async (msg) => {
        try {
          console.log("[local:scan] worker msg:", msg.type, msg.tracks?.length || "");
          if (msg.type === "batch-result") {
            if (msg.tracks && msg.tracks.length) {
              await db.upsertTracks(msg.tracks);
              // Save covers to local cache
              if (msg.covers && coverCache) {
                for (const [fp, cover] of Object.entries(msg.covers)) {
                  if (cover) { try { await coverCache.saveCover(fp, Buffer.from(cover.data), cover.format); } catch {} }
                }
              }
            }
          } else if (msg.type === "worker-progress") {
            completed = msg.current || completed;
            send({ type: "progress", current: completed, total });
          } else if (msg.type === "worker-error") {
            console.warn("[ScannerWorker] error:", msg.path, msg.message);
          } else if (msg.type === "worker-started") {
            console.log("[local:scan] worker started, pid:", msg.pid);
          } else if (msg.type === "batch-done") {
            console.log("[local:scan] all batches done, sending shutdown to worker");
            worker.send({ type: "shutdown" });
          }
        } catch (e) {
          console.warn("[ScannerWorker] handler error:", e);
        }
      });
    
      worker.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    
      worker.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
          console.warn("[ScannerWorker] exited with code", code);
        }
        resolve();
      });
    
      worker.send({ type: "covers-dir", dir: coverCacheDir });
      worker.send({ type: "parse-batch", files: scanFiles });
    });
    
    // Step 5: cleanup removed files
    try {
      const allTracks = await db.getAllTracks();
      const toRemove = [];
      for (const t of allTracks) {
        if (!t.path.startsWith(dirPrefix)) continue;
        if (!fs.existsSync(t.path)) toRemove.push(t.path);
      }
      if (toRemove.length) {
        await db.removeTracks(toRemove);
        console.log("[local:scan] cleaned", toRemove.length, "removed file records");
      }
    } catch (e) {
      console.warn("[local:scan] cleanup error:", e);
    }
    
    // Step 6: GC orphaned covers
    try {
      const allPaths = (await db.getAllTracks()).map(t => t.path).filter(Boolean);
      await coverCache.gcCovers(new Set(allPaths));
    } catch (e) {
      console.warn("[local:scan] cover gc error:", e);
    }
    
    send({ type: "complete", total });
    return { success: true };
  });
  ipcMain.handle("local:clear-all", async () => {
    console.log("[local:clear-all] \u5F00\u59CB\u6E05\u9664\u6240\u6709\u6B4C\u66F2\u6570\u636E");
    try {
      const deleted = await db.clearAllTracks();

      // 清除封面缓存
      await coverCache.clearCache();
      const { app: electronApp } = await import("electron");
      const mosaicDir = path.join(electronApp.getPath("userData"), "mosaic-covers");
      if (fs.existsSync(mosaicDir)) {
        fs.rmSync(mosaicDir, { recursive: true, force: true });
      }
      // Clear scan directories too, so stale dirs don't get restored after clear
      if (typeof db.clearScanDirs === "function") {
        await db.clearScanDirs();
      }
      console.log("[local:clear-all] \u6E05\u9664\u5B8C\u6210, \u5171\u5220\u9664", deleted, "\u6761");
      return { success: true, deleted };
    } catch (e) {
      console.error("[local:clear-all] \u6E05\u9664\u5931\u8D25:", e);
      return { success: false, error: String(e) };
    }
  });
  ipcMain.handle("local:remove-tracks-by-dir", async (_event, dirPath) => {
    console.log("[local:remove-tracks-by-dir] \u6536\u5230\u8BF7\u6C42:", dirPath);
    const result = await db.removeTracksByDirectory(dirPath);
    if (typeof db.removeScanDir === "function") {
      await db.removeScanDir(dirPath);
    }
    console.log("[local:remove-tracks-by-dir] \u5B8C\u6210, \u5220\u9664\u4E86", result, "\u884C");
    // \u5220\u9664\u76EE\u5F55\u540E\u6E05\u7406\u5B64\u513F\u5C01\u9762\u7F13\u5B58
    try {
      const allPaths = (await db.getAllTracks()).map(t => t.path).filter(Boolean);
      coverCache.gcCovers(new Set(allPaths));
    } catch (e) {
      console.warn("[local:remove-tracks-by-dir] cover gc error:", e);
    }
    return { success: true };
  });
  ipcMain.handle("local:remove-tracks", async (_event, paths) => {
    if (!paths.length) return { success: true, deleted: 0 };
    console.log("[local:remove-tracks] \u6536\u5230\u8BF7\u6C42, \u6570\u91CF:", paths.length);
    await db.removeTracks(paths);
    // \u5220\u9664\u6B4C\u66F2\u65F6\u540C\u6B65\u6E05\u7406\u5C01\u9762\u7F13\u5B58
    for (const p of paths) {
      try { await coverCache.removeCover(p); } catch {}
    }
    console.log("[local:remove-tracks] \u5B8C\u6210");
    return { success: true };
  });
  ipcMain.handle("local:search", async (_event, query) => {
    return db.search(query || "");
  });
  ipcMain.handle("local:get-all", async () => {
    return db.getAllTracks();
  });
  ipcMain.handle("local:track-count", async () => {
    return db.getTrackCount();
  });
  ipcMain.handle("local:open-folder", async (_event, folderPath) => {
    if (!isPathSafe(folderPath) || !fs.existsSync(folderPath)) return { success: false, error: "目录不存在" };
    const stat = fs.statSync(folderPath);
    const target = stat.isDirectory() ? folderPath : path.dirname(folderPath);
    const error = await shell.openPath(target);
    return error ? { success: false, error } : { success: true };
  });
  ipcMain.handle("local:open-cover-cache", async () => {
    const { app } = await import("electron");
    const cacheDir = path.join(app.getPath("userData"), "covers");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const error = await shell.openPath(cacheDir);
    return error ? { success: false, error } : { success: true };
  });
  ipcMain.handle("local:list-scan-dirs", async () => {
    if (typeof db.listScanDirs !== "function") return [];
    return db.listScanDirs();
  });
  ipcMain.handle("local:save-scan-dir", async (_event, dirPath) => {
    if (!dirPath || typeof db.upsertScanDir !== "function") return { success: false };
    await db.upsertScanDir(dirPath);
    return { success: true };
  });
  ipcMain.handle("local:remove-scan-dir", async (_event, dirPath) => {
    if (!dirPath || typeof db.removeScanDir !== "function") return { success: false };
    await db.removeScanDir(dirPath);
    return { success: true };
  });
  ipcMain.handle("local:get-lyric", async (_event, filePath) => {
    if (!isPathSafe(filePath)) { console.warn('[ipc] blocked get-lyric path:', filePath); return null; }
    if (!fs.existsSync(filePath)) return null;
    const base = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    for (const ext of [".lrc", ".yrc", ".ttml"]) {
      const lrcPath = path.join(base, name + ext);
      if (fs.existsSync(lrcPath)) {
        return { text: readLyricFile(lrcPath), format: ext.slice(1) };
      }
    }
    return null;
  });
  ipcMain.handle("local:get-lyric-match", async (_event, localTrackId, localPath) => {
    if (typeof db.getLocalLyricMatch !== "function") return null;
    return db.getLocalLyricMatch(localTrackId || "", localPath || "");
  });
  ipcMain.handle("local:save-lyric-match", async (_event, payload) => {
    if (typeof db.saveLocalLyricMatch !== "function") return { success: false, error: "not supported" };
    return db.saveLocalLyricMatch(payload || {});
  });
  ipcMain.handle("local:remove-lyric-match", async (_event, localTrackId, localPath) => {
    if (typeof db.removeLocalLyricMatch !== "function") return { success: false, error: "not supported" };
    return db.removeLocalLyricMatch(localTrackId || "", localPath || "");
  });
  ipcMain.handle("local:metadata-preview", async (_event, payload) => {
    return metadataWriteService.preview(payload || {});
  });
  ipcMain.handle("local:metadata-write-one", async (_event, payload) => {
    return metadataWriteService.writeOne(payload || {});
  });
  ipcMain.handle("local:metadata-revert-one", async (_event, payload) => {
    return metadataWriteService.revertOne(payload || {});
  });
  ipcMain.handle("local:metadata-status", async (_event, payload) => {
    return metadataWriteService.getStatus(payload || {});
  });
  ipcMain.handle("local:metadata-status-batch", async (_event, payload) => {
    return metadataWriteService.getStatusBatch(payload || {});
  });
  ipcMain.handle("local:get-cover", async (_event, filePath) => {
    if (!isPathSafe(filePath)) { console.warn('[ipc] blocked get-cover path:', filePath); return null; }
    return coverCache.getCover(filePath);
  });
  // 批量获取封面：单次 IPC 调用替代 N 次独立调用，大幅减少 IPC 开销
  ipcMain.handle("local:get-covers-batch", async (_event, filePaths) => {
    if (!filePaths || !filePaths.length) return []
    const BATCH = 16
    const results = []
    for (let i = 0; i < filePaths.length; i += BATCH) {
      const batch = filePaths.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(fp => {
        if (!isPathSafe(fp)) return null
        return coverCache.getCover(fp)
      }))
      results.push(...batchResults)
    }
    return results
  });
  ipcMain.handle("local:read-file", async (_event, filePath) => {
    if (!isPathSafe(filePath)) { console.warn('[ipc] blocked read-file path:', filePath); return null; }
    try { await fs.promises.stat(filePath); } catch { return null; }
    return fs.promises.readFile(filePath).then(b => b.buffer);
  });
  ipcMain.handle("local:compute-file-md5", async (_event, filePath) => {
    if (!isPathSafe(filePath)) { console.warn('[ipc] blocked compute-file-md5 path:', filePath); return null; }
    try { await fs.promises.stat(filePath); } catch { return null; }
    const stat = await fs.promises.stat(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    return { md5, size: stat.size };
  });
  const playlistDb = db;

  /** 迁移辅助：将旧版本地文件路径 customCoverUrl 转换为 data URL */
  async function resolveCustomCoverUrl(pl) {
    if (!pl?.customCoverUrl) return pl;
    if (pl.customCoverUrl.startsWith('data:')) return pl; // 已是 data URL
    if (!pl.customCoverUrl.startsWith('/')) return pl;    // 不是本地路径
    try {
      if (fs.existsSync(pl.customCoverUrl)) {
        const data = fs.readFileSync(pl.customCoverUrl);
        const ext = path.extname(pl.customCoverUrl).slice(1) || 'jpeg';
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        pl.customCoverUrl = `data:image/${mime};base64,${data.toString('base64')}`;
        // 同步更新 DB
        await playlistDb.updatePlaylist(pl.id, { customCoverUrl: pl.customCoverUrl }).catch(() => {});
      }
    } catch { /* ignore */ }
    return pl;
  }

  ipcMain.handle("local:playlist-create", async (_event, name, description) => {
    return playlistDb.createPlaylist(name, description || "");
  });
  ipcMain.handle("local:playlist-list", async () => {
    const playlists = await playlistDb.listPlaylists();
    for (const pl of playlists) await resolveCustomCoverUrl(pl);
    return playlists;
  });
  ipcMain.handle("local:playlist-get", async (_event, id) => {
    const pl = await playlistDb.getPlaylist(id);
    await resolveCustomCoverUrl(pl);
    return pl;
  });
  ipcMain.handle("local:playlist-cover-paths", async () => {
    return playlistDb.getAllPlaylistCoverPaths();
  });
  ipcMain.handle("local:playlist-delete", async (_event, id) => {
    await playlistDb.deletePlaylist(id);
    return { success: true };
  });
  ipcMain.handle("local:playlist-rename", async (_event, id, name) => {
    await playlistDb.renamePlaylist(id, name);
    return { success: true };
  });
  ipcMain.handle("local:playlist-update", async (_event, id, updates) => {
    await playlistDb.updatePlaylist(id, updates);
    return { success: true };
  });
  ipcMain.handle("local:playlist-add-track", async (_event, playlistId, trackId) => {
    await playlistDb.addTrackToPlaylist(playlistId, trackId);
    return { success: true };
  });
  ipcMain.handle("local:playlist-remove-track", async (_event, playlistId, trackId) => {
    await playlistDb.removeTrackFromPlaylist(playlistId, trackId);
    return { success: true };
  });
  ipcMain.handle("local:playlist-tracks", async (_event, playlistId) => {
    return playlistDb.getPlaylistTracks(playlistId);
  });
  ipcMain.handle("local:get-recent", async (_event, limit) => {
    return playlistDb.getRecentTracks(limit || 10);
  });
  ipcMain.handle("local:get-stats", async () => {
    return playlistDb.getTrackStats();
  });

  // 生成并保存歌单马赛克封面
  ipcMain.handle("local:playlist-save-mosaic", async (_event, playlistId, coverDataUrl) => {
    if (!coverDataUrl) return { success: false };
    // base64 data URL → buffer
    const matches = coverDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!matches) return { success: false };
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    // 保存到应用 userData 目录下的 mosaic-covers 文件夹（作为缓存，方便以后迁移/恢复）
    const { app } = await import("electron");
    const mosaicDir = path.join(app.getPath("userData"), "mosaic-covers");
    if (!fs.existsSync(mosaicDir)) fs.mkdirSync(mosaicDir, { recursive: true });
    const filePath = path.join(mosaicDir, `playlist-${playlistId}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    // 更新 DB 中的 customCoverUrl（存储 data URL，而非本地路径，确保渲染进程可直接使用）
    await playlistDb.updatePlaylist(playlistId, { customCoverUrl: coverDataUrl });
    return { success: true, filePath };

  });

  // ── 一次性封面缓存回填迁移 ──
  if (coverCache) {
    (async () => {
      try {
        const { app } = await import("electron");
        const MIGRATION_MARKER = path.join(app.getPath("userData"), ".cover_cache_migrated_v1");
        if (fs.existsSync(MIGRATION_MARKER)) return;
        console.log("[local:cover-migration] starting backfill...");
        const allTracks = await db.getAllTracks();
        let migrated = 0;
        for (const t of allTracks) {
          if (!t?.path) continue;
          if (await coverCache.hasCover(t.path)) continue;
          try {
            const meta = await mm2.parseFile(t.path, { duration: false, skipPostHeaders: true });
            const pic = meta.common.picture?.[0];
            if (pic) {
              await coverCache.saveCover(t.path, pic.data, pic.format);
              migrated++;
            }
          } catch {}
        }
        fs.writeFileSync(MIGRATION_MARKER, "done", "utf-8");
        console.log("[local:cover-migration] done, migrated " + migrated + " tracks");
      } catch (e) {
        console.warn("[local:cover-migration] failed:", e);
      }
    })();
  }
}
export {
  registerLocalMusicIpc
};
