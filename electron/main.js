import { app, BrowserWindow, Menu, ipcMain, protocol, screen, Tray, nativeImage } from 'electron';
import { init as initTaskbarWidget, registerIpc as registerTaskbarWidgetIpc, enable as enableTaskbarWidget, disable as disableTaskbarWidget, setEnabled as setTaskbarWidgetEnabled, getConfig as getTaskbarWidgetConfig, updatePlaybackSnapshot as updateTaskbarWidgetSnapshot } from './services/taskbarWidgetService.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveServicePorts } from './port-manager.js';
import { startAllServices, waitApiReady, killAllServices } from './serviceManager.js';
import { LocalMusicDB } from './services/db/LocalMusicDB.js';
import { NodeMusicScanner } from './services/scanner/NodeMusicScanner.js';
import { registerLocalMusicIpc } from './services/ipc/localMusicIpc.js';
import { loadTrayLyricConfig, getTrayLyricConfig, setTrayLyricConfig } from './tray-lyric-store.js';
import { runWavMetadataE2E } from './wav-metadata-e2e.js';
import zlib from 'node:zlib';
import { initNativeUnblockMatch, isNativeUnblockMatchReady, nativeUnblockMatchSong } from './unblock-native-match.js';
import { initUpdater, registerUpdaterIpc } from './updater.js';
import { createRequire } from 'node:module';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainLogFile = path.join(os.tmpdir(), 'resound-player-main.log');

function writeMainLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((part) => {
    if (part instanceof Error) return `${part.name}: ${part.message}\n${part.stack || ''}`;
    if (typeof part === 'string') return part;
    try { return JSON.stringify(part); } catch { return String(part); }
  }).join(' ')}\n`;
  try {
    fs.appendFileSync(mainLogFile, line, 'utf8');
  } catch {
    // ignore
  }
}

// Native addon for Win32 window activation (no topmost band flicker)
const _require = createRequire(import.meta.url);
const NATIVE_ADDON_PATH = path.join(__dirname, '..', 'native', 'taskbar-widget-helper', 'build', 'Release', 'taskbar_widget_helper.node');
let nativeAddon = null;
try {
  nativeAddon = _require(NATIVE_ADDON_PATH);
  writeMainLog('[native] addon loaded for window activation');
} catch (e) {
  writeMainLog('[native] addon not available', e.message);
}

writeMainLog('[module-load]', {
  platform: process.platform,
  cwd: process.cwd(),
  execPath: process.execPath,
  resourcesPath: process.resourcesPath,
  argv: process.argv,
});

app.commandLine.appendSwitch('no-sandbox');

// ── GPU 硬件加速标志 ──
// 启用 GPU 光栅化：将 CSS/图像光栅化从 CPU 移入 GPU，减少主线程负担
app.commandLine.appendSwitch('enable-gpu-rasterization');
// 启用 Skia GPU 渲染器：Chromium 默认 GPU 渲染后端
app.commandLine.appendSwitch('enable-features', 'UseSkiaRenderer');
// Windows/Linux 启用 Vulkan 后端（如果可用），替代 OpenGL
if (process.platform !== 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
}

if (process.env.RESOUND_WAV_METADATA_E2E === '1') {
  app.whenReady().then(() => runWavMetadataE2E(app)).catch((err) => {
    console.error('[wav-metadata-e2e]', err);
    app.exit(1);
  });
}

// ── 全局 EPIPE 保护：stdout/stderr 关闭后 console.log 不会崩溃 ──
process.on('uncaughtException', (err) => {
  writeMainLog('[uncaughtException]', err);
  if (err && (err.code === 'EPIPE' || err.message?.includes('EPIPE'))) return;
  console.error('[uncaught]', err);
});

// ── 中文应用菜单 ──
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    {
      label: '文件',
      submenu: [
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
          click: () => setWindowFullscreen(!isWindowFullscreen()),
        },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front', label: '全部置于顶层' },
        ] : [{ role: 'close', label: '关闭' }]),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 Resound-Player',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'info',
              title: '关于 Resound-Player',
              message: 'Resound-Player v0.1.0',
              detail: '基于 NeteaseCloudMusicApi 的跨平台音乐播放器',
            });
          },
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

let serviceChildren = {};
let win = null;
let miniWin = null;
let splashWin = null;
let currentServicePorts = {};
let latestPlaybackSnapshot = null;

function isWindowFullscreen() {
  if (!win || win.isDestroyed()) return false;
  if (process.platform === 'darwin') return win.isSimpleFullScreen();
  return win.isFullScreen();
}

function setWindowFullscreen(fullscreen) {
  if (!win || win.isDestroyed()) return;
  if (process.platform === 'darwin') {
    win.setSimpleFullScreen(fullscreen);
  } else {
    win.setFullScreen(fullscreen);
  }
  win.webContents.send('win-fullscreen-change', fullscreen);
}

function applyMiniAlwaysOnTopToWindow(targetWindow, enabled) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  if (enabled) {
    if (process.platform === 'darwin') {
      targetWindow.setAlwaysOnTop(true, 'floating');
      targetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      targetWindow.setAlwaysOnTop(true);
    }
    return;
  }

  targetWindow.setAlwaysOnTop(false);
  if (process.platform === 'darwin') {
    targetWindow.setVisibleOnAllWorkspaces(false);
  }
}

function restoreMainWindowFromMiniMode() {
  if (!win || win.isDestroyed()) return null;

  if (preMiniState) {
    const { x, y, width, height, isMaximized, wasFullScreen } = preMiniState;
    preMiniState = null;

    win.webContents.send('mini-mode:state-change', false);
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send('mini-mode:state-change', false);
      applyMiniAlwaysOnTopToWindow(miniWin, false);
      miniWin.close();
      miniWin = null;
    }

    win.setBounds({ x, y, width, height });
    if (wasFullScreen) {
      win.setFullScreen(true);
    } else if (isMaximized) {
      win.maximize();
    }
  }

  win.show();
  win.focus();
  return win;
}

function enterMiniMode(alwaysOnTop = false) {
  if (!win || win.isDestroyed() || preMiniState) return false;

  preMiniState = {
    x: win.getPosition()[0],
    y: win.getPosition()[1],
    width: win.getSize()[0],
    height: win.getSize()[1],
    isMaximized: win.isMaximized(),
    wasFullScreen: win.isFullScreen(),
  };

  function openMiniWindow() {
    const targetMiniWin = createMiniWindow(currentServicePorts);
    applyMiniAlwaysOnTopToWindow(targetMiniWin, !!alwaysOnTop);
    targetMiniWin.once('ready-to-show', () => {
      // Open DevTools early (dev mode only) but defer show/focus until renderer confirms auth
      if (process.env.VITE_DEV_SERVER_URL) targetMiniWin.webContents.openDevTools({ mode: 'detach' });
    });
    if (targetMiniWin.isVisible()) targetMiniWin.focus();
    win.hide();
    win.webContents.send('mini-mode:state-change', true);
    setTrayMenu(win);
  }

  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => {
      openMiniWindow();
    });
    win.setFullScreen(false);
  } else {
    openMiniWindow();
  }

  return true;
}

function toggleMiniModeFromTray() {
  if (preMiniState) {
    restoreMainWindowFromMiniMode();
    setTrayMenu(win);
    return;
  }
  enterMiniMode(false);
}

function dispatchMainWindowTrayAction(action) {
  const target = restoreMainWindowFromMiniMode();
  if (!target || target.isDestroyed()) return;
  target.webContents.send('tray-action', action);
}

/**
 * 设置中文菜单
 */
function setupChineseMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS 应用菜单（手动中文定义）
    ...(isMac ? [{
      label: 'Resound-Player',
      submenu: [
        {
          label: '关于 Resound-Player',
          click: async () => {
            const { dialog } = await import('electron');
            dialog.showMessageBox({
              type: 'info',
              title: '关于 Resound-Player',
              message: 'Resound-Player',
              detail: '基于 NeteaseCloudMusicApi 的跨平台音乐播放器\n版本 ' + app.getVersion(),
            });
          },
        },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Resound-Player' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Resound-Player' },
      ],
    }] : []),

    // 文件
    {
      label: '文件',
      submenu: [
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },

    // 编辑
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },

    // 视图
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
          click: () => setWindowFullscreen(!isWindowFullscreen()),
        },
      ],
    },

    // 窗口
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        ...(isMac ? [
          { role: 'zoom', label: '缩放' },
          { type: 'separator' },
          { role: 'front', label: '全部置于顶层' },
        ] : [
          { role: 'close', label: '关闭' },
        ]),
      ],
    },

    // 帮助
    {
      label: '帮助',
      submenu: [],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Create the main window with all service ports passed to preload.
 */
async function createMainWindow(ports) {
  const preloadPath = path.join(__dirname, 'preload.js');

  // Serialize port map into additionalArguments for preload
  const portArgs = [
    `--service-ports=${JSON.stringify(ports)}`,
    '--window-role=main',
  ];

  const isMac = process.platform === 'darwin';

  const iconPath = path.join(__dirname, '..', 'build', isMac ? 'icon.png' : 'icon.png');

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#1a1a2e',
    icon: iconPath,
    // macOS: 常态显示原生红绿灯，并保留自定义内容区
    // titleBarStyle: 'hidden' → 隐藏原生标题文字/横条，红绿灯保持常态可见
    // trafficLightPosition → 避开自定义顶部栏内容
    // 其他平台：frame: false → 无边框，依赖自定义控件
    ...(isMac
      ? { frame: false, titleBarStyle: 'hidden', trafficLightPosition: { x: 20, y: 14 } }
      : { frame: false }
    ),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: portArgs,
    },
  });

  // 内容准备就绪后再显示窗口，避免 resize 时因 GPU 效果滞后导致卡顿
  win.once('ready-to-show', () => {
    closeSplashWindow();
    if (process.env.VITE_DEV_SERVER_URL) win.webContents.openDevTools({ mode: 'detach' });
    win.show();
    if (process.platform === 'darwin') win.setAlwaysOnTop(false);
  });
 // 拦截关闭按钮（仅 Windows）：最小化到任务栏而非销毁
 if (process.platform !== 'darwin') {
   win.on('close', (event) => {
     if (!app.isQuitting()) {
       event.preventDefault();
       win.minimize();
     }
   });
 }
  if (process.platform === 'darwin') {
    win.on('focus', () => win.setAlwaysOnTop(false));
  }

  // 向渲染进程广播窗口最大化状态变更（供右上角自定义按钮切换图标）
  win.on('maximize', () => {
    win.webContents.send('win-state-change', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('win-state-change', false);
  });

  // 向渲染进程广播窗口全屏状态变更（供播放页全屏按钮与 macOS 原生红绿灯链路同步）
  win.on('enter-full-screen', () => {
    win.webContents.send('win-fullscreen-change', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('win-fullscreen-change', false);
  });
  win.on('enter-html-full-screen', () => {
    win.webContents.send('win-fullscreen-change', true);
  });
  win.on('leave-html-full-screen', () => {
    win.webContents.send('win-fullscreen-change', false);
  });

  // 窗口控制：通过 page-title-updated 事件监听 document.title 变更
  // 必须在 loadURL 之前注册，确保从页面加载初期就能捕获标题变更
  let _originalTitle = '';
  win.webContents.on('page-title-updated', (event, title) => {
    if (title.startsWith('cmd:')) {
      event.preventDefault();
      const cmd = title.split(':')[1];
      if (cmd === 'minimize') {
        win.minimize();
      } else if (cmd === 'restore') {
        win.unmaximize();
      } else if (cmd === 'maximize') {
        // frameless 窗口二次最大化修复：先重置 maximizable 再调用 maximize
        win.setMaximizable(true);
        win.maximize();
      } else if (cmd === 'fullscreen-enter') {
        setWindowFullscreen(true);
      } else if (cmd === 'fullscreen-leave') {
        setWindowFullscreen(false);
      }
      // 延迟恢复原标题，确保 macOS 窗口动画（~350ms）完成后再重置
      setTimeout(() => {
        if (!win.isDestroyed()) win.setTitle(_originalTitle || 'Resound-Player');
      }, 500);
    } else {
      _originalTitle = title;
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
  // P1: Auto-retry when Vite is not ready yet (dev mode)
  if (process.env.VITE_DEV_SERVER_URL) {
    let failRetries = 0;
    const MAX_FAIL_RETRIES = 10;
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      if (failRetries >= MAX_FAIL_RETRIES) return;
      failRetries++;
      const delay = Math.min(1000 * Math.pow(1.5, failRetries - 1), 10000);
      console.log('[main] loadURL failed (' + errorDescription + '), retry ' + failRetries + '/' + MAX_FAIL_RETRIES + ' in ' + delay + 'ms');
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.loadURL(process.env.VITE_DEV_SERVER_URL).catch(function(e) {
            console.error('[main] loadURL retry failed:', e.message);
          });
        }
      }, delay);
    });
  }
    await win.loadURL(process.env.VITE_DEV_SERVER_URL).catch(function(e) { console.error('[main] initial loadURL failed:', e.message); });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function getMiniWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workAreaSize;
  const miniWidth = 340;
  const miniHeight = 70;
  const margin = 20;
  return {
    x: screenWidth - miniWidth - margin,
    y: margin,
    width: miniWidth,
    height: miniHeight,
  };
}

function createMiniWindow(ports) {
  if (miniWin && !miniWin.isDestroyed()) return miniWin;

  const preloadPath = path.join(__dirname, 'preload.js');
  const portArgs = [
    `--service-ports=${JSON.stringify(ports)}`,
    '--window-role=mini',
  ];
  const bounds = getMiniWindowBounds();
  const isMac = process.platform === 'darwin';

  miniWin = new BrowserWindow({
    minWidth: 340,
    minHeight: 70,
    maxWidth: 340,
    maxHeight: 500,
    resizable: false,
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: -100, y: -100 } : undefined,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: portArgs,
    },
  });

  // Set content area before loading — must toggle resizable for the size to stick on Windows
  miniWin.setResizable(true);
  miniWin.setContentSize(bounds.width, bounds.height);
  miniWin.setPosition(bounds.x, bounds.y);
  miniWin.setResizable(false);
  writeMainLog('[mini] createMiniWindow after setContentSize', miniWin.getSize());

  miniWin.on('closed', () => {
    miniWin = null;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    miniWin.loadURL(`${devServerUrl.replace(/\/$/, '')}/mini.html`).catch(function(e) { console.error('[mini] loadURL failed:', e.message); });
  } else {
    miniWin.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
  }

  return miniWin;
}

/**
 * Show an error window when startup fails.
 */
async function createErrorWindow(errorMessage) {
  writeMainLog('[createErrorWindow]', errorMessage);
  console.error('[main] 启动失败:', errorMessage);

  const errorWin = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>启动失败</title>
<style>
body{font-family:-apple-system,sans-serif;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#fff}
.container{text-align:center;max-width:480px}
h1{font-size:22px;margin-bottom:16px}
p{color:rgba(255,255,255,0.65);line-height:1.6;font-size:14px}
.btn{margin-top:20px;padding:8px 24px;border:none;border-radius:6px;background:#e74c3c;color:#fff;cursor:pointer}
</style></head><body>
<div class="container">
<h1>⚠️ 应用启动失败</h1>
<p>${errorMessage.replace(/\n/g, '<br>')}</p>
<button class="btn" onclick="window.close()">退出</button>
</div></body></html>`;

  await errorWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  errorWin.show();
  closeSplashWindow();
  errorWin.on('closed', () => app.quit());
}

var SPLASH_MIN_MS = 2800; // Minimum display time to let progress bar animation finish
var splashShownAt = 0;

function showSplashWindow() {
  console.log('[splash] Creating splash window...');
  writeMainLog('[splash] Creating splash window');
  splashWin = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    frame: false,
    show: false,
    backgroundColor: '#121317',
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: false },
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html')).catch(function(e) {
    writeMainLog('[splash] loadFile error:', e.message);
  });
  splashWin.webContents.on('did-fail-load', function(e, code, desc) {
    writeMainLog('[splash] did-fail-load:', code, desc);
  });
  splashWin.once('ready-to-show', () => {
    writeMainLog('[splash] ready-to-show');
    splashShownAt = Date.now();
    splashWin.show();
  });
  splashWin.on('closed', () => { splashWin = null; });
}

function closeSplashWindow() {
  if (!splashWin || splashWin.isDestroyed()) return;
  var elapsed = Date.now() - splashShownAt;
  var remaining = SPLASH_MIN_MS - elapsed;
  if (remaining > 0) {
    // Let the progress bar animation finish before closing
    setTimeout(function() {
      if (splashWin && !splashWin.isDestroyed()) {
        splashWin.close();
        splashWin = null;
      }
    }, remaining);
  } else {
    splashWin.close();
    splashWin = null;
  }
}

async function bootstrap() {
  writeMainLog('[bootstrap] start');
  console.log('[main] 应用启动中...');
  console.log('[main] 平台:', process.platform, 'cwd:', process.cwd());

  // 设置中文菜单
  Menu.setApplicationMenu(buildAppMenu());

  // ── In dev mode, ports may already be pre-resolved ──
  // When started via scripts/start-desktop.mjs, SERVICE_PORTS env is set.
  // In production (packaged app), we resolve ports here.
  let ports;
  if (process.env.SERVICE_PORTS) {
    try {
      ports = JSON.parse(process.env.SERVICE_PORTS);
      console.log('[main] 使用外部已探测端口:', ports);
    } catch {
      ports = null;
    }
  }

  if (!ports) {
    try {
      ports = await resolveServicePorts();
      writeMainLog('[bootstrap] resolved ports', ports);
      console.log('[main] 自动探测端口:', ports);
    } catch (err) {
      writeMainLog('[bootstrap] resolveServicePorts failed', err);
      await createErrorWindow(`端口探测失败: ${err.message}`);
      return;
    }
  }
  currentServicePorts = ports;

  // ── Start backend services ──
  // In dev mode (SERVICE_PORTS from orchestrator), unblock services are already
  // started by the orchestrator, but the Netease API still needs to be spawned here.
  // In production (packaged app), all services are started here.
  const isDev = !!process.env.SERVICE_PORTS;
  try {
    writeMainLog('[bootstrap] startAllServices', { ports, isDev });
    serviceChildren = startAllServices({
      api: ports.api,
      unblockProxy: ports.unblockProxy,
    }, isDev);  // pass flag to skip unblock in dev mode
  } catch (err) {
    writeMainLog('[bootstrap] startAllServices failed', err);
    await createErrorWindow(`启动后端服务失败: ${err.message}`);
    return;
  }

  // ── 内置 unblock 匹配能力：优先走 Electron 原生桥 ──
  try {
    writeMainLog('[bootstrap] initNativeUnblockMatch start');
    // 不传 proxyUrl：match 函数直连 HTTPS，走 proxy 的 CONNECT 隧道会导致 TLS 握手失败
    await initNativeUnblockMatch();
    writeMainLog('[bootstrap] initNativeUnblockMatch ready', isNativeUnblockMatchReady());
    console.log('[main] 内置 unblock 匹配服务就绪:', isNativeUnblockMatchReady());
  } catch (err) {
    writeMainLog('[bootstrap] initNativeUnblockMatch failed', err);
    console.warn('[main] 内置 unblock 匹配初始化失败，将回退独立服务:', err.message);
  }

  // ── Wait for API to be ready ──
  const timeoutMs = process.platform === 'win32' ? 60000 : 45000;
  writeMainLog('[bootstrap] waitApiReady', { apiPort: ports.api, timeoutMs });
  console.log(`[main] 等待 API 就绪 (:${ports.api}, 超时 ${timeoutMs}ms)...`);
  const ready = await waitApiReady(`http://127.0.0.1:${ports.api}`, timeoutMs);

  if (!ready) {
    writeMainLog('[bootstrap] waitApiReady timeout', { apiPort: ports.api });
    killAllServices(serviceChildren);
    await createErrorWindow(`API 服务未能在 ${timeoutMs / 1000} 秒内就绪。<br>请检查端口 ${ports.api} 是否被占用。`);
    return;
  }
  writeMainLog('[bootstrap] api ready', { apiPort: ports.api });

  // ── 注册 local:// 协议（本地文件播放）──
  protocol.registerFileProtocol('local', (request, callback) => {
    try {
      let filePath = decodeURIComponent(request.url.replace(/^local:\/\//, ''));
      if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1);
      filePath = path.normalize(filePath);
      if (!fs.existsSync(filePath)) return callback({ error: -6 });
      callback({ path: filePath });
    } catch {
      callback({ error: -2 });
    }
  });

  // ── 初始化本地音乐服务 ──
  let localMusicDb, localMusicScanner;
  try {
    localMusicDb = new LocalMusicDB();
    await localMusicDb.init();
    localMusicScanner = new NodeMusicScanner();
    registerLocalMusicIpc(localMusicScanner, localMusicDb);
    writeMainLog('[bootstrap] local music ready');
    console.log('[main] 本地音乐服务就绪');
  } catch (err) {
    writeMainLog('[bootstrap] local music init failed', err);
    console.warn('[main] 本地音乐服务初始化失败:', err.message);
  }

  ipcMain.handle('unblock:match-song', async (_event, id, sources) => {
    return nativeUnblockMatchSong(Number(id || 0), Array.isArray(sources) ? sources : []);
  });
  ipcMain.handle('unblock:is-native-ready', async () => isNativeUnblockMatchReady());

  // ── 创建主窗口 ──
  console.log('[main] API 就绪，创建主窗口...');
  setupChineseMenu();
  loadDesktopLyricConfig();
  loadTrayLyricConfig(); // 加载持久化的托盘歌词配置
  await createMainWindow(ports);
  writeMainLog('[bootstrap] main window created');

  // ── 初始化任务栏播控（主窗口已创建，任务栏按钮稳定） ──
  initTaskbarWidget();
  registerTaskbarWidgetIpc();

  // 初始化自动更新模块
  initUpdater(win);
  registerUpdaterIpc();
  if (desktopLyricConfig.enabled) createDesktopLyricWin();

  // ── 初始化系统托盘 ──
  const trayWin = BrowserWindow.getAllWindows()[0];
  if (trayWin) {
    initializeMainTray(trayWin);
  }

  console.log('[main] 启动流程完成，端口:', ports);
  writeMainLog('[bootstrap] done', ports);
}

// ── 单实例锁：阻止多开 + 任务栏点击正确聚焦 ──
function handleActivateWindow() {
  console.log('[main] activate triggered');
  // 处于迷你模式：先恢复正常窗口再聚焦
  if (preMiniState) {
    restoreMainWindowFromMiniMode();
    setTrayMenu(win);
    return;
  }
  // 用 getAllWindows 代替全局 win 变量，避免引用失效
  const existing = BrowserWindow.getAllWindows().filter(function(w) { return !w.isDestroyed(); });
  if (existing.length > 0) {
    const w = existing[0];
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (process.platform === 'win32' || process.platform === 'darwin') {
      // Force window to foreground: briefly set topmost then release
      w.setAlwaysOnTop(true);
      setTimeout(function() {
        try { if (!w.isDestroyed()) w.setAlwaysOnTop(false); } catch(e) {}
      }, 200);
    }
    return;
  }
  // 没有窗口存在，走完整启动流程
  bootstrap();
}

// ── 系统托盘点击：唤出主窗口 ──
function showMainWindowFromTray() {
  console.log('[tray] clicked');
  // On Windows, tray click grants foreground activation (shell -> app process),
  // so w.show() + app.focus() is sufficient. No setAlwaysOnTop trick needed.
  // On macOS, fall back to deferred setAlwaysOnTop trick.
  var existing = BrowserWindow.getAllWindows().filter(function(w) { return !w.isDestroyed(); });
  if (existing.length > 0) {
    var w = existing[0];
    if (w.isMinimized()) w.restore();
    if (process.platform === 'win32') {
      w.show();
      try { app.focus(); } catch(e) {}
    } else if (process.platform === 'darwin') {
      w.setAlwaysOnTop(true);
      try { app.focus(); } catch(e) {}
      w.show();
      w.focus();
      setTimeout(function() {
        try { if (!w.isDestroyed()) w.setAlwaysOnTop(false); } catch(e) {}
      }, 200);
    } else {
      w.show();
      w.focus();
    }
    return;
  }
  bootstrap();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    handleActivateWindow();
  });
}

app.whenReady().then(() => {
  // 开发模式下显式设置 Dock/任务栏图标
  if (!app.isPackaged) {
    const dockIconPath = path.join(__dirname, '..', 'build', 'icon.png');
    if (fs.existsSync(dockIconPath)) {
      try {
        const dockIcon = nativeImage.createFromPath(dockIconPath);
        if (process.platform === 'darwin' && !dockIcon.isEmpty()) {
          app.dock.setIcon(dockIcon);
        }
      } catch (e) {
        writeMainLog('[dock-icon] set failed', e);
      }
    }
  }
  showSplashWindow();
  // Give splash a moment to render before starting heavy service initialization
  setTimeout(function() { bootstrap(); }, 500);
});

app.on('activate', handleActivateWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killAllServices(serviceChildren);
});

// ── 窗口控制 IPC ──
ipcMain.handle('window-minimize', (event) => {
  const bw = BrowserWindow.fromWebContents(event.sender);
  bw?.minimize();
});

ipcMain.handle('window-maximize', (event) => {
  const bw = BrowserWindow.fromWebContents(event.sender);
  if (bw?.isMaximized()) {
    bw.unmaximize();
  } else {
    bw?.maximize();
  }
});

ipcMain.handle('window-is-maximized', (event) => {
  const bw = BrowserWindow.fromWebContents(event.sender);
  return bw?.isMaximized() ?? false;
});

ipcMain.handle('window-close', (event) => {
  const bw = BrowserWindow.fromWebContents(event.sender);
  if (!bw || bw.isDestroyed()) return;
  if (process.platform === 'darwin') {
    bw.close();
  } else {
    bw.minimize();
  }
});

ipcMain.on('window:set-background-color', (_event, color) => {
  if (!win || typeof color !== 'string' || !color.trim()) return;
  win.setBackgroundColor(color);
});

// ── 迷你模式 IPC ──
let preMiniState = null;

function applyMiniAlwaysOnTop(enabled) {
  if (!win) return;

  if (enabled) {
    if (process.platform === 'darwin') {
      win.setAlwaysOnTop(true, 'floating');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      win.setAlwaysOnTop(true);
    }
    return;
  }

  win.setAlwaysOnTop(false);
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(false);
  }
}

ipcMain.on('mini-mode:enter', (_event, alwaysOnTop) => {
  enterMiniMode(!!alwaysOnTop);
});

ipcMain.on('mini-mode:exit', () => {
  if (!win || !preMiniState) return;

  restoreMainWindowFromMiniMode();
  setTrayMenu(win);
});

ipcMain.on('mini-mode:set-always-on-top', (_event, enabled) => {
  if (!preMiniState || !miniWin || miniWin.isDestroyed()) return;
  applyMiniAlwaysOnTopToWindow(miniWin, !!enabled);
});

ipcMain.on('mini-mode:renderer-ready', () => {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show();
    miniWin.focus();
    miniWin.webContents.send('mini-mode:state-change', true);
  }
});

ipcMain.on('mini-mode:resize', (_event, height) => {
  if (!miniWin || miniWin.isDestroyed()) return;
  const clampedHeight = Math.max(70, Math.min(height, 500));

  // Must be resizable for setContentSize to shrink on Windows
  miniWin.setResizable(true);
  miniWin.setContentSize(340, clampedHeight);
  miniWin.setResizable(false);

  writeMainLog('[mini] resize', { after: miniWin.getSize(), requested: clampedHeight });
});

ipcMain.on('playback:publish-state', (_event, snapshot) => {
  latestPlaybackSnapshot = snapshot;
  updateTaskbarWidgetSnapshot(snapshot);
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.webContents.send('playback:state', snapshot);
  }
});

ipcMain.on('playback:command', (_event, command) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('playback:command', command);
  }
});

ipcMain.handle('playback:get-initial-snapshot', () => latestPlaybackSnapshot);

// ── 缓存持久化 IPC ──
const CACHE_FILE = path.join(app.getPath('userData'), 'api-cache.json');

ipcMain.handle('cache:get', async () => {
  try {
    return await fs.promises.readFile(CACHE_FILE, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('cache:set', async (_event, data) => {
  try {
    const dir = path.dirname(CACHE_FILE);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(CACHE_FILE, data, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('cache:clear', async () => {
  try {
    await fs.promises.unlink(CACHE_FILE);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return true;
    return false;
  }
});

// ── 桌面歌词 ──
let desktopLyricWin = null;
let _lyricPollTimer = null;
let desktopLyricData = { lrcArray: [], currentTime: 0, trackName: '', artist: '', isPlaying: false };
let desktopLyricConfig = {
  enabled: false,
  highlightColor: '#ff6b81',
  textColor: '#ffffff',
  fontSize: 36,
  displayMode: 'scroll',
  isLocked: false,
  alwaysShowBg: false,
  winX: null, winY: null, winWidth: 800, winHeight: 200,
};
const DESKTOP_LYRIC_CONFIG_FILE = path.join(app.getPath('userData'), 'desktop-lyric-config.json');
let _desktopLyricResizeTimer = null;

// ── 系统托盘 ──
let mainTray = null;
let lyricTray = null;

let trayCurrentLine = '';
let trayCurrentPlaying = false;
let trayCurrentTrackName = '';
let trayCurrentArtist = '';
let traySongName = '';
let trayIsLiked = false;
let trayDesktopLyricShow = false;

// ── 系统托盘菜单构建 ──
function buildTrayMenu(win) {
  const trayCfg = getTrayLyricConfig();
  const truncate = (s, max) => s && s.length > max ? s.slice(0, max - 1) + '…' : (s || '');
  // 点击时获取有效窗口，避免捕获已销毁的引用
  const getWin = () => {
    const all = BrowserWindow.getAllWindows();
    return all.find(w => w && !w.isDestroyed()) || null;
  };

  const items = [
    {
      label: truncate(trayCurrentTrackName || traySongName, 30) || '未播放',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: trayIsLiked ? '取消喜欢' : '喜欢',
      click: () => getWin()?.webContents.send('tray-action', 'toggleLike'),
    },
    {
      label: `播放模式`,
      submenu: [
        { label: '列表循环', type: 'radio', checked: true, click: () => getWin()?.webContents.send('tray-action', 'cycleMode') },
        { label: '单曲循环', type: 'radio', click: () => getWin()?.webContents.send('tray-action', 'singleMode') },
        { label: '随机播放', type: 'radio', click: () => getWin()?.webContents.send('tray-action', 'shuffleMode') },
      ],
    },
    { type: 'separator' },
    {
      label: '上一首',
      click: () => getWin()?.webContents.send('tray:prev'),
    },
    {
      label: trayCurrentPlaying ? '暂停' : '播放',
      click: () => getWin()?.webContents.send('tray:play-pause'),
    },
    {
      label: '下一首',
      click: () => getWin()?.webContents.send('tray:next'),
    },
    { type: 'separator' },
    {
      label: preMiniState ? '关闭迷你模式' : '打开迷你模式',
      click: () => toggleMiniModeFromTray(),
    },
    {
      label: '桌面歌词',
      type: 'checkbox',
      checked: trayDesktopLyricShow,
      click: () => {
        const newEnabled = !trayDesktopLyricShow;
        trayDesktopLyricShow = newEnabled;
        desktopLyricConfig.enabled = newEnabled;
        saveDesktopLyricConfig();
        setTrayMenu(getWin());
        if (newEnabled) {
          createDesktopLyricWin();
        } else {
          destroyDesktopLyricWin();
        }
        // 广播配置变更到所有窗口（同步 UI）
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
        });
      },
    },
    ...(process.platform === 'darwin'
      ? [{
          label: '状态栏歌词',
          type: 'checkbox',
          checked: trayCfg.enabled,
          click: () => {
            const newState = !trayCfg.enabled;
            setTrayLyricConfig({ enabled: newState });
            setTrayDisplay(trayCurrentTrackName || trayCurrentLine || '');
            BrowserWindow.getAllWindows().forEach((w2) => {
              if (!w2.isDestroyed()) w2.webContents.send('tray-lyric:config-changed', { ...getTrayLyricConfig() });
            });
            setTrayMenu(getWin());
          },
        }]
      : [{
          label: '任务栏播控',
          type: 'checkbox',
          checked: getTaskbarWidgetConfig().enabled,
          click: () => {
            const newState = !getTaskbarWidgetConfig().enabled;
            try {
              setTaskbarWidgetEnabled(newState);
            } catch (e) {
              console.error('[tray] 切换任务栏播控失败:', e);
            }
            BrowserWindow.getAllWindows().forEach((w) => {
              if (!w.isDestroyed()) w.webContents.send('taskbar-widget:config-changed', { ...getTaskbarWidgetConfig() });
            });
            setTrayMenu(getWin());
          },
        }]),


  ];

  items.push(
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        dispatchMainWindowTrayAction('openSettings');
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  );

  return Menu.buildFromTemplate(items);
}

function setTrayMenu(win) {
  const menu = buildTrayMenu(win);
  try {
    if (mainTray) mainTray.setContextMenu(menu);
  } catch (err) {
    console.error('[tray] 设置菜单失败:', err);
  }
}

function updateTrayState(win) {
  if (mainTray) {
    mainTray.setToolTip(trayCurrentTrackName || traySongName || 'Resound-Player');
  }
  setTrayMenu(win);
}

const TRAY_ICON_CANDIDATES = [
  path.join(__dirname, '..', 'dist', 'logo.png'),
  path.join(__dirname, '..', 'public', 'logo.png'),
];

function resolveTrayIconPath() {
  return TRAY_ICON_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || TRAY_ICON_CANDIDATES[0];
}

function createTrayIcon(template = false) {
  const source = resolveTrayIconPath();
  const img = nativeImage.createFromPath(source);
  if (img.isEmpty()) {
    writeMainLog('[tray] empty tray icon image', { source, candidates: TRAY_ICON_CANDIDATES });
  }
  const resized = img.resize({ width: 20, height: 20 });
  if (template) resized.setTemplateImage(true);
  return resized;
}

// ── 透明 PNG 生成（用于歌词托盘占位图标） ──
function _crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _makePNGChunk(type, data) {
  const lenB = Buffer.alloc(4); lenB.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = _crc32(Buffer.concat([typeB, data]));
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc);
  return Buffer.concat([lenB, typeB, data, crcB]);
}

function _createTransparentIcon(w = 18, h = 18) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rowSize = w * 4 + 1;
  const raw = Buffer.alloc(h * rowSize, 0);
  const idat = zlib.deflateSync(raw);
  const buf = Buffer.concat([sig, _makePNGChunk('IHDR', ihdr), _makePNGChunk('IDAT', idat), _makePNGChunk('IEND', Buffer.alloc(0))]);
  return nativeImage.createFromBuffer(buf);
}

function initializeMainTray(win) {
  if (mainTray) return mainTray;
  const isMac = process.platform === 'darwin';
  try {
    if (isMac) {
      // 先创建主托盘（右侧）：Logo 图标
      const icon = createTrayIcon(false);
      mainTray = new Tray(icon);
      mainTray.setTitle('');

      // 再创建歌词托盘（左侧 — macOS 后创建的在左边）：透明图标 + 歌词文字占位
      lyricTray = new Tray(_createTransparentIcon());
      lyricTray.setTitle('');
    } else {
      const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      mainTray = new Tray(icon);
    }
    mainTray.setToolTip('Resound-Player');
    // 左键点击唤出主窗口（右键保持菜单）
    mainTray.on('click', showMainWindowFromTray);
    if (lyricTray) {
      lyricTray.on('click', showMainWindowFromTray);
    }
    setTrayMenu(win);
    return mainTray;
  } catch (err) {
    console.error('[tray] 创建托盘失败:', err);
    return null;
  }
}

// ── 预生成透明图标缓存，避免高频 setTrayDisplay 重复生成 ──
let _transparentIcon18 = null;
let _transparentIcon4 = null;
function _getTransparentIcon(w, h) {
  if (w === 18 && h === 18) {
    if (!_transparentIcon18) _transparentIcon18 = _createTransparentIcon(18, 18);
    return _transparentIcon18;
  }
  if (w === 4 && h === 18) {
    if (!_transparentIcon4) _transparentIcon4 = _createTransparentIcon(4, 18);
    return _transparentIcon4;
  }
  return _createTransparentIcon(w, h);
}

/**
 * 始终：lyricTray（左）显示文字，mainTray（右）只显示 Logo
 *  - 有歌词且启用：显示歌词
 *  - 无歌词或有歌名：显示歌名
 *  - 停止播放：清空文字，缩小透明占位
 */
function setTrayDisplay(lyricText) {
  if (!mainTray || process.platform !== 'darwin') return;
  const cfg = getTrayLyricConfig();
  // mainTray 永远只显示 Logo，不显示文字
  mainTray.setImage(createTrayIcon(false));
  mainTray.setTitle('');
  // lyricTray 承担所有文字显示
  // enabled=true: 优先显示歌词，其次歌名；enabled=false: 显示歌名
  const textToShow = cfg.enabled ? (lyricText || trayCurrentTrackName || '') : (trayCurrentTrackName || '');
  if (lyricTray) {
    if (textToShow) {
      lyricTray.setImage(_getTransparentIcon(18, 18));
      lyricTray.setTitle(textToShow);
    } else {
      lyricTray.setImage(_getTransparentIcon(4, 18));
      lyricTray.setTitle('');
    }
  }
}

// ── 状态栏歌词插值引擎（SPlayer 模式） ──
// 渲染进程推送完整歌词数组 + 精确进度，主进程 50ms 自插值驱动歌词更新
let engineLyricLines = [];
let engineCurrentTime = 0;
let engineOffset = 0;
let engineIsPlaying = false;
let engineLastLyricIndex = -1;
let engineInterpolationTimer = null;
let engineLastUpdateTime = 0;

const ENGINE_INTERVAL_MS = 50;
const ENGINE_SYNC_THRESHOLD_MS = 100;

// ── 手动字符滚动 ──
const SCROLL_MAX_WIDTH = 30;        // 视觉宽度上限（≈ 15 个中文字）
const SCROLL_STEP_INTERVAL = 5;     // 每 5 个 engine tick 滚动一步（250ms）
const SCROLL_PAUSE_TICKS = 40;      // 开头/末尾暂停 40 个 tick（2s）

let engineScrollText = '';          // 当前正在滚动的完整文本
let engineScrollCharPos = 0;        // 当前可见窗口的起始字符索引
let engineScrollPauseLeft = 0;      // 暂停剩余 tick 数
let engineScrollStepCount = 0;      // tick 计数，用于控制滚动节奏
let engineScrollActive = false;     // 是否正在滚动

/** 估算单个字符的视觉宽度（CJK=2, ASCII=1） */
function _charWidth(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0x4e00 && c <= 0x9fff) return 2; // CJK 统一表意文字
  if (c >= 0x3000 && c <= 0x303f) return 2; // CJK 符号和标点
  if (c >= 0xff00 && c <= 0xffef) return 2; // 全角字符
  return 1;
}

/** 计算文本的估算视觉宽度 */
function _textWidth(text) {
  let w = 0;
  for (const ch of text) w += _charWidth(ch);
  return w;
}

/**
 * 按视觉宽度截断文本。超出 maxWidth 的部分替换为 '…'
 * 确保返回的文本视觉宽度 ≤ maxWidth
 */
function _truncateByWidth(text, maxWidth) {
  if (!text) return '';
  if (_textWidth(text) <= maxWidth) return text;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += _charWidth(text[i]);
    if (w > maxWidth) return text.slice(0, i) + '…';
  }
  return text;
}

/**
 * 从 text 的 charPos 位置开始，取一个视觉宽度 ≤ maxWidth 的窗口
 * 返回 { text: 窗口文本, displayWidth: 实际视觉宽度 }
 */
function _scrollWindow(text, charPos, maxWidth) {
  let result = '';
  let w = 0;
  for (let i = charPos; i < text.length; i++) {
    const cw = _charWidth(text[i]);
    if (w + cw > maxWidth) break;
    result += text[i];
    w += cw;
  }
  return result;
}

/** 重置滚动状态（新歌词行时调用） */
function _resetScroll(text) {
  engineScrollText = text || '';
  engineScrollCharPos = 0;
  engineScrollPauseLeft = SCROLL_PAUSE_TICKS;
  engineScrollStepCount = 0;
  engineScrollActive = _textWidth(engineScrollText) > SCROLL_MAX_WIDTH;
}

/**
 * 推进滚动逻辑。每帧由 engine tick 调用。
 * @returns {boolean} true = 显示内容已变化，需要更新 setTitle
 */
function _advanceScroll() {
  if (!engineScrollActive) return false;
  engineScrollStepCount++;

  // 暂停中
  if (engineScrollPauseLeft > 0) {
    engineScrollPauseLeft--;
    return false; // 暂停期间视觉不变（但 pause 开始/结束边界需要更新）
  }

  // 非暂停状态：每 SCROLL_STEP_INTERVAL 个 tick 滚动一步
  if (engineScrollStepCount % SCROLL_STEP_INTERVAL !== 0) return false;

  // 尝试前进一个字符
  const nextPos = engineScrollCharPos + 1;
  // 如果从 nextPos 开始的内容已经可以在 maxWidth 内全部显示 → 已到末尾
  const remaining = engineScrollText.slice(nextPos);
  if (_textWidth(remaining) <= SCROLL_MAX_WIDTH) {
    // 末尾暂停，然后复位
    engineScrollPauseLeft = SCROLL_PAUSE_TICKS;
    engineScrollCharPos = 0; // 复位到开头
    return true; // 内容变化了（从末尾跳到开头）
  }

  engineScrollCharPos = nextPos;
  return true;
}

/** 获取当前滚动窗口的显示文本 */
function _getDisplayText(rawText, isNewLine) {
  if (isNewLine) _resetScroll(rawText);
  if (!engineScrollActive) return rawText;
  // 暂停中显示：开头截断，或末尾截断
  if (engineScrollPauseLeft > 0) {
    if (engineScrollCharPos === 0) {
      return _truncateByWidth(rawText, SCROLL_MAX_WIDTH);
    } else {
      // 末尾暂停：显示尾部窗口
      const tailText = _scrollWindow(rawText, Math.max(0, rawText.length - Math.floor(SCROLL_MAX_WIDTH / 2)), SCROLL_MAX_WIDTH);
      return tailText;
    }
  }
  // 滚动中
  return _scrollWindow(rawText, engineScrollCharPos, SCROLL_MAX_WIDTH);
}

function engineStartInterpolation() {
  engineStopInterpolation();
  engineLastUpdateTime = Date.now();
  engineInterpolationTimer = setInterval(() => {
    const now = Date.now();
    engineCurrentTime += now - engineLastUpdateTime;
    engineLastUpdateTime = now;
    engineTick();
  }, ENGINE_INTERVAL_MS);
}

/**
 * 每个 50ms engine tick 调用一次。
 * 1) 推进当前播放时间
 * 2) 推进滚动动画
 * 3) 更新显示
 */
function engineTick() {
  if (process.platform !== 'darwin') return;
  if (!engineIsPlaying) return;

  // 推进滚动
  const scrollAdvanced = _advanceScroll();

  // 查找当前应显示的歌词行
  const idx = engineLyricLines.length ? engineFindCurrentIndex() : -1;

  // 没有歌词时只更新 tooltip（logo 图标固定显示）
  if (!engineLyricLines.length) {
    if (mainTray) {
      const meta = trayCurrentTrackName ? `${trayCurrentTrackName}${trayCurrentArtist ? ' - ' + trayCurrentArtist : ''}` : 'Resound-Player';
      mainTray.setToolTip(meta);
    }
    setTrayDisplay(trayCurrentTrackName || '');
    engineLastLyricIndex = -1;
    return;
  }

  // 如果歌词行没变且滚动没推进 → 无需更新
  if (!scrollAdvanced && idx === engineLastLyricIndex) return;

  const isNewLine = (idx !== engineLastLyricIndex);
  engineLastLyricIndex = idx;

  // 确定原始文本
  let rawText = '';
  if (idx >= 0 && engineLyricLines[idx]) {
    rawText = engineLyricLines[idx].text || '';
  }
  if (!rawText) {
    rawText = trayCurrentTrackName || '';
  }

  // 获取显示文本（可能经过滚动窗口处理）
  const displayText = _getDisplayText(rawText, isNewLine);

  if (mainTray) {
    // 仅更新 tooltip（歌词全文 + 歌名），logo 图标固定显示
    const tooltipLine = rawText || trayCurrentTrackName || '';
    const tooltipMeta = trayCurrentTrackName ? `${trayCurrentTrackName}${trayCurrentArtist ? ' - ' + trayCurrentArtist : ''}` : '';
    mainTray.setToolTip(tooltipLine ? `${tooltipLine}${tooltipMeta ? `\n— ${tooltipMeta}` : ''}` : tooltipMeta);
  }
  setTrayDisplay(rawText || '');
}

function engineStopInterpolation() {
  if (engineInterpolationTimer) {
    clearInterval(engineInterpolationTimer);
    engineInterpolationTimer = null;
  }
}

function engineFindCurrentIndex() {
  if (!engineLyricLines.length) return -1;
  const targetMs = engineCurrentTime - engineOffset + 300; // 300ms ahead for comfort
  for (let i = engineLyricLines.length - 1; i >= 0; i--) {
    if ((engineLyricLines[i].time || 0) * 1000 <= targetMs) return i;
  }
  return -1;
}

/**
 * 兼容包装器：被 sync-state/sync-tick IPC handler 调用。
 * 强制重置索引跟踪，确保 engineTick 重新评估显示内容。
 * 旧名 engineUpdateDisplay 保留以最小化改动。
 */
function engineUpdateDisplay(forceUpdate = false) {
  if (process.platform !== 'darwin') return;
  if (!engineIsPlaying) return;
  engineLastLyricIndex = -1;
  engineTick();
}

// 保留旧接口：updateTrayLyricData 仍然更新基础状态，由 engineTick 驱动显示
function updateTrayLyricData(line, trackName, artist, isPlaying) {
  trayCurrentLine = line || '';
  trayCurrentTrackName = trackName || '';
  trayCurrentArtist = artist || '';
  trayCurrentPlaying = !!isPlaying;
  traySongName = trayCurrentTrackName;
  engineIsPlaying = !!isPlaying;
  if (engineIsPlaying) {
    engineStartInterpolation();
  } else {
    engineStopInterpolation();
    // 暂停时刷新一次显示
    const idx = engineLyricLines.length ? engineFindCurrentIndex() : -1;
    engineLastLyricIndex = idx;
    let rawText = '';
    if (idx >= 0 && engineLyricLines[idx]) rawText = engineLyricLines[idx].text || '';
    if (!rawText) rawText = trayCurrentTrackName || '';
    if (mainTray) {
      mainTray.setToolTip(rawText ? `${rawText}\n— ${trayCurrentTrackName}${trayCurrentArtist ? ' - ' + trayCurrentArtist : ''}` : trayCurrentTrackName || '');
    }
    setTrayDisplay(rawText || '');
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win) setTrayMenu(win);
}

function loadDesktopLyricConfig() {
  try {
    if (fs.existsSync(DESKTOP_LYRIC_CONFIG_FILE)) {
      desktopLyricConfig = { ...desktopLyricConfig, ...JSON.parse(fs.readFileSync(DESKTOP_LYRIC_CONFIG_FILE, 'utf-8')) };
    }
  } catch {}
}

function saveDesktopLyricConfig() {
  try {
    const dir = path.dirname(DESKTOP_LYRIC_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DESKTOP_LYRIC_CONFIG_FILE, JSON.stringify(desktopLyricConfig), 'utf-8');
  } catch {}
}

function generateDesktopLyricHtml() {
  const cfg = desktopLyricConfig;
  const hl = cfg.highlightColor || '#ff6b81';
  const tc = cfg.textColor || '#ffffff';
  const fs = cfg.fontSize || 36;
  const lh = Math.round(fs * 1.8);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
body{background:transparent;overflow:hidden;width:100vw;height:100vh;font-family:-apple-system,BlinkMacSystemFont,"SF Pro","Segoe UI",Roboto,sans-serif;
  display:flex;flex-direction:column;transition:background 0.35s}
body.show-bg{background:rgba(0,0,0,0.35);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
body.locked #top-bar{pointer-events:none}
body.locked #top-bar:not(.hidden) #play-controls,
body.locked #top-bar:not(.hidden) #right-controls .ctrl-btn:not(.lock-btn),
body.locked #top-bar:not(.hidden) #track-info{opacity:0;pointer-events:none}
body.locked #top-bar:not(.hidden) .ctrl-btn.lock-btn{opacity:1;pointer-events:auto}
#top-bar{position:relative;display:flex;align-items:center;justify-content:space-between;
  padding:8px 16px;min-height:48px;z-index:15;
  opacity:1;transition:opacity 0.35s;flex-shrink:0}
#top-bar.hidden{opacity:0;pointer-events:none}
#top-bar-logo{display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:8px;width:28px;height:28px;color:rgba(255,255,255,0.9)}
#track-info{display:flex;flex-direction:column;gap:1px;overflow:hidden;margin-right:12px;flex:1}
#track-name{font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
#track-artist{font-size:11px;font-weight:400;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
#play-controls{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;-webkit-app-region:no-drag}
#right-controls{flex:1;display:flex;align-items:center;justify-content:flex-end;gap:10px;-webkit-app-region:no-drag}
.ctrl-btn{width:34px;height:34px;border-radius:50%;border:none;background:transparent;
  color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all 0.15s;line-height:1}
.ctrl-btn:hover{transform:scale(1.08)}
.ctrl-btn.play-btn{width:34px;height:34px;font-size:15px}
.ctrl-btn.lock-btn{font-size:11px}
.ctrl-btn.lock-btn.locked{color:${hl}}
.ctrl-btn.font-btn{font-size:11px;font-weight:700;width:26px;height:26px}
.ctrl-btn.color-btn{font-size:13px}
.ctrl-btn.close-btn:hover{color:#ff4757}
#color-panel{position:fixed;top:56px;right:16px;z-index:30;-webkit-app-region:no-drag;
  background:rgba(30,30,30,0.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;
  box-shadow:0 4px 20px rgba(0,0,0,0.4);min-width:200px;
  max-height:calc(100vh - 72px);overflow-y:auto}
#color-panel.hidden{display:none}
.color-section-label{font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.03em;margin-top:4px}
.color-section-label:first-child{margin-top:0}
.color-divider{height:1px;background:rgba(255,255,255,0.08);margin:4px 0}
.color-presets{display:flex;gap:6px;flex-wrap:wrap}
.color-swatch{width:26px;height:26px;border-radius:50%;border:2px solid transparent;
  cursor:pointer;transition:all 0.15s}
.color-swatch:hover{transform:scale(1.15)}
.color-swatch.active{border-color:#fff}
#custom-color-wrap{display:flex;align-items:center;gap:8px}
#custom-color-wrap input[type=color]{width:28px;height:28px;border:none;border-radius:50%;
  cursor:pointer;padding:0;background:none}
#custom-color-wrap input[type=color]::-webkit-color-swatch-wrapper{padding:0}
#custom-color-wrap input[type=color]::-webkit-color-swatch{border:none;border-radius:50%}
#custom-text-color-wrap{display:flex;align-items:center;gap:8px}
#custom-text-color-wrap input[type=color]{width:28px;height:28px;border:none;border-radius:50%;
  cursor:pointer;padding:0;background:none}
#custom-text-color-wrap input[type=color]::-webkit-color-swatch-wrapper{padding:0}
#custom-text-color-wrap input[type=color]::-webkit-color-swatch{border:none;border-radius:50%}
.color-hex{font-size:11px;color:rgba(255,255,255,0.5);font-family:monospace}
#lyric-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;
  padding:0 32px 16px;position:relative;-webkit-app-region:no-drag}
#lyric-scroll{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;text-align:center;
  scrollbar-width:none;-ms-overflow-style:none;-webkit-app-region:no-drag}
#lyric-scroll::-webkit-scrollbar{display:none}
#resize-handle{position:fixed;right:0;bottom:0;width:14px;height:14px;z-index:25;
  cursor:nwse-resize;background:rgba(255,255,255,0.08);border-radius:2px 0 0 0;
  opacity:0;transition:opacity 0.2s;-webkit-app-region:no-drag}
#resize-handle::before{content:'';position:absolute;right:2px;bottom:2px;
  width:8px;height:8px;border-right:2px solid rgba(255,255,255,0.3);
  border-bottom:2px solid rgba(255,255,255,0.3)}
#resize-handle:hover{opacity:1;background:rgba(255,255,255,0.15)}
#resize-handle.show{opacity:0.6}
body.show-bg #resize-handle{opacity:0.6}
.lyric-line{padding:0;margin:0;transition:opacity 0.3s,transform 0.3s;
  font-weight:600;font-size:${fs * 0.85}px;line-height:${lh}px;
  color:${tc};opacity:0.5;transform:scale(0.92);overflow:hidden;white-space:nowrap}
.lyric-line .scroll-wrap{display:inline-block;white-space:nowrap;will-change:transform}
.lyric-line.current{color:${hl};opacity:1;transform:scale(1.05);font-size:${fs}px}
.lyric-line.past{opacity:0.3;transform:scale(0.88)}
.lyric-line .karaoke{}
.lyric-line .sub-line{display:block;font-size:66%;opacity:0.55;line-height:1.35;font-weight:400}
.lyric-line .sub-line.sub-roma{font-style:italic}
.lyric-line .sub-line.hidden{display:none}
.lyric-line.current .sub-line{opacity:0.7}
.lyric-line.double-line{display:block;text-align:center;margin:10px 0;transition:opacity 0.35s ease,transform 0.35s ease}
.lyric-line.double-line.current{font-size:${fs}px;color:${hl};opacity:1;transform:scale(1.05)}
.lyric-line.double-line.past{font-size:${fs * 0.85}px;color:${tc};opacity:0.5;transform:scale(0.92);font-weight:400}
.lyric-line.double-line.next-line{font-size:${fs * 0.85}px;color:${tc};opacity:0.5;transform:scale(0.92);font-weight:400}
</style></head>
<body>
<div id="top-bar">
<div id="top-bar-logo">
  <svg width="28" height="28" viewBox="30 30 140 140" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="logoGradDL" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#22c55e"/><stop offset="100%" stop-color="#16a34a"/></linearGradient></defs>
    <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradDL)" stroke-width="16" stroke-linecap="round"/>
    <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradDL)"/>
    <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradDL)"/>
    <circle cx="145" cy="122.5" r="5" fill="currentColor" opacity="0.8"/>
  </svg>
</div>
  <div id="track-info">
    <div id="track-name"></div>
    <div id="track-artist"></div>
  </div>
  <div id="play-controls">
    <button class="ctrl-btn" onclick="doAction('prev')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg></button>
    <button class="ctrl-btn play-btn" id="playBtn" onclick="doAction('togglePlay')">\u25B6</button>
    <button class="ctrl-btn" onclick="doAction('next')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></button>
  </div>
  <div id="right-controls">
    <button class="ctrl-btn font-btn" onclick="doAction('fontSizeDown')" title="减小字号">A-</button>
    <button class="ctrl-btn font-btn" onclick="doAction('fontSizeUp')" title="增大字号">A+</button>
    <button class="ctrl-btn color-btn" onclick="toggleColorPanel()" title="歌词颜色">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a8 8 0 1 0 8 8c0-1.1-.9-2-2-2h-1.5a2.5 2.5 0 0 1-2.5-2.5V6c0-1.1-.9-2-2-2z"/><circle cx="8.5" cy="9" r="1.5"/><circle cx="13" cy="7.5" r="1.5"/><circle cx="16" cy="11" r="1.5"/></svg>
    </button>
    <button class="ctrl-btn" id="modeBtn" onclick="switchMode()" title="切换显示模式">
      <svg id="mode-scroll" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      <svg id="mode-single" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="3" y1="12" x2="21" y2="12"/></svg>
      <svg id="mode-double" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
    </button>
    <button class="ctrl-btn lock-btn" id="lockBtn" onclick="doAction('toggleLock')">
      <svg id="lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <svg id="unlock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
    </button>
    <button class="ctrl-btn close-btn" onclick="doAction('close')" title="关闭桌面歌词">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div id="color-panel" class="hidden">
    <div class="color-section-label">····已播放（高亮）</div>
    <div class="color-presets" id="hl-presets">
      <div class="color-swatch" data-color="#ff6b81" style="background:#ff6b81" onclick="pickColor('#ff6b81')"></div>
      <div class="color-swatch" data-color="#1ed760" style="background:#1ed760" onclick="pickColor('#1ed760')"></div>
      <div class="color-swatch" data-color="#5b9aff" style="background:#5b9aff" onclick="pickColor('#5b9aff')"></div>
      <div class="color-swatch" data-color="#ff4757" style="background:#ff4757" onclick="pickColor('#ff4757')"></div>
      <div class="color-swatch" data-color="#ffa502" style="background:#ffa502" onclick="pickColor('#ffa502')"></div>
      <div class="color-swatch" data-color="#a55eea" style="background:#a55eea" onclick="pickColor('#a55eea')"></div>
    </div>
    <div id="custom-color-wrap">
      <input type="color" id="customColor" onchange="pickColor(this.value)" value="${hl}">
      <span class="color-hex" id="colorHex">${hl}</span>
    </div>
    <div class="color-divider"></div>
    <div class="color-section-label">····未播放</div>
    <div class="color-presets" id="tc-presets">
      <div class="color-swatch" data-color="#ffffff" style="background:#ffffff" onclick="pickTextColor('#ffffff')"></div>
      <div class="color-swatch" data-color="#e0e0e0" style="background:#e0e0e0" onclick="pickTextColor('#e0e0e0')"></div>
      <div class="color-swatch" data-color="#b0b0b0" style="background:#b0b0b0" onclick="pickTextColor('#b0b0b0')"></div>
      <div class="color-swatch" data-color="#ffb3b3" style="background:#ffb3b3" onclick="pickTextColor('#ffb3b3')"></div>
      <div class="color-swatch" data-color="#b3ffb3" style="background:#b3ffb3" onclick="pickTextColor('#b3ffb3')"></div>
      <div class="color-swatch" data-color="#d4b3ff" style="background:#d4b3ff" onclick="pickTextColor('#d4b3ff')"></div>
    </div>
    <div id="custom-text-color-wrap">
      <input type="color" id="customTextColor" onchange="pickTextColor(this.value)" value="${tc}">
      <span class="color-hex" id="textColorHex">${tc}</span>
    </div>
  </div>
</div>
<div id="lyric-wrap">
  <div id="lyric-scroll"></div>
  <div id="resize-handle"></div>
</div>
<script>
var _state = { mode: 'scroll', highlightColor: '${hl}', textColor: '${tc}', fontSize: ${fs},
  lrc: [], curIdx: -1, isPlaying: false, baseMs: 0, anchorTick: 0, rafId: null, isLocked: false,
  hideTimer: null, topBarHidden: false, showTranslation: true, showRomalrc: false, alwaysShowBg: false };
function doAction(a) { if (window.desktopLyricWinApi) window.desktopLyricWinApi.sendAction(a); }

/* 颜色面板 */
function toggleColorPanel() {
  var p = document.getElementById('color-panel');
  if (!p) return;
  p.classList.toggle('hidden');
}
function pickColor(c) {
  _state.highlightColor = c;
  document.getElementById('colorHex').textContent = c;
  var swatches = document.querySelectorAll('#hl-presets .color-swatch');
  for (var i = 0; i < swatches.length; i++) {
    swatches[i].classList.toggle('active', swatches[i].dataset.color === c);
  }
  renderLines();
  doAction('setColor|' + c);
}
function pickTextColor(c) {
  _state.textColor = c;
  document.getElementById('textColorHex').textContent = c;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) document.getElementById('customTextColor').value = c;
  var swatches = document.querySelectorAll('#tc-presets .color-swatch');
  for (var i = 0; i < swatches.length; i++) {
    swatches[i].classList.toggle('active', swatches[i].dataset.color === c);
  }
  renderLines();
  doAction('setTextColor|' + c);
}
document.addEventListener('click', function(e) {
  var p = document.getElementById('color-panel');
  var btn = document.querySelector('.color-btn');
  if (p && !p.classList.contains('hidden') && !p.contains(e.target) && btn && !btn.contains(e.target)) {
    p.classList.add('hidden');
  }
});

function resetHideTimer() {
  var tb = document.getElementById('top-bar');
  if (!tb) return;
  if (_state.hideTimer) clearTimeout(_state.hideTimer);
  if (_state.topBarHidden) { tb.classList.remove('hidden'); _state.topBarHidden = false; }
  _state.hideTimer = setTimeout(function(){
    if (!_state.isLocked) { tb.classList.add('hidden'); _state.topBarHidden = true; }
  }, 3000);
}
var _lastMouseX = -1, _lastMouseY = -1;
document.addEventListener('mousemove', function(e) {
  if (e.clientX === _lastMouseX && e.clientY === _lastMouseY) return;
  _lastMouseX = e.clientX; _lastMouseY = e.clientY;
  resetHideTimer();
});
document.addEventListener('mouseenter', function(e) {
  if (_state.isLocked) { if (!_state.alwaysShowBg) document.body.classList.remove('show-bg'); return; }
  if (e.clientX === _lastMouseX && e.clientY === _lastMouseY) return;
  _lastMouseX = e.clientX; _lastMouseY = e.clientY;
  document.body.classList.add('show-bg');
  resetHideTimer();
});
document.addEventListener('mouseleave', function() {
  if (!_state.alwaysShowBg) document.body.classList.remove('show-bg');
  var tb = document.getElementById('top-bar');
  if (tb && !_state.isLocked) { tb.classList.add('hidden'); _state.topBarHidden = true; }
  if (_state.hideTimer) { clearTimeout(_state.hideTimer); _state.hideTimer = null; }
});
var _dragState = { isDragging: false, startX: 0, startY: 0 };
document.addEventListener('pointerdown', async function(e) {
  if (_state.isLocked || e.button !== 0) return;
  var target = e.target;
  if (target.closest('.ctrl-btn') || target.closest('#color-panel') || target.closest('#lyric-scroll')) return;
  _dragState.isDragging = true;
  _dragState.startX = e.screenX;
  _dragState.startY = e.screenY;
  // DPI保护：拖拽期间固定窗口尺寸
  if (window.desktopLyricWinApi && window.desktopLyricWinApi.getBounds) {
    try {
      var bounds = await window.desktopLyricWinApi.getBounds();
      if (bounds && window.desktopLyricWinApi.toggleFixedSize) {
        window.desktopLyricWinApi.toggleFixedSize(bounds.width, bounds.height, true);
      }
    } catch(e) {}
  }
  document.addEventListener('pointermove', _onPointerMove);
  document.addEventListener('pointerup', _onPointerUp);
  e.preventDefault();
});
function _onPointerMove(e) {
  if (!_dragState.isDragging) return;
  var dx = Math.round(e.screenX - _dragState.startX);
  var dy = Math.round(e.screenY - _dragState.startY);
  if ((dx !== 0 || dy !== 0) && window.desktopLyricWinApi && window.desktopLyricWinApi.moveWindow) {
    window.desktopLyricWinApi.moveWindow(dx, dy);
    _dragState.startX = e.screenX;
    _dragState.startY = e.screenY;
  }
  e.preventDefault();
}
function _onPointerUp() {
  if (!_dragState.isDragging) return;
  _dragState.isDragging = false;
  if (window.desktopLyricWinApi && window.desktopLyricWinApi.toggleFixedSize) {
    window.desktopLyricWinApi.toggleFixedSize(0, 0, false);
  }
  document.removeEventListener('pointermove', _onPointerMove);
  document.removeEventListener('pointerup', _onPointerUp);
}
function updateLockState() {
  document.body.classList.toggle('locked', _state.isLocked);
  if (_state.isLocked && !_state.alwaysShowBg) document.body.classList.remove('show-bg');
  else if (_state.alwaysShowBg) document.body.classList.add('show-bg');
  var lb = document.getElementById('lockBtn');
  if (!lb) return;
  var lockIcon = document.getElementById('lock-icon');
  var unlockIcon = document.getElementById('unlock-icon');
  if (_state.isLocked) {
    lb.classList.add('locked');
    if (lockIcon) lockIcon.style.display = '';
    if (unlockIcon) unlockIcon.style.display = 'none';
  } else {
    lb.classList.remove('locked');
    if (lockIcon) lockIcon.style.display = 'none';
    if (unlockIcon) unlockIcon.style.display = '';
  }
  resetHideTimer();
}
function updatePlayBtn() {
  var pb = document.getElementById('playBtn');
  if (pb) pb.textContent = _state.isPlaying ? '\u23F8' : '\u25B6';
}
function updateModeBtn() {
  ['scroll','single','double'].forEach(function(m){
    var el = document.getElementById('mode-' + m);
    if (el) el.style.display = m === _state.mode ? '' : 'none';
  });
}
function switchMode() {
  var modes = ['scroll','single','double'];
  var idx = modes.indexOf(_state.mode);
  _state.mode = modes[(idx + 1) % modes.length];
  updateModeBtn();
  doAction('switchMode|' + _state.mode);
}
function getPlayMs() {
  if (!_state.isPlaying) return _state.baseMs;
  return _state.baseMs + (performance.now() - _state.anchorTick);
}
function renderLines() {
  var s = document.getElementById('lyric-scroll');
  var idx = calcIdx(); var lrc = _state.lrc; var mode = _state.mode || 'scroll';
  if (!lrc.length) { s.innerHTML = ''; _state.curIdx = -1; return; }
  var fs = _state.fontSize;
  if (mode === 'double') {
    var start = idx >= 0 ? idx : 0;
    var end = Math.min(start + 2, lrc.length);
    var existing = s.children;
    var needsRebuild = existing.length !== (end - start) ||
      (existing.length > 0 && parseInt(existing[0].dataset.idx) !== start);
    if (needsRebuild) {
      s.innerHTML = '';
      for (var i = start; i < end; i++) {
        var d = document.createElement('div'); d.className = 'lyric-line double-line';
        var sw = document.createElement('div'); sw.className = 'scroll-wrap';
        var k = document.createElement('span'); k.className = 'karaoke'; k.textContent = lrc[i].text;
        sw.appendChild(k); d.appendChild(sw);
        d.dataset.idx = i;
        if (_state.showTranslation && lrc[i].translation) { var t = document.createElement('span'); t.className = 'sub-line'; t.textContent = lrc[i].translation; t.style.color = _state.textColor; d.appendChild(t); }
        if (_state.showRomalrc && lrc[i].romalrc) { var r = document.createElement('span'); r.className = 'sub-line sub-roma'; r.textContent = lrc[i].romalrc; r.style.color = _state.textColor; d.appendChild(r); }
        s.appendChild(d);
      }
    }
    for (var i = 0; i < s.children.length; i++) {
      var line = s.children[i];
      var li = parseInt(line.dataset.idx);
      var k = line.querySelector('.karaoke');
      line.classList.remove('current', 'past', 'next-line');
      k.style.backgroundImage = 'none'; k.style.backgroundClip = ''; k.style.webkitBackgroundClip = ''; k.style.webkitTextFillColor = '';
      if (li === idx) { line.classList.add('current'); k.style.fontSize = fs + 'px'; k.style.color = _state.highlightColor; }
      else if (li > idx) { line.classList.add('next-line'); k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = _state.textColor; }
      else { line.classList.add('past'); k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = _state.textColor; }
      var oldSubs = line.querySelectorAll('.sub-line');
      for (var si = 0; si < oldSubs.length; si++) { oldSubs[si].remove(); }
      if (_state.showTranslation && lrc[li] && lrc[li].translation) { var t = document.createElement('span'); t.className = 'sub-line'; t.textContent = lrc[li].translation; t.style.color = _state.textColor; line.appendChild(t); }
      if (_state.showRomalrc && lrc[li] && lrc[li].romalrc) { var r = document.createElement('span'); r.className = 'sub-line sub-roma'; r.textContent = lrc[li].romalrc; r.style.color = _state.textColor; line.appendChild(r); }
    }
  } else {
    s.innerHTML = '';
    var start = 0, end = lrc.length;
    if (mode === 'single') { start = idx >= 0 ? idx : 0; end = start + 1; }
    for (var i = start; i < end; i++) {
      var d = document.createElement('div'); d.className = 'lyric-line';
      var sw = document.createElement('div'); sw.className = 'scroll-wrap';
      var k = document.createElement('span'); k.className = 'karaoke'; k.textContent = lrc[i].text;
      sw.appendChild(k); d.appendChild(sw);
      if (i === idx) { d.classList.add('current'); k.style.fontSize = fs + 'px'; k.style.color = _state.highlightColor; d.dataset.idx = i; }
      else if (i < idx) { d.classList.add('past'); k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = _state.textColor; d.dataset.idx = i; }
      else { k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = _state.textColor; d.dataset.idx = i; }
      if (_state.showTranslation && lrc[i].translation) { var t = document.createElement('span'); t.className = 'sub-line'; t.textContent = lrc[i].translation; t.style.color = _state.textColor; d.appendChild(t); }
      if (_state.showRomalrc && lrc[i].romalrc) { var r = document.createElement('span'); r.className = 'sub-line sub-roma'; r.textContent = lrc[i].romalrc; r.style.color = _state.textColor; d.appendChild(r); }
      s.appendChild(d);
    }
  }
  _state.curIdx = idx;
  if (mode === 'scroll') scrollToLine(idx);
}
function calcIdx() {
  var playMs = getPlayMs(); var lrc = _state.lrc;
  for (var i = lrc.length - 1; i >= 0; i--) { if (playMs >= lrc[i].t * 1000) return i; }
  return -1;
}
function scrollToLine(idx) {
  var s = document.getElementById('lyric-scroll'); if (!s) return;
  if (idx < 0 || idx >= s.children.length) return;
  var target = s.children[idx]; if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function updateContent(d) {
  _state.lrc = d.lrc || [];
  _state.highlightColor = d.highlightColor || '#ff6b81';
  _state.textColor = d.textColor || '#ffffff';
  _state.fontSize = d.fontSize || 36;
  if (d.trackName) {
    document.getElementById('track-name').textContent = d.trackName;
    document.getElementById('track-artist').textContent = d.artist || '';
  }
  if (d.isPlaying !== undefined) {
    if (d.isPlaying && !_state.isPlaying) { _state.baseMs = (d.currentTime || 0) * 1000; _state.anchorTick = performance.now(); startRaf(); }
    else if (!d.isPlaying && _state.isPlaying) { stopRaf(); }
    _state.isPlaying = d.isPlaying;
    updatePlayBtn();
  }
  if (d.currentTime !== undefined && d.isPlaying) { _state.baseMs = d.currentTime * 1000; _state.anchorTick = performance.now(); }
  if (d.isLocked !== undefined && d.isLocked !== _state.isLocked) { _state.isLocked = d.isLocked; updateLockState(); }
  if (d.mode) _state.mode = d.mode;
  if (d.showTranslation !== undefined) _state.showTranslation = d.showTranslation;
  if (d.showRomalrc !== undefined) _state.showRomalrc = d.showRomalrc;
  if (d.alwaysShowBg !== undefined && d.alwaysShowBg !== _state.alwaysShowBg) {
    _state.alwaysShowBg = d.alwaysShowBg;
    if (_state.alwaysShowBg) document.body.classList.add('show-bg');
    else document.body.classList.remove('show-bg');
  }
  renderLines();
  updateModeBtn();
}
function startRaf() {
  stopRaf();
  (function tick(){ try { updateProgress(); } catch(e) { try { window.desktopLyricWinApi && window.desktopLyricWinApi.sendAction('__error__tick:' + String(e).slice(0,100)); } catch(ex) {} } _state.rafId = requestAnimationFrame(tick); })();
}
function stopRaf() { if (_state.rafId) { cancelAnimationFrame(_state.rafId); _state.rafId = null; } }
function updateProgress() {
  var playMs = getPlayMs(); var lrc = _state.lrc; if (!lrc.length) return;
  var idx = calcIdx();
  if (idx === _state.curIdx) {
    if (idx >= 0) {
      var k = document.querySelector('.lyric-line.current .karaoke');
      if (k) {
        var n = (idx + 1 < lrc.length) ? lrc[idx + 1].t * 1000 : lrc[idx].t * 1000 + 3000;
        var t = lrc[idx].t * 1000; var p = Math.max(0, Math.min(1, (playMs - t) / (n - t)));
        var pct = Math.round(p * 100);
        k.style.backgroundImage = 'linear-gradient(to right,' + _state.highlightColor + ' 0%,' + _state.highlightColor + ' ' + pct + '%,' + _state.textColor + ' ' + pct + '%,' + _state.textColor + ' 100%)';
        k.style.backgroundClip = 'text'; k.style.webkitBackgroundClip = 'text'; k.style.webkitTextFillColor = 'transparent';
      }
    }
    return;
  }
  _state.curIdx = idx;
  var s = document.getElementById('lyric-scroll'); if (!s) return;
  var fs = _state.fontSize; var hl = _state.highlightColor, tc = _state.textColor; var mode = _state.mode || 'scroll';
  for (var i = 0; i < s.children.length; i++) {
    var line = s.children[i]; var k = line.querySelector('.karaoke');
    if (!k) continue;
    var li = parseInt(line.dataset.idx) || i;
    line.classList.remove('current', 'past', 'next-line');
    if (li === idx) { line.classList.add('current'); k.style.fontSize = fs + 'px'; k.style.color = hl; k.style.backgroundImage = 'none'; k.style.backgroundClip = ''; k.style.webkitBackgroundClip = ''; k.style.webkitTextFillColor = ''; }
    else if (li < idx) { line.classList.add('past'); k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = tc; k.style.backgroundImage = 'none'; k.style.backgroundClip = ''; k.style.webkitBackgroundClip = ''; k.style.webkitTextFillColor = ''; }
    else { line.classList.add('next-line'); k.style.fontSize = (fs * 0.85) + 'px'; k.style.color = tc; k.style.backgroundImage = 'none'; k.style.backgroundClip = ''; k.style.webkitBackgroundClip = ''; k.style.webkitTextFillColor = ''; }
    var subs = line.querySelectorAll('.sub-line');
    for (var si = 0; si < subs.length; si++) { subs[si].style.color = tc; }
  }
  // 长歌词水平滚动：当前行内容超出容器宽度时平滑滚动
  var curLine = s.querySelector('.lyric-line.current');
  if (curLine && mode !== 'double') {
    var sw = curLine.querySelector('.scroll-wrap');
    var k = curLine.querySelector('.karaoke');
    if (sw && k) {
      var overflow = sw.scrollWidth - curLine.clientWidth;
      if (overflow > 0) {
        var curIdx = idx;
        var nxtT = (curIdx + 1 < lrc.length) ? lrc[curIdx + 1].t * 1000 : lrc[curIdx].t * 1000 + 3000;
        var curT = lrc[curIdx].t * 1000;
        var progress = (playMs - curT) / (nxtT - curT);
        var scrollStart = 0.2;
        if (progress > scrollStart) {
          var ratio = Math.min((progress - scrollStart) / (1 - scrollStart), 1);
          sw.style.transform = 'translateX(-' + Math.round(overflow * ratio) + 'px)';
        } else {
          sw.style.transform = 'translateX(0px)';
        }
      } else {
        sw.style.transform = 'translateX(0px)';
      }
    }
  }
  if (mode === 'scroll') scrollToLine(idx);
}
window.onerror = function(m,u,l) { try { window.desktopLyricWinApi && window.desktopLyricWinApi.sendAction('__error__' + m + '|L' + l); } catch(e){} };
(function hc(){ setInterval(function(){
  if (!_state.isPlaying || !_state.lrc.length) return;
  var pm = getPlayMs();
  if (pm > _state.lrc[_state.lrc.length - 1].t * 1000 + 10000) { _state.baseMs = 0; _state.anchorTick = performance.now(); }
  try { window.desktopLyricWinApi && window.desktopLyricWinApi.sendAction('__state__' + JSON.stringify({
    curIdx: _state.curIdx, baseMs: Math.round(_state.baseMs), playMs: Math.round(pm),
    idx: calcIdx(), isPlay: _state.isPlaying, lrcLen: _state.lrc.length,
    firstT: _state.lrc.length ? _state.lrc[0].t : -1, lastT: _state.lrc.length ? _state.lrc[_state.lrc.length - 1].t : -1
  })); } catch(e){}
}, 3000); })();
window.addEventListener('load', function() {
  if (_state.isPlaying) startRaf();
  setTimeout(function(){ if (!_state.isLocked) { var tb = document.getElementById('top-bar'); if (tb) { tb.classList.add('hidden'); _state.topBarHidden = true; } } }, 3000);
});
<\/script><\/body><\/html>`;
}

function startPoll() {
  if (_lyricPollTimer) clearInterval(_lyricPollTimer);
  _lyricPollTimer = setInterval(() => {
    if (!desktopLyricWin || desktopLyricWin.isDestroyed() || !desktopLyricConfig.isLocked) {
      if (_lyricPollTimer) clearInterval(_lyricPollTimer); _lyricPollTimer = null; return;
    }
    const cp = screen.getCursorScreenPoint();
    const bounds = desktopLyricWin.getBounds();
    const inside = cp.x >= bounds.x && cp.x <= bounds.x + bounds.width && cp.y >= bounds.y && cp.y <= bounds.y + bounds.height;
    // 锁按钮在窗口右上角区域：距右边缘 200px 内、距顶部 60px 内
    const nearLockBtn = inside && (bounds.x + bounds.width - cp.x) <= 200 && (cp.y - bounds.y) <= 60;
    if (nearLockBtn) {
      // 鼠标在锁按钮附近 → 取消鼠标穿透，让用户能点击解锁
      desktopLyricWin.setIgnoreMouseEvents(false);
      desktopLyricWin.webContents.executeJavaScript("document.getElementById('top-bar').classList.remove('hidden');").catch(() => {});
    } else if (inside) {
      // 鼠标在窗口内但不在锁按钮区 → 保持穿透，仅显示顶栏（锁按钮）
      desktopLyricWin.setIgnoreMouseEvents(true, { forward: true });
      desktopLyricWin.webContents.executeJavaScript("document.getElementById('top-bar').classList.remove('hidden');").catch(() => {});
    } else {
      // 鼠标在窗口外 → 穿透 + 隐藏顶栏
      desktopLyricWin.setIgnoreMouseEvents(true, { forward: true });
      desktopLyricWin.webContents.executeJavaScript("document.getElementById('top-bar').classList.add('hidden');").catch(() => {});
    }
  }, 100);
}

function createDesktopLyricWin() {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) { desktopLyricWin.show(); desktopLyricWin.focus(); return; }
  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const { width: screenW } = display.bounds;

    desktopLyricWin = new BrowserWindow({
      width: desktopLyricConfig.winWidth || 800,
      height: desktopLyricConfig.winHeight || 200,
      minWidth: 400, minHeight: 80,
      maxWidth: 1800, maxHeight: 600,
      x: desktopLyricConfig.winX != null ? desktopLyricConfig.winX : Math.round(screenW / 2 - 400),
      y: desktopLyricConfig.winY != null ? desktopLyricConfig.winY : Math.round(screenW * 0.15),
      frame: false, transparent: true, hasShadow: false,
      skipTaskbar: true,
      resizable: true, movable: true,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'desktop-lyric-preload.js') },
    });

    desktopLyricWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    desktopLyricWin.setAlwaysOnTop(true, 'floating');
    const html = generateDesktopLyricHtml();
    desktopLyricWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    let origW = desktopLyricConfig.winWidth;
    let origH = desktopLyricConfig.winHeight;

    desktopLyricWin.once('ready-to-show', () => { desktopLyricWin.showInactive(); sendDesktopLyricToWin(); });

    setTimeout(() => {
      if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
        desktopLyricWin.webContents.executeJavaScript(
          'typeof updateContent === "function" ? "[OK] updateContent ready" : "[ERR] updateContent missing"'
        ).then(function(r) { console.log('[desktop-lyric] HTML check:', r); }).catch(function(e) {
          console.error('[desktop-lyric] HTML check error:', String(e).slice(0, 200));
        });
      }
    }, 1000);

    desktopLyricWin.on('resize', () => {
      if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
        const [w, h] = desktopLyricWin.getSize();
        desktopLyricConfig.winWidth = w; desktopLyricConfig.winHeight = h;
        if (_desktopLyricResizeTimer) clearTimeout(_desktopLyricResizeTimer);
        _desktopLyricResizeTimer = setTimeout(saveDesktopLyricConfig, 500);
        // 字号自适应：高度 80~600px 映射到字号 16~64px
        var ratio = (h - 80) / (600 - 80);
        var fontSize = Math.round(16 + ratio * (64 - 16));
        fontSize = Math.max(16, Math.min(64, fontSize));
        desktopLyricConfig.fontSize = fontSize;
        desktopLyricWin.webContents.executeJavaScript('_state.fontSize = ' + fontSize + '; renderLines();').catch(function(){});
      }
    });

    desktopLyricWin.on('move', () => {
      if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
        const [wx, wy] = desktopLyricWin.getPosition();
        desktopLyricConfig.winX = wx; desktopLyricConfig.winY = wy;
        if (_desktopLyricResizeTimer) clearTimeout(_desktopLyricResizeTimer);
        _desktopLyricResizeTimer = setTimeout(saveDesktopLyricConfig, 500);
      }
    });

    desktopLyricWin.on('closed', () => {
      if (_lyricPollTimer) clearInterval(_lyricPollTimer);
      desktopLyricWin = null;
    });

    if (desktopLyricConfig.isLocked) { desktopLyricWin.setIgnoreMouseEvents(true, { forward: true }); startPoll(); }
    desktopLyricWin.on('will-resize', () => { const s = desktopLyricWin.getSize(); origW = s[0]; origH = s[1]; });

    console.log('[desktop-lyric] 窗口已创建');
  } catch (err) { console.error('[desktop-lyric] 创建失败:', err); }
}

function destroyDesktopLyricWin() {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    desktopLyricWin.setIgnoreMouseEvents(false);
    desktopLyricWin.close();
  }
  desktopLyricWin = null;
}

function sendDesktopLyricToWin() {
  if (!desktopLyricWin || desktopLyricWin.isDestroyed()) return;
  const data = {
    lrc: desktopLyricData.lrcArray || [],
    currentTime: desktopLyricData.currentTime || 0,
    trackName: desktopLyricData.trackName || '',
    artist: desktopLyricData.artist || '',
    isPlaying: desktopLyricData.isPlaying ?? false,
    mode: desktopLyricConfig.displayMode || 'scroll',
    highlightColor: desktopLyricConfig.highlightColor || '#ff6b81',
    textColor: desktopLyricConfig.textColor || '#ffffff',
    fontSize: desktopLyricConfig.fontSize || 36,
    isLocked: desktopLyricConfig.isLocked ?? false,
    showTranslation: desktopLyricData.showTranslation ?? true,
    showRomalrc: desktopLyricData.showRomalrc ?? false,
    alwaysShowBg: desktopLyricConfig.alwaysShowBg ?? false,
  };
  const js = 'updateContent(' + JSON.stringify(data) + ');';
  desktopLyricWin.webContents.executeJavaScript(js).catch(function(e) {
    console.error('[desktop-lyric] executeJavaScript 失败:', String(e).slice(0, 200));
  });
}

// ── 桌面歌词 IPC ──
ipcMain.handle('desktop-lyric:get-config', () => ({ ...desktopLyricConfig }));

ipcMain.handle('desktop-lyric:set-config', (_event, config) => {
  const prev = { ...desktopLyricConfig };
  desktopLyricConfig = { ...desktopLyricConfig, ...config };
  saveDesktopLyricConfig();

  // Sync desktop lyric show state for tray menu
  trayDesktopLyricShow = !!desktopLyricConfig.enabled;
  const menuWin = BrowserWindow.getAllWindows()[0];
  if (menuWin) setTrayMenu(menuWin);

  if (desktopLyricConfig.enabled !== prev.enabled) {
    if (desktopLyricConfig.enabled) createDesktopLyricWin();
    else destroyDesktopLyricWin();
  }
  if (desktopLyricConfig.enabled && (!desktopLyricWin || desktopLyricWin.isDestroyed())) createDesktopLyricWin();

  if (desktopLyricConfig.isLocked !== prev.isLocked && desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    if (desktopLyricConfig.isLocked) {
      desktopLyricWin.setIgnoreMouseEvents(true, { forward: true });
      const cp = screen.getCursorScreenPoint();
      desktopLyricWin.setPosition(Math.round(cp.x - 400), Math.round(cp.y - 100));
    } else {
      desktopLyricWin.setIgnoreMouseEvents(false);
    }
  }

  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) sendDesktopLyricToWin();
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
  });
});

ipcMain.on('desktop-lyric:move-window', (_event, { dx, dy }) => {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    const [x, y] = desktopLyricWin.getPosition();
    const [w, h] = desktopLyricWin.getSize();
    let newX = x + dx;
    let newY = y + dy;
    // 限制在虚拟屏幕范围内，保留至少 50px 在屏幕内
    const displays = screen.getAllDisplays();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of displays) {
      const b = d.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    newX = Math.min(Math.max(newX, minX - w + 50), maxX - 50);
    newY = Math.min(Math.max(newY, minY - h + 50), maxY - 50);
    desktopLyricWin.setPosition(newX, newY);
  }
});

ipcMain.handle('desktop-lyric:get-bounds', () => {
  if (!desktopLyricWin || desktopLyricWin.isDestroyed()) return null;
  return desktopLyricWin.getBounds();
});

ipcMain.handle('desktop-lyric:get-virtual-screen-bounds', () => {
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of displays) {
    const { x, y, width, height } = d.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  return { minX, minY, maxX, maxY };
});

ipcMain.on('desktop-lyric:resize', (_event, { width, height }) => {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    desktopLyricWin.setBounds({ width: Math.round(width), height: Math.round(height) });
  }
});

ipcMain.on('desktop-lyric:set-height', (_event, { height }) => {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    const [w] = desktopLyricWin.getSize();
    desktopLyricWin.setBounds({ width: w, height: Math.round(height) });
  }
});

ipcMain.on('desktop-lyric:toggle-fixed-size', (_event, { width, height, fixed }) => {
  if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
    if (fixed) {
      desktopLyricWin.setMaximumSize(Math.round(width), Math.round(height));
      desktopLyricWin.setMinimumSize(Math.round(width), Math.round(height));
    } else {
      desktopLyricWin.setMaximumSize(1800, 600);
      desktopLyricWin.setMinimumSize(400, 80);
    }
  }
});

ipcMain.on('desktop-lyric:update-data', (_event, data) => {
  try { console.log('[desktop-lyric] 收到数据:', { lrcLen: (data.lrcArray || []).length, curTime: data.currentTime, track: data.trackName, isPlay: data.isPlaying }); } catch {}
  desktopLyricData = {
    lrcArray: data.lrcArray || [],
    currentTime: data.currentTime || 0,
    trackName: data.trackName || '',
    artist: data.artist || '',
    isPlaying: data.isPlaying ?? false,
    showTranslation: data.showTranslation ?? true,
    showRomalrc: data.showRomalrc ?? false,
  };
  if (desktopLyricConfig.enabled && desktopLyricWin && !desktopLyricWin.isDestroyed()) sendDesktopLyricToWin();
});

// 桌面歌词动作（从窗口内部控制 → 广播给主窗口）
ipcMain.on('desktop-lyric:action', (_event, action) => {
  const mainWin = BrowserWindow.getAllWindows().find(w => w !== desktopLyricWin);
  if (!mainWin) return;

  switch (action) {
    case 'togglePlay': mainWin.webContents.send('tray:play-pause'); break;
    case 'next': mainWin.webContents.send('tray:next'); break;
    case 'prev': mainWin.webContents.send('tray:prev'); break;
    case 'toggleLock':
      desktopLyricConfig.isLocked = !desktopLyricConfig.isLocked;
      saveDesktopLyricConfig();
      if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
        if (desktopLyricConfig.isLocked) { desktopLyricWin.setIgnoreMouseEvents(true, { forward: true }); startPoll(); }
        else desktopLyricWin.setIgnoreMouseEvents(false);
        sendDesktopLyricToWin();
      }
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
      });
      break;
    case 'close':
      desktopLyricConfig.enabled = false;
      saveDesktopLyricConfig();
      destroyDesktopLyricWin();
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
      });
      break;
    case 'fontSizeUp':
    case 'fontSizeDown':
      desktopLyricConfig.fontSize = Math.max(16, Math.min(72, desktopLyricConfig.fontSize + (action === 'fontSizeUp' ? 4 : -4)));
      saveDesktopLyricConfig();
      if (desktopLyricWin && !desktopLyricWin.isDestroyed()) {
        // 字号变化同步调整窗口高度（16→100px, 72→500px）
        var ratio = (desktopLyricConfig.fontSize - 16) / (72 - 16);
        var newH = Math.round(100 + ratio * (500 - 100));
        var [curW] = desktopLyricWin.getSize();
        desktopLyricWin.setBounds({ width: curW, height: newH });
        sendDesktopLyricToWin();
      }
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
      });
      break;
    case 'openSettings':
      dispatchMainWindowTrayAction('openSettings');
      break;
    case 'switchMode':
      // handled below (starts with "switchMode|")
      break;
    default:
      if (typeof action === 'string' && action.startsWith('setColor|')) {
        const color = action.slice(9);
        if (/^#[0-9a-fA-F]{6}$/.test(color)) {
          desktopLyricConfig.highlightColor = color;
          saveDesktopLyricConfig();
          if (desktopLyricWin && !desktopLyricWin.isDestroyed()) sendDesktopLyricToWin();
          BrowserWindow.getAllWindows().forEach((w) => {
            w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
          });
        }
      } else if (typeof action === 'string' && action.startsWith('setTextColor|')) {
        const color = action.slice(13);
        desktopLyricConfig.textColor = color;
        saveDesktopLyricConfig();
        if (desktopLyricWin && !desktopLyricWin.isDestroyed()) sendDesktopLyricToWin();
        BrowserWindow.getAllWindows().forEach((w) => {
          w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
        });
      } else if (typeof action === 'string' && action.startsWith('switchMode|')) {
        const mode = action.slice(11);
        if (['scroll','single','double'].includes(mode)) {
          desktopLyricConfig.displayMode = mode;
          saveDesktopLyricConfig();
          if (desktopLyricWin && !desktopLyricWin.isDestroyed()) sendDesktopLyricToWin();
          BrowserWindow.getAllWindows().forEach((w) => {
            w.webContents.send('desktop-lyric:config-changed', { ...desktopLyricConfig });
          });
        }
      } else if (typeof action === 'string' && action.startsWith('__error__')) {
        console.error('[desktop-lyric:page-error]', action.replace('__error__', ''));
      }
      if (typeof action === 'string' && action.startsWith('__state__')) {
        console.log('[desktop-lyric:state]', action.replace('__state__', ''));
      }
  }
});

// ── 系统托盘歌词 IPC ──

ipcMain.handle('tray-lyric:get-config', () => ({ ...getTrayLyricConfig() }));

ipcMain.handle('tray-lyric:set-config', (_event, config) => {
  const updated = setTrayLyricConfig(config);

  // Notify renderer of config change
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('tray-lyric:config-changed', { ...updated });
  });

  // Rebuild tray menu
  const trayWin = BrowserWindow.getAllWindows()[0];
  if (trayWin) setTrayMenu(trayWin);
});

// Receives lyric line update from renderer
ipcMain.on('lyric:update', (_event, data) => {
  const { line, trackName, artist, isPlaying } = data || {};
  updateTrayLyricData(line || '', trackName || '', artist || '', !!isPlaying);
});

// ── 系统托盘菜单通信 ──

// Renderer reports song change
ipcMain.on('play-song-change', (_event, data) => {
  if (data && data.name) {
    traySongName = data.name;
    trayCurrentTrackName = data.name;
    trayCurrentArtist = data.artist || '';
    const win = BrowserWindow.getAllWindows()[0];
    if (win) setTrayMenu(win);
  }
});

// Renderer reports play status change
ipcMain.on('play-status-change', (_event, playing) => {
  trayCurrentPlaying = !!playing;
  engineIsPlaying = !!playing;
  if (engineIsPlaying) {
    engineStartInterpolation();
  } else {
    engineStopInterpolation();
    engineUpdateDisplay(true);
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win) setTrayMenu(win);
});

// Renderer reports like status change
ipcMain.on('like-status-change', (_event, liked) => {
  trayIsLiked = !!liked;
  const win = BrowserWindow.getAllWindows()[0];
  if (win) setTrayMenu(win);
});

// Renderer reports desktop lyric show state change
ipcMain.on('desktop-lyric-show-change', (_event, show) => {
  trayDesktopLyricShow = !!show;
  const win = BrowserWindow.getAllWindows()[0];
  if (win) setTrayMenu(win);
});

// ── 升级数据契约：完整歌词数组 + 精确进度 ──

// Receives full lyrics array (triggered when lyrics load or track changes)
ipcMain.on('tray-lyric:sync-state', (_event, payload) => {
  if (!payload || !payload.type) return;
  switch (payload.type) {
    case 'lyrics-loaded': {
      engineLyricLines = payload.data?.lines || [];
      engineLastLyricIndex = -1;
      engineUpdateDisplay(true);
      break;
    }
    case 'playback-state': {
      engineIsPlaying = !!payload.data?.isPlaying;
      trayCurrentPlaying = engineIsPlaying;
      const w = BrowserWindow.getAllWindows()[0];
      if (w) setTrayMenu(w);
      if (engineIsPlaying) {
        engineStartInterpolation();
      } else {
        engineStopInterpolation();
        engineUpdateDisplay(true);
      }
      break;
    }
    case 'track-change': {
      engineLyricLines = [];
      engineLastLyricIndex = -1;
      engineCurrentTime = 0;
      if (payload.data?.title) {
        trayCurrentTrackName = payload.data.title;
        trayCurrentArtist = payload.data.artist || '';
        traySongName = payload.data.title;
      }
      engineUpdateDisplay(true);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) setTrayMenu(win);
      break;
    }
    case 'full-hydration': {
      const d = payload.data;
      if (d?.lyrics?.lines) {
        engineLyricLines = d.lyrics.lines;
        engineLastLyricIndex = -1;
      }
      if (d?.playback) {
        engineIsPlaying = !!d.playback.isPlaying;
        if (d.playback.tick) {
          engineCurrentTime = d.playback.tick[0] || 0;
          engineOffset = d.playback.tick[2] || 0;
        }
      }
      if (d?.track?.title) {
        trayCurrentTrackName = d.track.title;
        trayCurrentArtist = d.track.artist || '';
        traySongName = d.track.title;
      }
      engineUpdateDisplay(true);
      if (engineIsPlaying) engineStartInterpolation();
      const win = BrowserWindow.getAllWindows()[0];
      if (win) setTrayMenu(win);
      break;
    }
  }
});

// Receives high-frequency progress tick
ipcMain.on('tray-lyric:sync-tick', (_event, payload) => {
  if (!payload || !Array.isArray(payload)) return;
  const [currentTime, _duration, offset] = payload;
  if (currentTime !== undefined) {
    const diff = Math.abs(currentTime - engineCurrentTime);
    if (!(diff <= ENGINE_SYNC_THRESHOLD_MS && engineIsPlaying)) {
      engineCurrentTime = currentTime;
      engineLastUpdateTime = Date.now();
    }
  }
  if (offset !== undefined) engineOffset = offset;
  engineUpdateDisplay(true);
  if (engineIsPlaying) engineStartInterpolation();
});
