# Electron 窗口控制按钮实现说明

## 最终方案：document.title + page-title-updated 事件

绕过 `contextBridge` / `ipcRenderer`，利用 `document.title` 变化触发 `page-title-updated` 事件，在主进程中拦截并执行窗口操作。

### 核心原理

```
渲染进程按钮点击 → document.title = 'cmd:xxx:timestamp'
  → Electron 主进程 page-title-updated 事件
    → event.preventDefault() 阻止标题实际变更
    → win.minimize() / win.maximize() / win.unmaximize()
```

这种方案不依赖任何 IPC 机制，在 `contextIsolation: true` 模式下依然可靠。

**关闭按钮**使用原生 `window.close()`，Electron 会自动将其转为 `BrowserWindow.close()`。

---

## 涉及的代码文件

### 1. `electron/main.js` — 主进程事件监听

#### BrowserWindow 创建

```javascript
const isMac = process.platform === 'darwin';

win = new BrowserWindow({
  width: 1280,
  height: 820,
  minWidth: 1100,
  minHeight: 700,
  show: false,                              // 先隐藏，等就绪再显示
  backgroundColor: '#1a1a2e',               // 必须匹配 theme.css 的 html 背景色
  // macOS: titleBarStyle → 红绿灯 hover 显示、无原生标题栏边条
  // 其他平台：frame: false → 无边框，依赖自定义控件
  ...(isMac
    ? { titleBarStyle: 'customButtonsOnHover' }
    : { frame: false }
  ),
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,            // 窗口动画期间不节流 RAF
  },
});

// 内容就绪后再显示，避免首帧白屏 + resize 时 GPU 滞后
win.once('ready-to-show', () => { win.show(); });

// 最大化/还原状态广播 → 渲染进程切换图标
win.on('maximize', ()   => win.webContents.send('win-state-change', true));
win.on('unmaximize', () => win.webContents.send('win-state-change', false));
```

#### 窗口控制事件监听（必须在 loadURL 之前注册）

`page-title-updated` 事件监听器必须在 `win.loadURL()` / `win.loadFile()` **之前**注册，确保从页面加载初期就能捕获 `document.title` 变更。

使用 `title.startsWith('cmd:')` 匹配命令，通过 `title.split(':')[1]` 提取指令：

```javascript
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

await win.loadURL(process.env.VITE_DEV_SERVER_URL);
```

### 2. `electron/preload.js` — 最大化状态同步

preload 不暴露任何窗口控制 API。仅负责将主进程广播的 `win-state-change` 同步到 DOM dataset：

```javascript
// preload.js — 末尾
ipcRenderer.on('win-state-change', (_event, maximized) => {
  if (maximized) {
    document.documentElement.dataset.winMaximized = '';
  } else {
    delete document.documentElement.dataset.winMaximized;
  }
});

// 标记桌面端，供 CSS 选择器控制平台专属 UI 显隐
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
});
```

### 3. `src/utils/platform.ts` — 平台检测

`winControls` getter 已移除。只保留 `isDesktop` 的 UA 兜底检测供 `v-if` 使用：

```typescript
get isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  // 优先通过 preload contextBridge 检测
  if (!!(window as any).appEnv?.isDesktop) return true
  // 兜底：User-Agent 检测（不受 contextBridge 影响）
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
}
```

### 4. `src/components/TopBar.vue` — 渲染进程按钮

#### Template

```html
<div v-if="platform.isDesktop" class="win-controls">
  <button class="win-btn" type="button" title="最小化" @click="minimizeWindow">
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
    </svg>
  </button>
  <button class="win-btn" type="button" :title="isMaximized ? '还原' : '最大化'" @click="maximizeWindow">
    <svg v-if="isMaximized" width="12" height="12" viewBox="0 0 12 12">
      <!-- 还原图标：两层矩形 -->
      <rect x="2" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
      <rect x="0.5" y="2" width="9" height="9" rx="1" fill="var(--bg-surface)" stroke="currentColor" stroke-width="1"/>
    </svg>
    <svg v-else width="12" height="12" viewBox="0 0 12 12">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
    </svg>
  </button>
  <button class="win-btn win-btn--close" type="button" title="关闭" @click="closeWindow">
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.2" fill="none"/>
    </svg>
  </button>
</div>
```

#### Script

标题命令带 `Date.now()` 时间戳后缀，确保每次点击生成唯一值，防止 Electron 对已 `preventDefault` 的标题去重导致事件不触发。

```typescript
import { platform } from '../utils/platform';

const isMaximized = ref(false);

function minimizeWindow() { document.title = 'cmd:minimize:' + Date.now(); }
function maximizeWindow() {
  document.title = (isMaximized.value ? 'cmd:restore:' : 'cmd:maximize:') + Date.now();
}
function closeWindow() { window.close(); }

// 监听最大化状态变更：data-win-maximized 存在即表示已最大化
onMounted(() => {
  isMaximized.value = 'winMaximized' in document.documentElement.dataset;
  const observer = new MutationObserver(() => {
    isMaximized.value = 'winMaximized' in document.documentElement.dataset;
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-win-maximized'],
  });
  onBeforeUnmount(() => observer.disconnect());
});
```

#### CSS：拖拽区域

```css
.topbar { -webkit-app-region: drag; }
.nav-btn,
.search-wrap,
.user-menu-wrap,
.win-controls { -webkit-app-region: no-drag; }
```

---

## 最大化状态同步链路

```
主进程 win.on('maximize')
  → webContents.send('win-state-change', true)
    → preload: ipcRenderer.on('win-state-change')
      → document.documentElement.dataset.winMaximized = ''
        → TopBar.vue: MutationObserver 触发
          → isMaximized.value = true
            → 按钮图标切换为「还原」
```

## 跨平台差异

| 平台 | 窗口参数 | 红绿灯 | 自定义按钮 | 拖拽区域 |
|------|---------|--------|-----------|---------|
| macOS | `titleBarStyle: 'customButtonsOnHover'` | 原生，默认隐藏，hover 显示 | 右侧显示，始终可见 | `.topbar` + drag |
| Windows | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |
| Linux | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |

## 关键发现

1. **`contextBridge` 的函数代理不可靠** — Electron 34 中，通过 `contextBridge` 暴露的函数无法正常调用，但属性可读。因此窗口控制不能依赖 `contextBridge` 暴露的函数。
2. **`postMessage` 不通** — `contextIsolation: true` 时，两个世界的 `window` 是隔离的。
3. **`document.title` → `page-title-updated` 可靠** — 唯一可靠的跨世界通信方式。
4. **`window.close()` 原生可用** — 关闭窗口不需要任何 IPC。
5. **标题命令必须带时间戳** — 确保 `page-title-updated` 每次都能触发，防止 Electron 去重。
6. **最大化/还原使用分离命令** — `cmd:maximize` 和 `cmd:restore`，避免依赖 `win.isMaximized()` 的状态判断。
7. **frameless 窗口二次最大化修复** — `win.unmaximize()` 后调用 `win.maximize()` 前必须重置 `win.setMaximizable(true)`，解决已知 Electron bug。
8. **`backgroundColor` 必须匹配 CSS `html` 背景色** — 统一为 `#1a1a2e`，避免最大化动画期间出现色差边框。
9. **`backgroundThrottling: false` 消除动画卡顿** — 窗口最大化/还原动画期间，Electron 默认会节流 `requestAnimationFrame`。
10. **`show: false` + `ready-to-show` 提升首屏体验** — 避免窗口在内容就绪前显示导致的 GPU 滞后。

## 探明不可行的方案

| 方案 | 原因 |
|------|------|
| `contextBridge` 暴露函数 | 函数代理在 Electron 34 中不可调用，属性可读 |
| `CustomEvent` + `document.addEventListener` | `contextIsolation: true` 下事件不跨世界传播 |
| `window.postMessage` | 两个世界的 `window` 实例不同，消息不透传 |

## 参考

- [macOS 红绿灯按钮实现说明](../docs/macOS%20红绿灯按钮实现说明.md)
- [桌面端窗口控制按钮检测方案](../docs/桌面端窗口控制按钮检测方案.md)
- [跨平台开发规范](../docs/跨平台开发规范.md)