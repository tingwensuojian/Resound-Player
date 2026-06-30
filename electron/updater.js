import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater");
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const logFile = path.join(os.tmpdir(), "resound-player-updater.log");

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`;
  try { fs.appendFileSync(logFile, line, "utf8"); } catch { /* ignore */ }
}

let _mainWindowRef = null;
let _statusCallbacks = new Set();

// ── Status helpers ──

const Status = {
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  NOT_AVAILABLE: "not-available",
  DOWNLOADING: "downloading",
  DOWNLOADED: "downloaded",
  ERROR: "error",
};

let _state = {
  status: Status.IDLE,
  info: null,        // { version, releaseDate, releaseNotes }
  progress: null,    // { percent, bytesPerSecond, total, transferred }
  error: null,
};

function broadcast() {
  for (const cb of _statusCallbacks) {
    try { cb({ ..._state }); } catch { /* ignore */ }
  }
  // Also forward to all BrowserWindows
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("auto-updater:status", { ..._state });
    } catch { /* ignore */ }
  }
}

// ── Configure autoUpdater ──

autoUpdater.autoDownload = false;          // 只检查，不自动下载
autoUpdater.autoInstallOnAppQuit = false;  // 不自动安装，让用户手动触发
autoUpdater.allowPrerelease = false;       // 只检测正式版

// GitHub releases provider — uses GH_TOKEN or GH_ENTERPRISE_TOKEN from env
autoUpdater.setFeedURL({
  provider: "github",
  owner: "tingwensuojian",
  repo: "Resound-Player",
});

// ── Event handlers ──

autoUpdater.on("checking-for-update", () => {
  log("checking-for-update");
  _state = { ..._state, status: Status.CHECKING, info: null, progress: null, error: null };
  broadcast();
});

autoUpdater.on("update-available", (info) => {
  log("update-available", info);
  _state = {
    ..._state,
    status: Status.AVAILABLE,
    info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes },
    progress: null,
    error: null,
  };
  broadcast();
});

autoUpdater.on("update-not-available", (info) => {
  log("update-not-available", info);
  _state = {
    ..._state,
    status: Status.NOT_AVAILABLE,
    info: { version: info.version, releaseDate: info.releaseDate },
    progress: null,
    error: null,
  };
  broadcast();
});

autoUpdater.on("download-progress", (progressObj) => {
  const p = {
    percent: Math.round(progressObj.percent * 10) / 10,
    bytesPerSecond: progressObj.bytesPerSecond,
    total: progressObj.total,
    transferred: progressObj.transferred,
  };
  _state = { ..._state, status: Status.DOWNLOADING, progress: p, error: null };
  broadcast();
});

autoUpdater.on("update-downloaded", (info) => {
  log("update-downloaded", info);
  _state = {
    ..._state,
    status: Status.DOWNLOADED,
    info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes },
    progress: { percent: 100, bytesPerSecond: 0, total: info.totalSize || 0, transferred: info.totalSize || 0 },
  };
  broadcast();
});

autoUpdater.on("error", (err) => {
  log("error", err.message);
  _state = { ..._state, status: Status.ERROR, error: err.message };
  broadcast();
});

// ── Public API ──

export function initUpdater(mainWindow) {
  _mainWindowRef = mainWindow;
  log("initUpdater", { version: autoUpdater.currentVersion?.format() });
}

export function checkForUpdates() {
  log("checkForUpdates triggered by user");
  // Dev mode (unpackaged): skip actual check to avoid hanging
  if (!app.isPackaged) {
    log("dev mode, skipping update check");
    _state = { ..._state, status: Status.NOT_AVAILABLE, info: null, progress: null, error: null };
    broadcast();
    return;
  }
  // Add timeout so the UI doesn't hang forever (e.g. dev mode without GH_TOKEN)
  const TIMEOUT_MS = 15000;
  const timer = setTimeout(() => {
    log("checkForUpdates timed out after " + TIMEOUT_MS + "ms");
    _state = { ..._state, status: Status.ERROR, error: "\u68c0\u67e5\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5" };
    broadcast();
  }, TIMEOUT_MS);
  autoUpdater.checkForUpdates().then(() => {
    clearTimeout(timer);
  }).catch((err) => {
    clearTimeout(timer);
    log("checkForUpdates failed", err);
    _state = { ..._state, status: Status.ERROR, error: err.message };
    broadcast();
  });
}

export function downloadUpdate() {
  log("downloadUpdate triggered by user");
  autoUpdater.downloadUpdate().catch((err) => {
    log("downloadUpdate failed", err);
    _state = { ..._state, status: Status.ERROR, error: err.message };
    broadcast();
  });
}

export function installUpdate() {
  log("installUpdate — calling quitAndInstall");
  autoUpdater.quitAndInstall(true, true);
}

export function getUpdateStatus() {
  return { ..._state };
}

export function onUpdateStatus(cb) {
  _statusCallbacks.add(cb);
  return () => _statusCallbacks.delete(cb);
}

// ── Register IPC handlers ──

export function registerUpdaterIpc() {
  ipcMain.handle("auto-updater:check", async () => {
    checkForUpdates();
    return { ok: true };
  });

  ipcMain.handle("auto-updater:download", async () => {
    downloadUpdate();
    return { ok: true };
  });

  ipcMain.handle("auto-updater:install", async () => {
    installUpdate();
    return { ok: true };
  });

  ipcMain.handle("auto-updater:get-status", async () => {
    return getUpdateStatus();
  });
}

