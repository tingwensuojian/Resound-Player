# macOS 红绿灯按钮实现说明

## 需求

macOS 上需要同时满足：

- 隐藏原生标题栏边条（窗口顶部无灰色横条）
- 原生红绿灯按钮常态显示，包含全屏状态
- 右上角自建的最小化、最大化/还原、关闭按钮继续保留
- Windows/Linux 不受影响，保持无边框 + 自定义按钮

## 最终方案

### 核心原理

利用 Electron 的 `frame: false` + `titleBarStyle: 'hidden'` + `trafficLightPosition`（macOS 独占）：

- `frame: false` 去掉原生标题栏框架，使页面内容接管窗口顶部区域
- `titleBarStyle: 'hidden'` 隐藏原生标题文字与标题栏横条，同时保留原生红绿灯
- `trafficLightPosition: { x: 20, y: 14 }` 手动控制红绿灯位置，避免过低或压住页面内容
- 红绿灯作为系统 overlay 置于 web 内容之上，不占用 DOM 布局空间
- 播放页全屏在桌面端必须走 Electron 窗口全屏命令，不能走 DOM `requestFullscreen()`
- macOS 使用 `BrowserWindow.setSimpleFullScreen()`，避免进入 macOS 原生全屏 Space 后出现系统标题栏灰色边条
- Windows/Linux 使用 `BrowserWindow.setFullScreen()`
- 右上角自建窗口按钮继续保留，macOS 原生红绿灯与自建按钮可以同时存在
- 全屏和小窗口状态下，红绿灯都保持常态显示

所有桌面平台都保留右侧自定义按钮；macOS 额外保留左上角原生红绿灯。

---

## 涉及的代码文件

### 1. `electron/main.js` — 窗口创建与全屏控制

#### 窗口选项

```js
const isMac = process.platform === 'darwin';

win = new BrowserWindow({
  width: 1280,
  height: 820,
  minWidth: 1100,
  minHeight: 700,
  show: false,
  backgroundColor: '#1a1a2e',           // 必须匹配 theme.css 的 html 背景色
  // macOS: 常态显示原生红绿灯，并保留自定义内容区
  // titleBarStyle: 'hidden' → 隐藏原生标题文字/横条，红绿灯保持常态可见
  // trafficLightPosition → 控制红绿灯位置，避免压住页面内容
  // 其他平台：frame: false → 无边框，依赖自定义控件
  ...(isMac
    ? { frame: false, titleBarStyle: 'hidden', trafficLightPosition: { x: 20, y: 14 } }
    : { frame: false }
  ),
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,        // 窗口动画期间不节流 RAF
  },
});
```

> **说明**：当前方案要求红绿灯常态显示，因此使用 `titleBarStyle: 'hidden'`，不要改回 `customButtonsOnHover`。`customButtonsOnHover` 会让红绿灯恢复为 hover 才显示，与当前交互要求不一致。

#### 最大化状态广播

```js
win.on('maximize', () => {
  win.webContents.send('win-state-change', true);
});
win.on('unmaximize', () => {
  win.webContents.send('win-state-change', false);
});
```

用于渲染进程切换自定义按钮的图标（最大化 ↔ 还原）。

#### 窗口控制事件监听

窗口控制通过 `document.title` → `page-title-updated` 事件实现（不依赖 IPC/contextBridge）。播放页全屏在桌面端也走同一条命令通道，最终由主进程按平台选择窗口全屏方式：macOS 使用 `setSimpleFullScreen()`，Windows/Linux 使用 `setFullScreen()`。

```js
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
      // frameless 窗口二次最大化修复
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
```

#### 全屏状态广播

```js
win.on('enter-full-screen', () => {
  win.webContents.send('win-fullscreen-change', true);
});
win.on('leave-full-screen', () => {
  win.webContents.send('win-fullscreen-change', false);
});
```

播放页根据 `win-fullscreen-change` 更新按钮图标，不再依赖 DOM fullscreen 状态。

---

### 2. `electron/preload.js` — 最大化状态同步

preload 不暴露任何窗口控制 API，只负责将主进程广播的状态同步到 DOM dataset：

```js
// 主进程广播最大化状态 → data-win-maximized 渲染进程通过 MutationObserver 获取
ipcRenderer.on('win-state-change', (_event, maximized) => {
  if (maximized) {
    document.documentElement.dataset.winMaximized = '';
  } else {
    delete document.documentElement.dataset.winMaximized;
  }
});

// 主进程广播全屏状态 → data-win-fullscreen 渲染进程通过 MutationObserver 获取
ipcRenderer.on('win-fullscreen-change', (_event, fullscreen) => {
  if (fullscreen) {
    document.documentElement.dataset.winFullscreen = '';
  } else {
    delete document.documentElement.dataset.winFullscreen;
  }
});

// 标记桌面端
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
});
```

---

### 3. `src/components/TopBar.vue` — 渲染进程窗口控制

#### 模板：右侧自定义按钮

```html
<div v-if="platform.isDesktop" class="win-controls">
  <button class="win-btn" type="button" title="最小化" @click="minimizeWindow">
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
    </svg>
  </button>
  <button class="win-btn" type="button" :title="isMaximized ? '还原' : '最大化'" @click="maximizeWindow">
    <svg v-if="isMaximized" width="12" height="12" viewBox="0 0 12 12">
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

标题命令带 `Date.now()` 时间戳后缀，确保每次点击生成唯一值，防止 Electron 去重：

```ts
import { platform } from '../utils/platform';

const isMaximized = ref(false);

function minimizeWindow() { document.title = 'cmd:minimize:' + Date.now(); }
function maximizeWindow() {
  document.title = (isMaximized.value ? 'cmd:restore:' : 'cmd:maximize:') + Date.now();
}
function closeWindow() { window.close(); }  // 关闭使用原生 API

// 监听最大化状态变更（data-win-maximized + MutationObserver）
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
.topbar {
  -webkit-app-region: drag;   /* 顶层导航栏充当窗口拖拽手柄 */
}
/* 可点击元素排除拖拽 */
.nav-btn,
.search-wrap,
.user-menu-wrap,
.win-controls {
  -webkit-app-region: no-drag;
}
```

---

### 4. `src/components/Sidebar.vue` — macOS 红绿灯避让

macOS 原生红绿灯位于窗口左上角，会覆盖页面内容层。侧栏顶部品牌区需要为红绿灯预留安全空间：

```vue
<aside
  ref="sidebarRef"
  class="sidebar"
  :class="{ collapsed: isCollapsed, 'mac-window-controls': platform.isMacOS }"
>
```

```css
.sidebar.mac-window-controls .profile {
  padding-top: 36px;
}

.sidebar.mac-window-controls .profile.compact {
  padding-top: 36px;
}
```

约定：

- 不通过隐藏红绿灯来解决压住内容的问题
- macOS 下侧栏展开态和折叠态都必须避让红绿灯
- Windows/Linux 不添加该避让 class

---

### 5. 迷你模式红绿灯处理

迷你模式下 macOS 红绿灯按钮与紧凑的 MiniPlayBar 布局不协调，需要在进入/退出迷你模式时动态隐藏/显示。

**实现位置**：`electron/main.js` — `mini-mode:enter` 的 `applyMiniSize()` 和 `mini-mode:exit`。

#### 进入迷你模式时隐藏

在 `applyMiniSize()` 中，设置窗口尺寸和置顶后，追加 macOS 专属调用：

```js
// applyMiniSize() 末尾：
win.setAlwaysOnTop(!!alwaysOnTop);
if (process.platform === 'darwin') win.setWindowButtonVisibility(false);
win.webContents.send('mini-mode:state-change', true);
```

#### 退出迷你模式时恢复

在 `mini-mode:exit` 中，恢复窗口尺寸后、发送状态变更前，恢复红绿灯显示：

```js
// mini-mode:exit 末尾：
if (process.platform === 'darwin') win.setWindowButtonVisibility(true);
win.webContents.send('mini-mode:state-change', false);
```

**原理**：`BrowserWindow.setWindowButtonVisibility()` 是 Electron 的 macOS 专属 API，运行时控制红绿灯显示/隐藏，不改变窗口创建时的 `titleBarStyle` 配置。

**约束**：该 API 仅在 macOS 有效，调用时必须用 `process.platform === 'darwin'` 守卫，防止其他平台抛出异常。

---

## 跨平台差异

| 平台 | 窗口参数 | 红绿灯 | 自定义按钮 | 拖拽区域 |
|------|---------|--------|-----------|---------|
| macOS | `frame: false` + `titleBarStyle: 'hidden'` + `trafficLightPosition` | 原生，常态显示 | 右侧显示，始终可见 | `.topbar` + drag |
| Windows | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |
| Linux | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |

## 播放页全屏链路

桌面端播放页全屏必须走 Electron 原生窗口全屏，Web 端才走浏览器 DOM fullscreen：

```ts
function toggleFullscreen() {
  if (platform.isDesktop) {
    document.title = (isFullscreen.value ? 'cmd:fullscreen-leave:' : 'cmd:fullscreen-enter:') + Date.now();
    return;
  }

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}
```

主进程链路：

```
播放页点击全屏按钮
  → document.title = 'cmd:fullscreen-enter:1234567890'
    → page-title-updated 事件 → event.preventDefault()
      → setWindowFullscreen(true)
        → macOS: BrowserWindow.setSimpleFullScreen(true)
        → Windows/Linux: BrowserWindow.setFullScreen(true)
        → win-fullscreen-change
          → preload: dataset.winFullscreen = ''
            → PlayerExpanded.vue: MutationObserver 触发
              → isFullscreen.value = true
                → 按钮图标切换为「退出全屏」
```

这条链路避免了桌面端依赖 `document.documentElement.requestFullscreen()`，同时通过 `setSimpleFullScreen()` 减少 macOS 原生全屏 Space 带来的系统标题栏灰色边条。

## 常见问题

### Q: 红绿灯为什么现在是常态显示？

当前需求要求红绿灯在普通窗口和全屏状态下都常态显示，因此 macOS 使用：

```js
...(isMac
  ? { frame: false, titleBarStyle: 'hidden', trafficLightPosition: { x: 20, y: 14 } }
  : { frame: false }
)
```

`titleBarStyle: 'hidden'` 用于隐藏原生标题栏横条，同时保留原生红绿灯；`trafficLightPosition` 用于控制红绿灯位置。

不要改回：

```js
titleBarStyle: 'customButtonsOnHover'
```

否则红绿灯会恢复为默认隐藏、hover 才显示。

### Q: 自定义按钮在 Web 端显示怎么办？

通过 `v-if="platform.isDesktop"` 控制模板渲染，preload 同步添加 `resound-desktop` CSS class 兜底：

```vue
<div v-if="platform.isDesktop" class="win-controls">···</div>
```

```js
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
});
```

### Q: 为什么用 `document.title` hack 而不是 IPC？

`contextBridge` 的函数代理在 Electron 34 中不可靠——属性可读，但函数调用静默失败。经过 `send` → `invoke`、`CustomEvent`、`postMessage` 等多种尝试后，确认 `document.title` → `page-title-updated` 是唯一可靠的跨隔离世界通信方式。

### Q: 最大化按钮图标不更新？

确保 `electron/main.js` 中注册了 `maximize` / `unmaximize` 事件并发送 `win-state-change`：

```js
win.on('maximize', () => win.webContents.send('win-state-change', true));
win.on('unmaximize', () => win.webContents.send('win-state-change', false));
```

### Q: 标题命令为什么带时间戳？

每次生成唯一值（如 `cmd:maximize:1680000000000`），防止 Electron 对已 `preventDefault` 的相同标题去重，确保 `page-title-updated` 事件每次都触发。

### Q: 最大化后还原再点放大失效？

主进程 `page-title-updated` 处理器中，最大化命令前调用 `win.setMaximizable(true)` 重置 frameless 窗口的 DWM 状态：

```js
} else if (cmd === 'maximize') {
  win.setMaximizable(true);   // frameless 窗口二次最大化修复
  win.maximize();
}
```

## 参考

- [Electron — BrowserWindow titleBarStyle](https://www.electronjs.org/docs/latest/api/browser-window#new-browserwindowoptions)
- [Electron 窗口控制按钮实现说明](../docs/Electron%20窗口控制按钮实现说明.md)
- [桌面端窗口控制按钮检测方案](../docs/桌面端窗口控制按钮检测方案.md)