import { BrowserWindow, ipcMain, screen, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// In dev:  ../../native/...  = work/native/...
// In prod: ../../native/... = resources/app.asar/native/...  (asarUnpack -> app.asar.unpacked/native/...)
// Fallback: ../../native/... = resources/native/...  (extraResources)
const ADDON_PATH = path.join(__dirname, '..', '..', 'native', 'taskbar-widget-helper', 'build', 'Release', 'taskbar_widget_helper.node');
const ADDON_PATH_FALLBACK = path.join(__dirname, '..', '..', '..', 'native', 'taskbar-widget-helper', 'build', 'Release', 'taskbar_widget_helper.node');
const CONFIG_FILE = path.join(app.getPath('userData'), 'taskbar-widget-config.json');

const DEFAULT_CONFIG = {
  enabled: false,
  widgetState: 'docked',
  freePosition: null,
  theme: 'system',
  width: 360,
  height: 48,
};

// Module state
let addon = null;
let config = { ...DEFAULT_CONFIG };
let widgetWin = null;
let shadowWin = null;
let tracker = null;
let dragHelper = null;
let hoverHelper = null;
let previewHelper = null;
let themeMonitor = null;
let isDragging = false;
let topmostTimer = null;
let latestSnapshot = null;

function loadAddon() {
  if (addon) return addon;
  // Try primary path (dev / asarUnpack)
  try {
    addon = require(ADDON_PATH);
    console.log('[taskbarWidget] Native addon loaded successfully from primary path');
    return addon;
  } catch (e1) {
    // Try fallback path (extraResources in packaged build)
    try {
      addon = require(ADDON_PATH_FALLBACK);
      console.log('[taskbarWidget] Native addon loaded successfully from fallback path');
      return addon;
    } catch (e2) {
      console.error('[taskbarWidget] Failed to load native addon (primary):', e1.message);
      console.error('[taskbarWidget] Failed to load native addon (fallback):', e2.message);
      return null;
    }
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      let raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    config = { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config), 'utf-8');
  } catch (e) {
  }
}

function getTaskbarBounds() {
  try {
    const pd = screen.getPrimaryDisplay();
    const { x: wx, y: wy, width: ww, height: wh } = pd.workArea;
    const { x: bx, y: by, width: bw, height: bh } = pd.bounds;
    if (wy > by) return { left: bx, top: by, right: bx + bw, bottom: wy, edge: 'top' };
    if (wh < bh) return { left: bx, top: wy + wh, right: bx + bw, bottom: by + bh, edge: 'bottom' };
    if (wx > bx) return { left: bx, top: by, right: wx, bottom: by + bh, edge: 'left' };
    if (ww < bw) return { left: wx + ww, top: by, right: bx + bw, bottom: by + bh, edge: 'right' };
    return { left: bx, top: wy + wh, right: bx + bw, bottom: by + bh, edge: 'bottom' };
  } catch (e) {
    return null;
  }
}

function calcDockPosition() {
  const tb = getTaskbarBounds();
  if (!tb) return null;
  const size = getWidgetSize();
  const w = size.width;
  const h = size.height;
  let gapLeft = tb.left + 2;
  let gapRight = tb.right - 2;
  if (tracker) {
    try {
      const blanks = tracker.findBlanks();
      if (blanks && blanks.candidates && blanks.candidates.length > 0) {
        const gap = blanks.candidates[0];
        const rightX = gap.x + gap.width - w - 2;
        const snapX = Math.max(gap.x, Math.min(rightX, gap.x + gap.width - w));
        const y = tb.edge === 'bottom' ? tb.top + Math.floor((tb.bottom - tb.top - h) / 2) : tb.bottom - h - Math.floor((tb.bottom - tb.top - h) / 2);
        return { x: snapX, y };
      }
      gapLeft = blanks.left || gapLeft;
      gapRight = blanks.right || gapRight;
    } catch (e) {
      console.error('[taskbarWidget] tracker.findBlanks error:', e.message);
    }
  }
  if (tracker) {
    try {
      var tbi = tracker.getTaskbarInfo();
      if (tbi && tbi.tray) {
        gapRight = Math.min(gapRight, tbi.tray.left - 2);
      }
      if (tbi && tbi.taskList) {
        gapLeft = Math.max(gapLeft, tbi.taskList.right + 2);
      }
    } catch (e) {}
  }
  const gapWidth = gapRight - gapLeft;
  let dockedX = gapWidth >= w ? Math.round(gapRight - w - 2) : Math.round(gapLeft);
  dockedX = Math.max(gapLeft, Math.min(dockedX, gapRight - w));
  const y = tb.edge === 'bottom' ? tb.top + Math.floor((tb.bottom - tb.top - h) / 2) : tb.bottom - h - Math.floor((tb.bottom - tb.top - h) / 2);
  return { x: dockedX, y };
}

function getWidgetSize() {
  const tb = getTaskbarBounds();
  return {
    width: config.width || 360,
    height: tb ? (tb.bottom - tb.top) : 48,
  };
}

function convertSnapshot(raw) {
  if (!raw) return null;
  var track = raw.currentTrack || raw.track;
  console.log('[taskbarWidget] convertSnapshot ALL fields:', JSON.stringify(raw?.currentTrack || raw?.track)); console.log('[taskbarWidget] convertSnapshot track.liked:', track?.liked, 'track.isLiked:', track?.isLiked, 'raw.liked:', raw.liked, 'id:', track?.id);
  var fullLyrics = raw.fullLyrics || [];
  var mediaDetail = raw.mediaDetail || null;
  if (!mediaDetail && fullLyrics.length > 0) {
    mediaDetail = {
      lyricInfo: {
        lyricData: {
          lines: fullLyrics.map(function(l) {
            return {
              time: l.time || 0,
              text: l.text || '',
              duration: l.duration || 3,
              words: (l.words || []).map(function(w) {
                return {
                  text: w.text || '',
                  startTime: w.startTime || 0,
                  duration: w.duration || 0,
                  space: Boolean(w.space),
                };
              }),
            };
          }),
        },
      },
    };
  }
  return {
    track: track ? {
      id: track.id,
      name: track.name || '',
      artist: track.artist || '',
      cover_url: track.cover_url || track.al?.picUrl || track.picUrl || track.cover || '',
      duration: track.duration || 0,
    } : null,
    mediaDetail: mediaDetail,
    playing: raw.isPlaying || false,
    currentTime: raw.currentTime || 0,
    duration: raw.duration || 0,
    liked: track ? Boolean(track.liked || track.isLiked) : false,
    fullLyrics: fullLyrics,
    miniWords: raw.miniWords || 0,
    miniLyric: raw.miniLyric || '',
  };
}

function syncPlaybackState() {
  if (widgetWin && !widgetWin.isDestroyed() && latestSnapshot) {
    try {
      var _snap2 = convertSnapshot(latestSnapshot); console.log('[taskbarWidget] sending playback:state liked:', _snap2.liked, 'name:', _snap2.track?.name); widgetWin.webContents.send('playback:state', _snap2);
    } catch (e) {
    }
  }
}

function positionWidget(x, y) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.setPosition(x, y);
}

function showWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.showInactive();
  if (addon) {
    try {
      const hwndBuf = widgetWin.getNativeWindowHandle();
      addon.ensureAboveTaskbar(hwndBuf);
    } catch (e) {}
  }
}

function hideShadow() {
  if (shadowWin && !shadowWin.isDestroyed()) {
    try { shadowWin.webContents.send('taskbar-widget:shadow-snap-stage', 'none'); } catch (e) {}
    shadowWin.hide();
  }
}

function showShadow(pos, size, stage) {
  if (!shadowWin || shadowWin.isDestroyed()) return;
  stage = stage || 'hint';
  const x = pos.x, y = pos.y;
  shadowWin.setBounds({ x, y, width: size.width, height: size.height });
  if (!shadowWin.isVisible()) shadowWin.showInactive();
  shadowWin.setAlwaysOnTop(true, 'screen-saver');
  try {
    shadowWin.webContents.send('taskbar-widget:shadow-snap-stage', stage);
    console.log('[taskbarWidget] IPC send shadow-snap-stage:', stage);
  } catch (e) {
    console.log('[taskbarWidget] IPC send FAILED:', e.message);
  }
  if (addon) {
    try { addon.ensureAboveTaskbar(shadowWin.getNativeWindowHandle()); } catch (e) {}
  }
}

function startTopmostTimer() {
  stopTopmostTimer();
  if (!widgetWin || widgetWin.isDestroyed() || !addon) return;
  try {
    topmostTimer = setInterval(function() {
      if (widgetWin && !widgetWin.isDestroyed()) {
        try { addon.ensureAboveTaskbar(widgetWin.getNativeWindowHandle()); } catch (e) {}
      }
      // Shadow visibility managed by showShadow/hideShadow —topmost timer must not re-show it
    }, 1000);
  } catch (e) {}
}

function updateLikeStatus(liked) {
  if (widgetWin && !widgetWin.isDestroyed()) {
    try { widgetWin.webContents.send('taskbar-widget:like-status', Boolean(liked)); } catch (e) {}
  }
}

function stopTopmostTimer() {
  if (topmostTimer) {
    clearInterval(topmostTimer);
    topmostTimer = null;
  }
}

async function createWidgetWindow() {
  console.log('[taskbarWidget] createWidgetWindow()');
  // Create tracker early so calcDockPosition can use findBlanks()
  if (addon && !tracker) {
    try { tracker = new addon.Tracker(); } catch (e) { console.error('[taskbarWidget] Failed to create tracker early:', e.message); }
  }
  const size = getWidgetSize();
  const pos = calcDockPosition();

  widgetWin = new BrowserWindow({
    width: size.width,
    height: size.height,
    transparent: true,
    frame: false,
    resizable: false,
    title: 'Resound-Player Widget',
    focusable: false,
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'taskbar-widget-preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWin.on('closed', function() {
    widgetWin = null;
    isDragging = false;
  });

  const url = process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL + '/taskbar-widget.html'
    : path.join(__dirname, '..', '..', 'dist', 'public', 'taskbar-widget.html');
  try {
    await widgetWin.loadURL(url);
  } catch (e) {
    console.error('[taskbarWidget] Failed to load widget URL:', e.message);
    try { await widgetWin.loadURL(url); } catch (e2) {
      console.error('[taskbarWidget] Retry failed:', e2.message);
      widgetWin = null;
      return false;
    }
  }

  if (pos) {
    positionWidget(pos.x, pos.y);
  }

  // Only open DevTools in dev mode
  if (process.env.VITE_DEV_SERVER_URL) {
    widgetWin.webContents.openDevTools({ mode: 'detach' });
  }
  if (addon) {
    try {
      const hwndBuf = widgetWin.getNativeWindowHandle();
      addon.setWidgetStyles(hwndBuf);
      addon.embedInTaskbar(hwndBuf);
      try { addon.setOwner(hwndBuf); } catch (e) {}
      dragHelper = new addon.DragHelper(hwndBuf);
      hoverHelper = new addon.HoverHelper(hwndBuf);
      themeMonitor = new addon.ThemeMonitor();
      addon.installPreventHide(hwndBuf);

      dragHelper.onDragStart(function() {
        console.log('[taskbarWidget] DRAG START');
        isDragging = true;
        if (config.widgetState === 'docked') {
          console.log('[taskbarWidget] DRAG START - removing from taskbar');
          config.widgetState = 'free';
          sendConfigToWidget();
          try { addon.removeFromTaskbar(widgetWin.getNativeWindowHandle()); } catch (e) { console.error('[taskbarWidget] removeFromTaskbar on drag start failed:', e.message); }
        }
      });

      dragHelper.onDragMove(function(newX, newY) {
        if (!isDragging) return;
        console.log('[taskbarWidget] DRAG MOVE raw:', newX, newY);
        var tb = getTaskbarBounds();
        if (tb) {
          var screenX = newX;
          var screenY = newY;
          var size2 = getWidgetSize();
          var HINT_THRESHOLD = 300;
          var SNAP_THRESHOLD = 60;
          var isOverTaskbar = false;
          var distToTaskbar = Infinity;
          if (tb.edge === 'bottom') {
            isOverTaskbar = screenX + size2.width > tb.left && screenX < tb.right;
            distToTaskbar = Math.abs(screenY - tb.top);
          } else if (tb.edge === 'top') {
            isOverTaskbar = screenX + size2.width > tb.left && screenX < tb.right;
            distToTaskbar = Math.abs(screenY + size2.height - tb.bottom);
          }
          var docked = calcDockPosition();
          if (distToTaskbar < SNAP_THRESHOLD && isOverTaskbar) {
          
            console.log("[taskbarWidget] SHOW CONFIRM shadow, screenPos:", screenX, screenY, "dist:", distToTaskbar, "docked:", JSON.stringify(docked));
            if (docked) { showShadow(docked, size2, "confirm"); } else { console.log("[taskbarWidget] docked null on confirm"); }
          } else if (distToTaskbar < HINT_THRESHOLD && isOverTaskbar) {
            console.log("[taskbarWidget] SHOW HINT shadow, dist:", distToTaskbar, "docked:", JSON.stringify(docked));
            if (docked) { showShadow(docked, size2, "hint"); } else { console.log("[taskbarWidget] docked null on hint"); }
          } else {
            console.log("[taskbarWidget] HIDE shadow, dist:", distToTaskbar, "isOverTaskbar:", isOverTaskbar);
            hideShadow();
          }
        }
      });

      dragHelper.onDragEnd(function(endX, endY) {
        console.log('[taskbarWidget] DRAG END raw:', endX, endY);
        isDragging = false;
        hideShadow();
        var tb = getTaskbarBounds();
        if (tb) {
          var screenX = endX;
          var screenY = endY;
          var size2 = getWidgetSize();
          var SNAP_THRESHOLD = 60;
          var shouldSnap = false;
          if (tb.edge === 'bottom') {
            shouldSnap = Math.abs(screenY - tb.top) < SNAP_THRESHOLD && screenX + size2.width > tb.left && screenX < tb.right;
          } else if (tb.edge === 'top') {
            shouldSnap = Math.abs(screenY + size2.height - tb.bottom) < SNAP_THRESHOLD && screenX + size2.width > tb.left && screenX < tb.right;
          }
          if (shouldSnap) {
            console.log('[taskbarWidget] SNAP ON END');
            config.widgetState = 'docked';
            config.freePosition = null;
            var docked = calcDockPosition();
            if (docked) {
              positionWidget(docked.x, docked.y);
              try {
                var hwndBuf = widgetWin.getNativeWindowHandle();
                if (addon) { addon.embedInTaskbar(hwndBuf); try { addon.setOwner(hwndBuf); } catch (e) {} addon.ensureAboveTaskbar(hwndBuf); }
              } catch (e) {}
            }
          } else {
            config.widgetState = 'free';
            config.freePosition = { x: screenX, y: screenY };
            try { var hwndBuf = widgetWin.getNativeWindowHandle(); if (addon) addon.removeFromTaskbar(hwndBuf); } catch (e) {}
          }
          saveConfig();
          sendConfigToWidget();
        }
      });

      hoverHelper.onHoverChange(function(isHovering) {
        if (widgetWin && !widgetWin.isDestroyed()) {
          try { widgetWin.webContents.send('taskbar-widget:hover-changed', isHovering); } catch (e) {}
        }
      });

      hoverHelper.onDragRegionChange(function(inDragRegion) {
        if (widgetWin && !widgetWin.isDestroyed()) {
          try { widgetWin.webContents.send('taskbar-widget:drag-region-changed', inDragRegion); } catch (e) {}
        }
      });

      const initialTheme = themeMonitor.getTheme();
      sendThemeToWidget(initialTheme);
    } catch (e) {
      console.error('[taskbarWidget] Addon setup error:', e.message);
    }
  }

  startTopmostTimer();
  showWidget();
  syncPlaybackState();
  sendConfigToWidget();
  return true;
}

async function createShadowWindow() {
  const size = getWidgetSize();
  const tb = getTaskbarBounds();
  const winH = size.height;

  shadowWin = new BrowserWindow({
    width: size.width,
    height: winH,
    transparent: true,
    frame: false,
    resizable: false,
    title: 'Resound-Player Snap',
    focusable: false,
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'taskbar-widget-shadow-preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shadowWin.on('closed', function() { shadowWin = null; });

  const shadowHtml = '<html><head><style>body{margin:0;overflow:hidden;width:100%;height:100%;background:transparent;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Helvetica,PingFang SC,sans-serif;}.shadow-indicator{position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;color-scheme:light;}.shadow-indicator[data-stage=confirm]{background:light-dark(rgba(0,0,0,0.08),rgba(255,255,255,0.06));border:1px solid light-dark(rgba(0,0,0,0.12),rgba(255,255,255,0.08));}.shadow-indicator[data-theme=dark]{color-scheme:dark;}.outline{position:absolute;inset:2px;border:1.5px dashed currentColor;border-radius:4px;opacity:0.5;pointer-events:none;}.shadow-indicator[data-stage=confirm] .outline{opacity:0.8;}.hint-text,.confirm-text{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);white-space:nowrap;font-size:13px;font-weight:600;color:light-dark(rgba(0,0,0,0.6),rgba(255,255,255,0.6));opacity:0;transition:opacity 0.15s ease;}.shadow-indicator[data-stage=hint] .hint-text{opacity:1;}.shadow-indicator[data-stage=confirm] .confirm-text{opacity:1;color:light-dark(rgba(0,0,0,0.85),rgba(255,255,255,0.85));}</style></head><body><div class=\"shadow-indicator\" id=\"indicator\" data-stage=\"hint\" data-theme=\"light\"><div class=\"outline\"></div><span class=\"hint-text\" id=\"hintText\">\u79fb\u52a8\u5230\u6b64\u5904\u5438\u9644\u81f3\u4efb\u52a1\u680f</span><span class=\"confirm-text\" id=\"confirmText\">\u677e\u624b\u5438\u9644</span></div><script>document.addEventListener(\"DOMContentLoaded\",function(){var ind=document.getElementById(\"indicator\");var sw=window.widgetEnv&&window.widgetEnv.shadow;if(!sw)return;sw.onSnapStage(function(s){ind.dataset.stage=s;});sw.onThemeChanged(function(d){ind.dataset.theme=d?\"dark\":\"light\"});sw.rendererReady();});</script></html>';

  try {
    await shadowWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(shadowHtml));
    console.log('[taskbarWidget] Shadow window loaded, size:', JSON.stringify(size));
  } catch (e) {
    console.error('[taskbarWidget] Failed to load shadow win:', e.message);
  }
}

function sendConfigToWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    try { widgetWin.webContents.send('taskbar-widget:config-changed', { ...config }); } catch (e) {}
  }
}

function sendThemeToWidget(theme) {
  const isDark = theme === 'dark';
  if (widgetWin && !widgetWin.isDestroyed()) {
    try { widgetWin.webContents.send('taskbar-widget:theme-changed', isDark); } catch (e) {}
  }
  if (shadowWin && !shadowWin.isDestroyed()) {
    try { shadowWin.webContents.send('taskbar-widget:theme-changed', isDark); } catch (e) {}
  }
}

function destroyAll() {
  stopTopmostTimer();
  if (widgetWin && !widgetWin.isDestroyed() && addon) {
    try {
      const hwndBuf = widgetWin.getNativeWindowHandle();
      addon.removeFromTaskbar(hwndBuf);
      addon.removePreventHide(hwndBuf);
    } catch (e) { }
  }
  if (dragHelper) { try { dragHelper.destroy(); } catch (e) {} dragHelper = null; }
  if (hoverHelper) { try { hoverHelper.destroy(); } catch (e) {} hoverHelper = null; }
  if (previewHelper) { try { previewHelper.destroy(); } catch (e) {} previewHelper = null; }
  if (tracker) { try { tracker.destroy(); } catch (e) {} tracker = null; }
  if (themeMonitor) { try { themeMonitor.destroy(); } catch (e) {} themeMonitor = null; }
  if (shadowWin && !shadowWin.isDestroyed()) {
    try { shadowWin.close(); } catch (e) {}
    shadowWin = null;
  }
  if (widgetWin && !widgetWin.isDestroyed()) {
    try { widgetWin.close(); } catch (e) {}
    widgetWin = null;
  }
  isDragging = false;
}

// --- Public API ---

export function init() {
  loadAddon();
  loadConfig();
  console.log('[taskbarWidget] Service initialized. Enabled:', config.enabled);
  if (config.enabled) {
    setImmediate(function() { enable(); });
  }
}

export function setEnabled(enabled) {
  config.enabled = Boolean(enabled);
  saveConfig();
  if (enabled) {
    enable();
  } else {
    disable();
  }
}

export async function enable() {
  console.log('[taskbarWidget] enable() called, widgetWin exists:', !!widgetWin);
  // Try to load native addon, but proceed even if it fails (widget works degraded)
  if (!addon) {
    loadAddon();
    if (!addon) {
      console.warn('[taskbarWidget] Native addon not available, widget will work in degraded mode');
    }
  }
  if (widgetWin && !widgetWin.isDestroyed()) {
    showWidget();
    return;
  }
  await createShadowWindow();
  await createWidgetWindow();
}

export function disable() {
  destroyAll();
}

export function getConfig() {
  return { ...config };
}

export function setConfig(cfg) {
  Object.assign(config, cfg);
  saveConfig();
  sendConfigToWidget();
}

let latestConvertedSnapshot = null;

export function getLatestConvertedSnapshot() {
  return latestConvertedSnapshot;
}

export function updatePlaybackSnapshot(snapshot) {
  latestSnapshot = snapshot;
  latestConvertedSnapshot = convertSnapshot(snapshot);
  syncPlaybackState();
}

// --- IPC Registration ---

export function registerIpc() {
  ipcMain.on('taskbar-widget:renderer-ready', function(_event, role) {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    syncPlaybackState();
    sendConfigToWidget();
  });

  ipcMain.handle('taskbar-widget:get-config', function() {
    return { ...config };
  });

  ipcMain.handle('taskbar-widget:set-config', function(_event, cfg) {
    setConfig(cfg);
  });

  ipcMain.handle('taskbar-widget:set-enabled', async function(_event, enabled) {
    setEnabled(enabled);
  });

  ipcMain.on('taskbar-widget:close', function() {
    disable();
  });

  ipcMain.handle('taskbar-widget:get-initial-snapshot', function() {
    return getLatestConvertedSnapshot();
  });

  ipcMain.on('taskbar-widget:renderer-log', function(_event, payload) {
    try {
      console.log('[widget:' + payload.role + ']', payload.message, typeof payload.data === 'undefined' ? '' : payload.data);
    } catch (e) { }
  });

  ipcMain.on('taskbar-widget:playback-command', function(_event, command) {
    if (command && command.type === 'openExpanded') {
      const wins = BrowserWindow.getAllWindows();
      const mainWin = wins.find(function(w) { return w.title && w.title.includes('Resound'); });
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        if (!mainWin.isVisible()) mainWin.show();
        mainWin.focus();
      }
    }
    const wins = BrowserWindow.getAllWindows();
    const firstWin = wins.find(function(w) { return !w.isDestroyed() && w.title !== 'Resound-Player Widget' && w.title !== 'Resound-Player Snap'; });
    if (firstWin && !firstWin.isDestroyed()) {
      try { firstWin.webContents.send('playback:command', command); } catch(e) {}
    }
  });

  ipcMain.on('taskbar-widget:begin-track-drag', function() {
    if (!widgetWin || widgetWin.isDestroyed() || !addon) return;
    try {
      addon.removeFromTaskbar(widgetWin.getNativeWindowHandle());
      isDragging = true;
      addon.startWindowDrag(widgetWin.getNativeWindowHandle());
    } catch (e) {
      console.error('[taskbarWidget] startWindowDrag error:', e.message);
    }

  });
  ipcMain.on('taskbar-widget:like-status', function(_event, liked) {
    updateLikeStatus(liked);
  });

  ipcMain.handle('taskbar-widget:get-taskbar-info', function() {
    const tb = getTaskbarBounds();
    return { taskbar: tb, layout: null };
  });

}








