import { app, BrowserWindow, Menu, ipcMain, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveServicePorts } from './port-manager.js';
import { startAllServices, waitApiReady, killAllServices } from './serviceManager.js';
import { LocalMusicDB } from './services/db/LocalMusicDB.js';
import { NodeMusicScanner } from './services/scanner/NodeMusicScanner.js';
import { registerLocalMusicIpc } from './services/ipc/localMusicIpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.commandLine.appendSwitch('no-sandbox');

// ── 单实例锁 ──
// 防止用户误触多开导致数据冲突或端口占用
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[main] 已有实例在运行，退出当前实例');
  app.quit();
}

// ═══════════════════════════════════════════════════════════════════
// 崩溃熔断 / 启动循环检测系统
// 规则四：连续崩溃计数 + 熔断 + 永久熔断锁
// 规则六：启动原因可追踪 + 单一入口
// ═══════════════════════════════════════════════════════════════════

const CRASH_THRESHOLD = 3;         // 60 秒内连续崩溃阈值
const CRASH_WINDOW_MS = 60000;     // 时间窗口

// ── 用户数据目录基路径（app.getPath('userData') 在 ready 后才能调用） ──
// 熔断锁检测早于 ready，因此使用固定的相对路径 + 应用支持目录
function userDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Resound-Player');
  }
  // fallback
  return path.join(home, '.resound-player');
}

function crashMarkerPath() {
  return path.join(userDataDir(), 'crash-marker.json');
}

function fuseLockPath() {
  return path.join(userDataDir(), 'crash-fuse.lock');
}

function readCrashMarker() {
  try {
    const p = crashMarkerPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return null; }
}

function writeCrashMarker(count, firstCrashAt) {
  try {
    const p = crashMarkerPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ count, firstCrashAt }), 'utf-8');
  } catch (e) {
    console.warn('[crash-guard] 写入崩溃标记失败:', e.message);
  }
}

function clearCrashMarker() {
  try {
    const p = crashMarkerPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.warn('[crash-guard] 清除崩溃标记失败:', e.message);
  }
}

/**
 * 写入熔断锁 — 熔断触发后写入，永不自动删除。
 * 用户需手动运行清理命令后才能再次启动。
 */
function writeFuseLock() {
  try {
    const p = fuseLockPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      triggeredAt: Date.now(),
      message: '应用因连续崩溃被熔断锁锁定，请手动清理后重新启动',
    }), 'utf-8');
    console.error(`[crash-guard] ⛔ 熔断锁已写入: ${p}`);
  } catch (e) {
    console.warn('[crash-guard] 写入熔断锁失败:', e.message);
  }
}

function checkFuseLockExists() {
  try {
    return fs.existsSync(fuseLockPath());
  } catch {
    return false;
  }
}

function clearFuseLock() {
  try {
    const p = fuseLockPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    console.log('[crash-guard] 熔断锁已清除');
  } catch (e) {
    console.warn('[crash-guard] 清除熔断锁失败:', e.message);
  }
}

/**
 * 熔断锁提前检测 — 在 app.whenReady() 之前执行，
 * 发现熔断锁时立即退出，不初始化任何 Electron 资源。
 * 规则四：禁止熔断后静默重试；熔断后禁用自动启动
 */
function earlyFuseLockCheck() {
  if (checkFuseLockExists()) {
    // 只在首次检测时打印一次
    if (!process.env._RESOUND_FUSE_CHECKED) {
      process.env._RESOUND_FUSE_CHECKED = '1';
      console.error('');
      console.error('═══════════════════════════════════════════════════════');
      console.error('  ⛔ 熔断锁已触发 — 应用已被锁定');
      console.error('  请在终端执行以下命令解锁：');
      console.error(`  rm -f "${fuseLockPath()}"`);
      console.error('═══════════════════════════════════════════════════════');
      console.error('');
    }
    // 立即退出，不启动 Electron
    process.exit(0);
  }
}

// 在模块加载时立即检查熔断锁
earlyFuseLockCheck();

/**
 * 启动前检查连续崩溃计数器。
 * @returns {boolean} true=可以继续启动，false=触发熔断
 */
function checkCrashCircuitBreaker() {
  const marker = readCrashMarker();
  const now = Date.now();

  if (!marker) {
    // 首次启动或上次正常退出 → 写标记并放行
    writeCrashMarker(1, now);
    console.log('[crash-guard] 首次启动标记已写入');
    return true;
  }

  const elapsed = now - marker.firstCrashAt;

  // 窗口过期 → 重置计数
  if (elapsed > CRASH_WINDOW_MS) {
    writeCrashMarker(1, now);
    console.log('[crash-guard] 崩溃窗口已过期，重置计数器');
    return true;
  }

  const newCount = marker.count + 1;
  writeCrashMarker(newCount, marker.firstCrashAt);
  console.log(`[crash-guard] 连续崩溃第 ${newCount} 次 (窗口内 ${CRASH_WINDOW_MS / 1000}s)`);

  if (newCount >= CRASH_THRESHOLD) {
    console.error(`[crash-guard] ⚠️ 熔断触发：${CRASH_WINDOW_MS / 1000}s 内连续崩溃 ${newCount} 次`);
    // 规则四：熔断后写入永久熔断锁 + 禁用自动启动
    writeFuseLock();
    return false;
  }

  return true;
}

// ── 启动循环递归防护锁 ──
// 规则六：禁止从恢复逻辑中重新触发启动流程
let _bootstrapInProgress = false;       // bootstrap 正在执行中
let _bootstrapCompleted = false;         // bootstrap 已完整结束
let _circuitBreakerTripped = false;      // 熔断器已触发

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
        { role: 'togglefullscreen', label: '全屏' },
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
          click: async () => {
            const { dialog } = await import('electron');
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
        { role: 'togglefullscreen', label: '全屏' },
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
    // macOS: titleBarStyle hidden → 红绿灯 hover 显示、无原生标题栏边条
    // 其他平台：frame: false → 无边框，依赖自定义控件
    ...(isMac
      ? { titleBarStyle: 'customButtonsOnHover' }
      : { frame: false }
    ),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
      additionalArguments: portArgs,
    },
  });

  // ── CSP 策略（生产环境强制）──
  // 限制脚本和连接来源，防止 XSS → RCE
  if (app.isPackaged) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "connect-src 'self' http://127.0.0.1:* blob: data:",
            "img-src 'self' data: blob: http://* https://*",
            "media-src 'self' blob: http://127.0.0.1:*",
            "font-src 'self' data:",
          ].join('; '),
        },
      });
    });
  }

  // 内容准备就绪后再显示窗口，避免 resize 时因 GPU 效果滞后导致卡顿
  win.once('ready-to-show', () => {
    win.show();
  });

  // 向渲染进程广播窗口最大化状态变更（供右上角自定义按钮切换图标）
  win.on('maximize', () => {
    win.webContents.send('win-state-change', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('win-state-change', false);
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
      }
      // 延迟恢复原标题，确保 macOS 窗口动画（~350ms）完成后再重置
      setTimeout(() => {
        if (!win.isDestroyed()) win.setTitle(_originalTitle || 'Resound-Player');
      }, 500);
    } else {
      _originalTitle = title;
    }
  });

  // ── 阻止页面内导航和外链弹窗 ──
  win.webContents.on('will-navigate', (event, url) => {
    // 仅允许加载自身 dist 页面或开发服务器 URL
    const allowed = [
      'file://' + path.join(__dirname, '..', 'dist', 'index.html'),
      process.env.VITE_DEV_SERVER_URL || '',
    ].filter(Boolean);
    if (!allowed.some((a) => url.startsWith(a))) {
      console.warn(`[main] 阻止未授权导航: ${url}`);
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[main] 阻止外部弹窗: ${url}`);
    return { action: 'deny' };
  });

  // ── GPU 进程崩溃降级 ──
  win.webContents.on('gpu-process-crashed', (_event, killed) => {
    console.error(`[main] GPU 进程崩溃 (killed=${killed})，尝试禁用硬件加速重启`);
    app.commandLine.appendSwitch('disable-gpu');
    app.relaunch();
    app.exit(0);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

/**
 * Show an error window when startup fails.
 */
async function createErrorWindow(errorMessage) {
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
  errorWin.on('closed', () => app.quit());
}

async function bootstrap() {
  // ── 规则四：熔断检查 ──
  if (!checkCrashCircuitBreaker()) {
    _circuitBreakerTripped = true;
    await createErrorWindow(
      '应用检测到连续崩溃循环，已自动熔断保护。<br><br>'
      + `系统已写入熔断锁，阻止自动重启。<br><br>`
      + '请尝试：<br>'
      + '1. 重启 Mac<br>'
      + '2. 如问题持续，运行以下命令解锁后重新启动：<br>'
      + `<code style="font-size:12px;word-break:break-all">rm -f ~/Library/Application\\ Support/Resound-Player/crash-fuse.lock</code><br><br>`
      + '<small style="color:rgba(255,255,255,0.45)">熔断锁文件路径：~/Library/Application Support/Resound-Player/crash-fuse.lock</small>'
    );
    return;
  }

  // ── 规则六：递归防护 ──
  if (_bootstrapInProgress) {
    console.warn('[main] bootstrap 已在执行中，跳过重复调用');
    return;
  }
  if (_bootstrapCompleted) {
    console.warn('[main] bootstrap 已完成，跳过重复调用');
    return;
  }

  _bootstrapInProgress = true;

  try {
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
        console.log('[main] 自动探测端口:', ports);
      } catch (err) {
        await createErrorWindow(`端口探测失败: ${err.message}`);
        return;
      }
    }

    // ── Start backend services ──
    // In dev mode (SERVICE_PORTS from orchestrator), unblock services are already
    // started by the orchestrator, but the Netease API still needs to be spawned here.
    // In production (packaged app), all services are started here.
    const isDev = !!process.env.SERVICE_PORTS;
    try {
      serviceChildren = startAllServices({
        api: ports.api,
        unblockProxy: ports.unblockProxy,
        unblockMatch: ports.unblockMatch,
      }, isDev);  // pass flag to skip unblock in dev mode
    } catch (err) {
      await createErrorWindow(`启动后端服务失败: ${err.message}`);
      return;
    }
    serviceChildren._ports = ports;

    // ── Wait for API to be ready ──
    const timeoutMs = process.platform === 'win32' ? 60000 : 45000;
    console.log(`[main] 等待 API 就绪 (:${ports.api}, 超时 ${timeoutMs}ms)...`);
    const ready = await waitApiReady(`http://127.0.0.1:${ports.api}`, timeoutMs);

    if (!ready) {
      killAllServices(serviceChildren);
      await createErrorWindow(`API 服务未能在 ${timeoutMs / 1000} 秒内就绪。<br>请检查端口 ${ports.api} 是否被占用。`);
      return;
    }

    // ── 注册 local:// 协议（本地文件播放）──
    // Electron 34+: registerFileProtocol → protocol.handle
    protocol.handle('local', (request) => {
      try {
        let filePath = decodeURIComponent(request.url.replace(/^local:\/\//, ''));
        if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1);
        filePath = path.normalize(filePath);
        if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
        return net.fetch('file://' + filePath);
      } catch {
        return new Response(null, { status: 500 });
      }
    });

    // ── 初始化本地音乐服务 ──
    let localMusicDb, localMusicScanner;
    try {
      localMusicDb = new LocalMusicDB();
      await localMusicDb.init();
      localMusicScanner = new NodeMusicScanner();
      registerLocalMusicIpc(localMusicScanner, localMusicDb);
      console.log('[main] 本地音乐服务就绪');
    } catch (err) {
      console.warn('[main] 本地音乐服务初始化失败:', err.message);
    }

    // ── 创建主窗口 ──
    console.log('[main] API 就绪，创建主窗口...');
    setupChineseMenu();
    await createMainWindow(ports);
    console.log('[main] 启动流程完成，端口:', ports);

    // ── 标记启动完成 ──
    _bootstrapCompleted = true;
    _bootstrapInProgress = false;
    clearCrashMarker();
  } catch (err) {
    _bootstrapInProgress = false;
    console.error('[main] 启动流程异常:', err);
    // 崩溃标记已在 checkCrashCircuitBreaker 中写入，无需重复写
    await createErrorWindow(`启动异常: ${err.message || err}`);
  }
}

app.whenReady().then(bootstrap);

// ── 规则四：未捕获异常时也保留崩溃标记 ──
process.on('uncaughtException', (err) => {
  console.error('[main] 未捕获异常:', err);
  // 不清理崩溃标记，确保下次启动时计数器递增
  // 阻止进程继续运行
  setImmediate(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] 未处理的 Promise 拒绝:', reason);
  // 同样保留崩溃标记
});

// ── 规则一：禁止在启动回调中触发重启 ──
// activate 仅用于 macOS 点击 Dock 图标重新显示窗口，
// 禁止在此 handler 中重新执行 bootstrap 或重启流程。
app.on('activate', () => {
  if (_circuitBreakerTripped) {
    console.warn('[main] activate 被熔断状态阻止，跳过');
    return;
  }
  if (_bootstrapInProgress) {
    console.log('[main] activate 触发但 bootstrap 正在进行中，跳过');
    return;
  }
  if (_bootstrapCompleted) {
    // 正常重建窗口（不重启 bootstrap）
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('[main] activate：重建窗口...');
      // 仅使用已完成的 ports，不重新启动服务
      const ports = serviceChildren._ports;
      if (ports) {
        createMainWindow(ports).catch(err => {
          console.error('[main] 重建窗口失败:', err);
        });
      }
    }
    return;
  }
  // 从未启动过 → 首次启动
  if (BrowserWindow.getAllWindows().length === 0) bootstrap();
});

// ── 单实例锁：第二实例聚焦已有窗口 ──
app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const mainWin = windows[0];
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

// ── 规则三：保持窗口生命周期 ──
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── 规则四：正常退出时重置崩溃计数器 ──
// 注意：熔断状态下只清崩溃标记（干净退出痕迹），不清熔断锁（需用户手动清理）
app.on('will-quit', () => {
  if (_circuitBreakerTripped) {
    console.log('[main] 熔断态退出，保留熔断锁，清除崩溃标记');
  } else {
    console.log('[main] 正常退出，清除崩溃标记');
  }
  clearCrashMarker();
  killAllServices(serviceChildren);
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
  bw?.close();
});

// ── 缓存持久化 IPC ──
const CACHE_FILE = path.join(app.getPath('userData'), 'api-cache.json');

ipcMain.handle('cache:get', () => {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('cache:set', (_event, data) => {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, data, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('cache:clear', () => {
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    return true;
  } catch {
    return false;
  }
});