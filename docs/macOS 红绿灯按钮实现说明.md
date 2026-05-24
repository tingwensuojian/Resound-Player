# macOS 红绿灯按钮实现说明

## 需求

macOS 上默认行为：红绿灯按钮（关闭、最小化、最大化）始终显示在窗口左上角且伴随原生标题栏边条。需要实现：

- 隐藏原生标题栏边条（窗口顶部无灰色横条）
- 红绿灯默认隐藏，鼠标移到左上角区域时显示
- Windows/Linux 不受影响，保持无边框 + 自定义按钮

## 最终方案

### 核心原理

利用 Electron 的 `frame: false` + `titleBarStyle: 'customButtonsOnHover'`（macOS 独占）：

- `frame: false` 移除原生窗口边框，确保全屏下无灰色标题栏条
- `customButtonsOnHover` 使红绿灯按钮由 macOS 原生渲染在窗口左上角，默认隐藏，鼠标移到左上角区域时显示（hover 显隐）
- 红绿灯作为 overlay 置于 web 内容之上，不占用 DOM 布局空间

非 Mac 平台保持 `frame: false`，完全依赖右侧自定义按钮。

此组合是 Electron 官方支持的 frameless 窗口正确用法。参考 SPlayer-dev 项目（Electron 39.4.0）使用相同配置且工作正常。

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
  // macOS: frame: false + titleBarStyle customButtonsOnHover → 无边框 + 原生红绿灯 hover 显示
  // SPlayer-dev 验证：此组合为 Electron 官方支持的 frameless 窗口正确用法
  // 其他平台：frame: false → 无边框，依赖自定义控件
  ...(isMac
    ? { frame: false, titleBarStyle: 'customButtonsOnHover' }
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

> **说明**：`frame: false` + `titleBarStyle: 'customButtonsOnHover'` 是 Electron 官方支持的 macOS frameless 窗口正确配置。`customButtonsOnHover` 的行为就是让红绿灯按钮默认隐藏、hover 时显示，macOS 原生渲染这些按钮在窗口内容之上，不需要任何 HTML/CSS。

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

窗口控制通过 `document.title` → `page-title-updated` 事件实现（不依赖 IPC/contextBridge）：

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

---

### 2. `electron/preload.js` — 最大化状态同步

preload 不暴露任何窗口控制 API，只负责将主进程广播的状态同步到 DOM dataset：

```js
// preload.js — 末尾
ipcRenderer.on('win-state-change', (_event, maximized) => {
  if (maximized) {
    document.documentElement.dataset.winMaximized = '';
  } else {
    delete document.documentElement.dataset.winMaximized;
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

## 跨平台差异

| 平台 | 窗口参数 | 红绿灯 | 自定义按钮 | 拖拽区域 |
|------|---------|--------|-----------|---------|
| macOS | `titleBarStyle: 'customButtonsOnHover'` | 原生，默认隐藏，hover 显示 | 右侧显示，始终可见 | `.topbar` + drag |
| Windows | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |
| Linux | `frame: false` | 无 | 右侧显示，始终可见 | `.topbar` + drag |

## 完整数据流

```
用户点击自定义按钮
  → document.title = 'cmd:maximize:1234567890'
    → page-title-updated 事件 → event.preventDefault()
      → BrowserWindow.maximize()
        → win.on('maximize')
          → webContents.send('win-state-change', true)
            → preload: ipcRenderer.on('win-state-change')
              → dataset.winMaximized = ''
                → TopBar.vue: MutationObserver 触发
                  → isMaximized.value = true
                    → 按钮图标切换为「还原」
```

## 常见问题

### Q: 红绿灯默认隐藏，hover 才显示？

是的，项目使用 `frame: false` + `titleBarStyle: 'customButtonsOnHover'`。`frame: false` 移除原生窗口边框，`customButtonsOnHover` 让红绿灯在鼠标移到左上角区域时 hover 显示。

当前配置（macOS）：`frame: false, titleBarStyle: 'customButtonsOnHover'`

如果要红绿灯始终可见（全屏兼容但失去 hover 效果），可改为：

```js
...(isMac ? { frame: false, titleBarStyle: 'hidden' } : { frame: false })
```

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