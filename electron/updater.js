import { createRequire } from "node:module";
import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "child_process";
import https from "node:https";
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
let _updaterBusy = false;
let _giteeBusy = false;


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
  phase: null, // 'check' | 'download' | null
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
  _state.phase = 'check';
    });

    autoUpdater.on("update-available", (info) => {
      log("update-available", info);
      _state = { ..._state, status: Status.AVAILABLE, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: null, error: null };
      broadcast();
      // 自动下载更新（发现新版本后后台静默下载）
      downloadUpdate();
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
      _state = { ..._state, status: Status.DOWNLOADED, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: { percent: 100, bytesPerSecond: 0, total: info.totalSize || 0, transferred: info.totalSize || 0 }, downloadedFilePath: info.downloadedFile || null };
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


// ── Ensure app-update.yml exists ──
// electron-builder generates app-update.yml during build only when not using --publish never.
// When it is missing, electron-updater fails during downloadUpdate() because it needs
// updaterCacheDirName to create the download cache dir.
// This fallback creates a minimal config at runtime if the file is absent.
function ensureUpdateConfigFile() {
  const configPath = path.join(process.resourcesPath, "app-update.yml");
  if (fs.existsSync(configPath)) {
    return;
  }
  try {
    // updaterCacheDirName formula from app-builder-lib:
    // sanitizedName.toLowerCase() + "-updater"
    const updaterCacheDirName = "resound-player-updater";
    const config = {
      provider: "github",
      owner: "tingwensuojian",
      repo: "Resound-Player",
      updaterCacheDirName,
      releaseType: "release",
    };
    const yaml = Object.entries(config).map(([k, v]) => k + ": " + v).join("\n");
    fs.writeFileSync(configPath, yaml + "\n", "utf8");
    log("Created missing app-update.yml", { version: app.getVersion(), configPath });
  } catch (err) {
    log("Failed to create app-update.yml", err);
  }
}

// ── Public API ──

export function initUpdater(mainWindow) {
  _mainWindowRef = mainWindow;
  const updater = getAutoUpdater();
  log("initUpdater", { version: updater.currentVersion?.format() });
  ensureUpdateConfigFile();
  // 自动检测版本更新（启动后后台自动执行）
  checkForUpdates();
}

export async function checkForUpdates() {
  if (_updaterBusy) {
    log("checkForUpdates skipped: already busy");
    return;
  }
  _updaterBusy = true;
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
    log("checkForUpdates timed out -- falling back to Gitee...");
    _runGiteeFallback();
  }, TIMEOUT_MS);
  updater.checkForUpdates().then(() => {
    clearTimeout(timer);
    _updaterBusy = false;
  }).catch((err) => {
    clearTimeout(timer);
    log("checkForUpdates failed -- falling back to Gitee", err);
    _runGiteeFallback();
  });
}
export function downloadUpdate() {
  if (_updaterBusy && _state.status === Status.DOWNLOADING) {
    log("downloadUpdate skipped: Gitee download already in progress");
    return;
  }
  log("downloadUpdate triggered by user");
  const updater = getAutoUpdater();
  _state = { ..._state, status: Status.DOWNLOADING, phase: 'download' };
  broadcast();
  updater.downloadUpdate().catch((err) => {
    log("downloadUpdate failed", err);
    _state = { ..._state, status: Status.ERROR, error: err.message, phase: 'download' };
    broadcast();
  });
}

export function installUpdate() {
  log("installUpdate - calling quitAndInstall");
  const updater = getAutoUpdater();

  // Manual install: bypass Squirrel code signature validation
  const downloadedFile = _state.downloadedFilePath;
  if (downloadedFile && fs.existsSync(downloadedFile)) {
    log("Manual install from", downloadedFile);
    const appPath = app.getAppPath();
    const resolvedAppBundle = path.resolve(path.join(appPath, "..", "..", ".."));

    const installScript = path.join(os.tmpdir(), "resound-install.sh");
    const scriptContent = [
      '#!/bin/bash',
      'sleep 2',
      'TMP_DIR=$(mktemp -d)',
      'unzip -oq "' + downloadedFile.replace(/"/g, '\\"') + '" -d "$TMP_DIR" 2>/dev/null || true',
      'if [ -d "$TMP_DIR/Resound-Player.app" ]; then',
      '  rm -rf "' + resolvedAppBundle.replace(/"/g, '\\"') + '"',
      '  cp -Rf "$TMP_DIR/Resound-Player.app" "' + resolvedAppBundle.replace(/"/g, '\\"') + '" 2>/dev/null || true',
      'fi',
      'rm -rf "$TMP_DIR"',
      'open "' + resolvedAppBundle.replace(/"/g, '\\"') + '" || true',
      'rm -f "' + installScript.replace(/"/g, '\\"') + '"',
    ].join('\n');
    fs.writeFileSync(installScript, scriptContent, "utf8");
    fs.chmodSync(installScript, 0o755);
    log("Written install script at", installScript);

    
    spawn("/bin/bash", [installScript], { detached: true, stdio: "ignore" }).unref();

    log("Quitting app for manual install...");
    app.quit();
    return;
  }

  // Fallback to Squirrel
  updater.quitAndInstall(true, true);
}

function _runGiteeFallback() {
  if (_giteeBusy) {
    log("_runGiteeFallback skipped: Gitee already running");
    return;
  }
  _giteeBusy = true;
  doGiteeCheck().finally(() => {
    _giteeBusy = false;
    _updaterBusy = false;
  });
}


// ?? Gitee fallback helpers ??

const GITEE_OWNER = "tingwensuojian";
const GITEE_REPO = "Resound-Player";
const GITEE_DL = "https://gitee.com/" + GITEE_OWNER + "/" + GITEE_REPO + "/releases/download";

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Resound-Player/1.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error("Parse fail: " + data.slice(0, 100))); }
        } else {
          reject(new Error("Gitee API " + res.statusCode));
        }
      });
    }).on("error", reject);
  });
}

async function checkGiteeRelease() {
  const url = "https://gitee.com/api/v5/repos/" + GITEE_OWNER + "/" + GITEE_REPO + "/releases/latest";
  log("Gitee: checking", url);
  const rel = await httpsGet(url);
  const ver = rel.tag_name.replace(/^v/, "");
  const cur = app.getVersion();
  log("Gitee: found v" + ver + ", current v" + cur);
  const cmp = ver.localeCompare(cur, undefined, { numeric: true });
  if (cmp <= 0) return null;
  const isMac = process.platform === "darwin";
  const fname = isMac
    ? "Resound-Player-Mac-" + (process.arch === "arm64" ? "arm64" : "x64") + "-" + ver + ".dmg"
    : "Resound-Player Setup " + ver + ".exe";
  return { version: ver, tag: rel.tag_name, downloadUrl: GITEE_DL + "/" + rel.tag_name + "/" + fname, releaseDate: rel.created_at, releaseNotes: rel.body || "" };
}

function giteeDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let lastPct = 0, start = Date.now(), dl = 0;
    https.get(url, { headers: { "User-Agent": "Resound-Player/1.0" } }, (res) => {
      const total = parseInt(res.headers["content-length"] || "0", 10);
      res.on("data", d => {
        dl += d.length; file.write(d);
        if (total > 0) {
          const pct = Math.round(dl / total * 1000) / 10;
          if (pct !== lastPct) {
            lastPct = pct;
            _state = { ..._state, status: Status.DOWNLOADING, progress: { percent: pct, bytesPerSecond: Math.round(dl / ((Date.now() - start) / 1000 || 1)), total, transferred: dl }, error: null, phase: "download" };
            broadcast();
          }
        }
      });
      res.on("end", () => { file.end(); resolve(dest); });
    }).on("error", e => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

async function doGiteeCheck() {
  try {
    const info = await checkGiteeRelease();
    if (info) {
      log("Gitee: update available v" + info.version);
      _state = { ..._state, status: Status.AVAILABLE, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: null, error: null };
      broadcast();
      log("Gitee: auto-downloading...");
      _state = { ..._state, status: Status.DOWNLOADING, phase: "download" };
      broadcast();
      const tmp = path.join(app.getPath("temp"), "resound-gitee-update");
      if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
      const dest = path.join(tmp, path.basename(info.downloadUrl));
      await giteeDownload(info.downloadUrl, dest);
      log("Gitee: download complete", dest);
      _state = { ..._state, status: Status.DOWNLOADED, info: { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }, progress: { percent: 100, bytesPerSecond: 0, total: 0, transferred: 0 }, downloadedFilePath: dest };
      broadcast();
    } else {
      log("Gitee: no newer version");
      _state = { ..._state, status: Status.NOT_AVAILABLE, info: null, progress: null, error: null };
      broadcast();
    }
  } catch (err) {
    log("Gitee fallback failed", err);
    _state = { ..._state, status: Status.ERROR, error: err.message };
    broadcast();
  }
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

