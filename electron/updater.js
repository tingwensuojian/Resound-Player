import { createRequire } from "node:module";
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
let _autoUpdater = null;

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
  info: null,
  progress: null,
  error: null,
};

function broadcast() {
  for (const cb of _statusCallbacks) {
    try { cb({ ..._state }); } catch { /* ignore */ }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("auto-updater:status", { ..._state });
    } catch { /* ignore */ }
  }
}

// ── Lazy autoUpdater initializer ──
// Delays electron-updater import until initUpdater() is called,
// so the semver validation in its constructor sees the correct
// app.getVersion() after the app module is fully ready.

function getAutoUpdater() {
  if (!_autoUpdater) {
    const require = createRequire(import.meta.url);
    const { autoUpdater } = require("electron-updater");

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.setFeedURL({
      provider: "github",
      owner: "tingwensuojian",
      repo: "Resound-Player",
    });

    autoUpdater.on("checking-for-update", () => {
      log("checking-for-update");
      _state = { ..._state, status: Status.CHECKING, info: null, progress: null, error: null };
      broadcast();
    });

    autoUpdater.on("update-available", (info) => {
      log("update-available", info);
      _state = { ..._state, status: Status.AVAILABLE, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: null, error: null };
      broadcast();
    });

    autoUpdater.on("update-not-available", (info) => {
      log("update-not-available", info);
      _state = { ..._state, status: Status.NOT_AVAILABLE, info: { version: info.version, releaseDate: info.releaseDate }, progress: null, error: null };
      broadcast();
    });

    autoUpdater.on("download-progress", (progressObj) => {
      const p = { percent: Math.round(progressObj.percent * 10) / 10, bytesPerSecond: progressObj.bytesPerSecond, total: progressObj.total, transferred: progressObj.transferred };
      _state = { ..._state, status: Status.DOWNLOADING, progress: p, error: null };
      broadcast();
    });

    autoUpdater.on("update-downloaded", (info) => {
      log("update-downloaded", info);
      _state = { ..._state, status: Status.DOWNLOADED, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: { percent: 100, bytesPerSecond: 0, total: info.totalSize || 0, transferred: info.totalSize || 0 } };
      broadcast();
    });

    autoUpdater.on("error", (err) => {
      log("error", err.message);
      _state = { ..._state, status: Status.ERROR, error: err.message };
      broadcast();
    });

    _autoUpdater = autoUpdater;
  }
  return _autoUpdater;
}

// ── Public API ──

export function initUpdater(mainWindow) {
  _mainWindowRef = mainWindow;
  const updater = getAutoUpdater();
  log("initUpdater", { version: updater.currentVersion?.format() });
}

export function checkForUpdates() {
  log("checkForUpdates triggered by user");
  if (!app.isPackaged) {
    log("dev mode, skipping update check");
    _state = { ..._state, status: Status.NOT_AVAILABLE, info: null, progress: null, error: null };
    broadcast();
    return;
  }
  const updater = getAutoUpdater();
  const TIMEOUT_MS = 15000;
  const timer = setTimeout(() => {
    log("checkForUpdates timed out after " + TIMEOUT_MS + "ms");
    _state = { ..._state, status: Status.ERROR, error: "\u68c0\u67e5\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5" };
    broadcast();
  }, TIMEOUT_MS);
  updater.checkForUpdates().then(() => {
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
  const updater = getAutoUpdater();
  updater.downloadUpdate().catch((err) => {
    log("downloadUpdate failed", err);
    _state = { ..._state, status: Status.ERROR, error: err.message };
    broadcast();
  });
}

export function installUpdate() {
  log("installUpdate - calling quitAndInstall");
  const updater = getAutoUpdater();
  updater.quitAndInstall(true, true);
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
