import { ipcMain, BrowserWindow, shell } from "electron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import { CoverCache } from "../CoverCache.js";
import { MetadataWriteService } from "../metadata/MetadataWriteService.js";
function readLyricFile(lrcPath) {
  const raw = fs.readFileSync(lrcPath);
  const detected = jschardet.detect(raw);
  const encoding = detected.encoding === "GB2312" || detected.encoding === "GBK" || detected.encoding === "gb2312" || detected.encoding === "gbk" ? "gbk" : detected.encoding?.toLowerCase() || "utf-8";
  const text = iconv.decode(raw, encoding);
  return text.replace(/^\uFEFF/, "");
}

// ── 路径安全校验 ──
// 阻止路径穿越和敏感目录访问
function isPathSafe(requestedPath) {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) return false;
  try {
    const normalized = path.resolve(requestedPath);
    const blockedPrefixes = ['/etc', '/var', '/System', '/Library/Preferences', '/Windows/System32', '/usr'].map(p => path.resolve(p));
    for (const prefix of blockedPrefixes) {
      if (normalized.startsWith(prefix)) return false;
    }
    if (normalized.includes('/../') || normalized.includes('\\..\\')) return false;
    return true;
  } catch {
    return false;
  }
}
ipcMain.handle("select-directory", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
function registerLocalMusicIpc(scanner, db) {
  const coverCache = new CoverCache();
  const metadataWriteService = new MetadataWriteService(db);
  ipcMain.handle("local:scan", async (event, dirPath) => {
    if (!dirPath) return { success: false, error: "扫描路径为空" };
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
    for await (const evt of scanner.scanDir(dirPath, cachedMtimes)) {
      send(evt);
      if (evt.type === "batch") await db.upsertTracks(evt.tracks);
    }
    try {
      const allTracks = await db.getAllTracks();
      const toRemove = [];
      for (const t of allTracks) {
        if (!t.path.startsWith(dirPrefix)) continue;
        if (!fs.existsSync(t.path)) toRemove.push(t.path);
      }
      if (toRemove.length) {
        await db.removeTracks(toRemove);
        console.log(`[local:scan] \u6E05\u7406\u4E86 ${toRemove.length} \u6761\u5DF2\u5220\u9664\u6587\u4EF6\u8BB0\u5F55`);
      }
    } catch (e) {
      console.warn("[local:scan] cleanup error:", e);
    }
    return { success: true };
  });
  ipcMain.handle("local:clear-all", async () => {
    console.log("[local:clear-all] \u5F00\u59CB\u6E05\u9664\u6240\u6709\u6B4C\u66F2\u6570\u636E");
    try {
      const deleted = await db.clearAllTracks();

      // 清除封面缓存
      coverCache.clearCache();
      const { app: electronApp } = await import("electron");
      const mosaicDir = path.join(electronApp.getPath("userData"), "mosaic-covers");
      if (fs.existsSync(mosaicDir)) {
        fs.rmSync(mosaicDir, { recursive: true, force: true });
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
    return { success: true };
  });
  ipcMain.handle("local:remove-tracks", async (_event, paths) => {
    if (!paths.length) return { success: true, deleted: 0 };
    console.log("[local:remove-tracks] \u6536\u5230\u8BF7\u6C42, \u6570\u91CF:", paths.length);
    await db.removeTracks(paths);
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
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath).buffer;
  });
  ipcMain.handle("local:compute-file-md5", async (_event, filePath) => {
    if (!isPathSafe(filePath)) { console.warn('[ipc] blocked compute-file-md5 path:', filePath); return null; }
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
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
}
export {
  registerLocalMusicIpc
};
