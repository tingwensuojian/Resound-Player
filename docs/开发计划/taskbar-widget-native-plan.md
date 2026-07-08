# 任务栏播控（任务栏快捷播控）完整开发计划
## 目标：100%复刻汽水音乐Windows任务栏播控实现方式

### 核心原则
- 完全摒弃当前所有 JS/Electron 层面的任务栏播控实现
- C++ 模块直接接收 Electron BrowserWindow 的 HWND 管理，不建自建窗口
- 所有 Win32 窗口管理操作由 C++ 原生模块直接完成
- 不照搬代码，但完全复刻架构和 API 设计

---

## 审计发现概要（已在新计划中规避）

| 审计发现 | 问题说明 | 新计划解决方案 |
|----------|----------|---------------|
| 类名未设置 | WNDCLASSEXW.lpszClassName 丢失 | 不自建窗口，直接管理 Electron 窗口 HWND |
| WS_EX_LAYERED 缺失 | SetAlpha 时没有 Layered 样式 | 去掉 SetAlpha，通过 transparent:true 处理 |
| 重复 join | keepTopmostRunning_ 双重赋值/重复 join | SetWinEventHook 替代轮询，不要 keepTopmost 线程 |
| 子类未清理 | Destroy 未调用 RemoveWindowSubclass | 新代码在 Destroy 中必须 RemoveWindowSubclass |
| 布局检测错误 | 匹配错误的窗口 class | C++ EnumChildWindows 准确区分任务栏区域 |
| win 未定义 | main.js 引用不存在的变量 | 模块化设计，清除此类问题 |
| 时序竞态 | setTimeout 不可靠 | C++ 原生拖动，零 JS 时序问题 |
| 500ms 轮询 | 效率低且不及时 | SetWinEventHook 事件级监控 |
| 无原生拖动 | move 事件不跟手 | C++ WM_MOUSEMOVE 直接处理 |
| 无空白检测 | JS 盲算位置 | C++ EnumChildWindows 准确检测 |

---

## Phase 0：环境准备

### 0.1 确认 VS Build Tools
- 检查 MSVC 工具链是否可用（cl.exe / nmake）
- 若未安装：安装 VS 2022 Build Tools，选择"使用C++的桌面开发"工作负载
- 含 MSVC v143 工具集、Windows 11 SDK、CMake

### 0.2 验证 node-gyp 构建
- 当前 native/taskbar-widget-helper/ 已有 binding.gyp 和预编译产物
- 执行：node-gyp rebuild --target=42.1.0 --arch=x64 --dist-url=https://electronjs.org/headers
- 目标：编译成功得到 build/Release/taskbar_widget_helper.node

---

## Phase 1：完全重写 C++ 原生 Addon

### 1.1 核心变更：不自建窗口，直接管理 Electron 窗口

旧：自建原生窗口 CreateWidgetWindow -> Electron 窗口作为子窗口
新：Addon 直接接收 Electron BrowserWindow 的 HWND 进行管理

### 1.2 API 设计（完全对齐汽水音乐）

`
// === 任务栏查找和窗口工具 ===
findTaskbar() -> Number (Shell_TrayWnd HWND)
getWindowRect(hwnd) -> { x, y, width, height }
setWidgetStyles(hwnd) -> Boolean   // 设置 WS_CHILD/WS_EX_NOACTIVATE 等
setOwner(hwnd, ownerHwnd) -> Boolean
refreshCursor() -> void

// === Tracker - 任务栏布局检测 ===
createTracker() -> TrackerHandle
  .findBlanks() -> { hwnd, rect, taskbar, left, right, side, candidates[] }
  .getTaskbarInfo() -> { rect, edge, autoHide, visible }
  .onTaskbarLayoutChanged(callback)  // SetWinEventHook
  .destroy()

// === DragHelper - 原生拖动 ===
createDragHelper(hwnd) -> DragHelperHandle
  .isDragging: boolean
  .onDragStart(callback)
  .onDragMove(callback)  // 每个 WM_MOUSEMOVE 触发
  .onDragEnd(callback)
  .destroy()

// === HoverHelper - 悬停检测 ===
createHoverHelper(hwnd) -> HoverHelperHandle
  .isHovering: boolean
  .isInDragRegion: boolean
  .onHoverChange(callback)
  .onDragRegionChange(callback)
  .destroy()

// === PreviewHelper - 阴影窗口管理 ===
createPreviewHelper(shadowHwnd) -> PreviewHelperHandle
  .isPreviewVisible: boolean
  .onPreviewWindowChange(callback)
  .destroy()

// === 主题监测 ===
getTaskbarTheme() -> 'light' | 'dark'
onTaskbarThemeChanged(callback) -> void

// === 防隐藏（核心） ===
preventHide(hwnd) -> Boolean
removePreventHide(hwnd) -> Boolean  // 新增，移除子类

// === 保持可见 ===
ensureAboveTaskbar(hwnd) -> Boolean
`

### 1.3 C++ 源文件结构

`
native/taskbar-widget-helper/
├── binding.gyp
├── package.json
├── src/
│   ├── addon.cc              # N-API 模块入口
│   ├── module.h / .cc        # 统一注册所有类
│   ├── tracker.h / .cc       # Tracker 类 - 任务栏布局检测
│   ├── drag_helper.h / .cc   # DragHelper 类 - 原生拖动
│   ├── hover_helper.h / .cc  # HoverHelper 类 - 悬停检测
│   ├── preview_helper.h / .cc # PreviewHelper 类 - 阴影窗口
│   ├── theme_monitor.h / .cc # 主题监测
│   └── window_utils.h / .cc  # Win32 窗口工具函数
└── build/Release/
    └── taskbar_widget_helper.node
`

### 1.4 技术实现明细

#### Tracker - 任务栏布局检测
- EnumChildWindows(Shell_TrayWnd, ...) 枚举任务栏所有子窗口
- 查找 MSTaskListWClass（应用图标区域，取右边界）
- 查找 MSTaskSwWClass（系统托盘，取左边界）
- 计算中间空白间隙
- 排除 TaskListThumbnailWnd（缩略图预览）
- 返回 candidates[]（所有可放置位置列表）
- 支持多显示器：主显示器 + 扩展显示器的 Shell_TrayWnd

#### DragHelper - 原生拖动（解决拖动不跟手）
- 在 C++ 层安装窗口子类化过程
- WM_LBUTTONDOWN -> SetCapture() -> 开始拖动 -> 回调 onDragStart
- WM_MOUSEMOVE -> GetCursorPos() -> SetWindowPos 移动窗口 -> 回调 onDragMove(x,y)
- WM_LBUTTONUP -> ReleaseCapture() -> 结束 -> 回调 onDragEnd(x,y)
- WM_CAPTURECHANGED -> 确保释放鼠标捕获
- 拖动期间临时禁用 Electron 的 move 事件（通过 IPC 通知主进程设标志）

#### HoverHelper - 悬停检测
- TrackMouseEvent(TME_LEAVE) 检测鼠标离开窗口
- 检测鼠标是否在拖动区域内（22px 宽的左侧条）
- 回调 JS：onHoverChange / onDragRegionChange

#### 持久化防隐藏（解决点击任务栏时闪烁）
- SetWindowSubclass 子类化窗口过程
- 拦截 WM_SHOWWINDOW -> wParam==FALSE 时返回 0 拒绝隐藏
- 拦截 WM_WINDOWPOSCHANGING -> 清除 SWP_HIDEWINDOW 标志
- 拦截 WM_WINDOWPOSCHANGED -> HWND_TOP 重新置顶
- 完全基于 Windows 消息，不轮询
- Destroy 时调用 RemoveWindowSubclass 清理

#### 主题监测（审计建议修正）
- 读取注册表两个值：
  - SystemUsesLightTheme -> 系统主题
  - AppsUseLightTheme -> 应用主题
- 使用 RegNotifyChangeKeyValue 监听变化
- 变化时通过 Napi::ThreadSafeFunction 通知 JS 层

#### SetWinEventHook 替代 500ms 轮询
- SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, ...) 监听任务栏位置变化
- SetWinEventHook(EVENT_OBJECT_SHOW, ...) 监听显示/隐藏
- 在回调中直接处理，零延迟

---

## Phase 2：重写 Electron 主进程服务

### 2.1 新架构

`
electron/
├── main.js                      # 入口（精简，加载服务模块）
├── services/
│   └── taskbarWidgetService.js  # 新增模块化服务
├── taskbar-widget-preload.cjs   # Widget 预加载（重写）
└── taskbar-widget-shadow-preload.cjs  # Shadow 预加载（新增）
`

### 2.2 taskbarWidgetService.js 职责

enable() 流程:
  1. 加载原生 addon
  2. 创建 widget BrowserWindow
  3. 创建 shadow BrowserWindow
  4. 获取两个窗口的 HWND
  5. 调用 findTaskbar() -> 获取 Shell_TrayWnd
  6. 调用 setWidgetStyles(widgetHwnd) -> 设置 WS_EX_NOACTIVATE 等
  7. 调用 preventHide(widgetHwnd) -> 安装防隐藏子类
  8. 调用 createTracker() -> 获取任务栏布局
  9. 调用 createDragHelper(widgetHwnd) -> 安装原生拖动
  10. 调用 createHoverHelper(widgetHwnd) -> 安装悬停检测
  11. 调用 createPreviewHelper(shadowHwnd) -> 安装预览管理
  12. 调用 getTaskbarTheme() + onTaskbarThemeChanged(cb)
  13. tracker.findBlanks() -> 定位 widget 位置
  14. 显示 widget（showInactive）
  15. 通知渲染层已就绪

disable() 流程:
  1. 销毁所有 helper 对象（自动调用 RemoveWindowSubclass）
  2. 关闭 shadow BrowserWindow
  3. 关闭 widget BrowserWindow
  4. 清理配置

### 2.3 BrowserWindow 参数

Widget Window:
  width: 360, height: 48
  frame: false, transparent: true, resizable: false
  skipTaskbar: true, alwaysOnTop: true, show: false
  type: 'toolbar', focusable: false
  backgroundColor: '#00000000'

Shadow Window: 相同参数

### 2.4 IPC 通信管道

| 事件 | 方向 | 用途 |
|------|------|------|
| playback:state | 主进程 -> widget | 播放状态同步 |
| taskbar-widget:config-changed | 主进程 -> widget | 配置变更 |
| taskbar-widget:theme-changed | 主进程 -> widget | 主题变更 |
| taskbar-widget:hover-changed | 主进程 -> widget | 悬停状态 |
| taskbar-widget:drag-region-changed | 主进程 -> widget | 拖动区域状态 |
| taskbar-widget:shadow-snap-stage | 主进程 -> shadow | 吸附预览状态 |
| taskbar-widget:playback-command | widget -> 主进程 | 播放控制 |
| taskbar-widget:renderer-ready | widget -> 主进程 | 就绪通知 |

---

## Phase 3：Widget Vue UI

### 3.1 布局结构（对齐汽水音乐 CSS）

.wrapper (100% x 100%, container-type: inline-size)
  data-theme: light|dark
  data-widget-state: free|null
  data-hover: true|false
  data-in-drag-region: true|false

  .container (padding-inline: 22px 12px, display:flex)
    .drag-handler-wrapper (position:absolute, left:0, width:22px, opacity:0->1 on hover)
      .drag-handler (width:2px, height:16px, border-radius:9999px)
    .cover-wrapper -> Cover (28x28, border-radius:4px)
    .main-wrapper (margin-left:10px)
      .info-wrapper (width:128px, flex-direction:column)
        .title-wrapper -> 歌名 + VIP 标签
        Lyric (font:11px/15px, font-weight:600)
          .lyric--base (半透明)
          .lyric--played (absolute, overflow:hidden)
      .action-wrapper (gap:10px)
        Prev (32x32)
        Play/Pause (48x48, border-radius:9999px)
        Next (32x32)
    .side-wrapper -> Collect (32x32)
    .close-wrapper (top:4px, right:4px)

### 3.2 UI 关键行为
- 悬停状态：显示边框、操作按钮、拖动条
- Widget 状态：docked 时无边框，free 时显示边框和背景
- 响应式：@container (width < 248px) 隐藏歌词区
- 颜色方案：color-scheme: light / dark

### 3.3 逐字歌词
- 双层文字叠加方案
- 基础层：半透明显示全部歌词
- 高亮层：absolute 定位覆盖，overflow:hidden 控制宽度
- 宽度计算：从歌词逐字时间点数据计算已播放比例

---

## Phase 4：Shadow Widget UI

### 4.1 TaskbarWidgetShadow.vue
- 透明背景 + SVG outline 边框
- data-snap-stage 控制显示状态（none / confirm）
- data-theme 支持明暗主题

---

## Phase 5：预加载脚本

### 5.1 taskbar-widget-preload.cjs
- contextBridge.exposeInMainWorld('widgetEnv', {...})
- 暴露：播放状态、配置、主题、悬停状态的监听
- 播放控制、关闭等命令

### 5.2 taskbar-widget-shadow-preload.cjs
- 暴露：onSnapStageChange(callback)

---

## Phase 6：配置与构建集成

### 6.1 配置文件
%APPDATA%/resound-player/taskbar-widget-config.json
{ enabled, widgetState, freePosition, theme, width, height }

### 6.2 构建集成
- vite.config.ts 增加多入口：taskbar-widget.html, taskbar-widget-shadow.html
- scripts/start-desktop.mjs 确保编译时同步构建 addon
- package.json 增加脚本：build:native

---

## Phase 7：清理旧代码

### 7.1 删除文件
- electron/main.js 中所有 taskbarWidget 相关代码
- desktop-capture-taskbar-layout.ps1
- get-taskbar-layout.ps1
- 旧的 public/taskbar-widget.html 和 shadow
- dist/ 中的旧 widget 文件

### 7.2 保留但重写
- src/taskbar-widget/TaskbarWidget.vue
- src/taskbar-widget-shadow/TaskbarShadow.vue
- electron/taskbar-widget-preload.cjs

---

## 实施顺序总表

| 阶段 | 内容 | 关键交付物 | 审计修正 |
|------|------|-----------|---------|
| Phase 0 | 环境搭建 | VS Build Tools, node-gyp | - |
| Phase 1 | C++ 原生 Addon | tracker/drag/hover/preview/theme/utils | 窗口不自建、直接管理 BrowserWindow HWND；SetWinEventHook 替代轮询；RemoveWindowSubclass |
| Phase 2 | 主进程 Service | taskbarWidgetService.js, main.js | 规避未定义 win、setTimeout 时序问题 |
| Phase 3 | Widget UI | TaskbarWidget.vue 重构 | - |
| Phase 4 | Shadow UI | TaskbarShadow.vue | - |
| Phase 5 | 预加载脚本 | preload.cjs x2 | - |
| Phase 6 | 配置集成 | vite.config, 设置页 | - |
| Phase 7 | 清理 | 删除旧代码 | 特别注意删除 getWindowsTaskbarLayout 等 |

---

## 审计发现对照表

| 原问题 | 状态 | 解决方案 |
|--------|------|---------|
| WNDCLASSEXW.lpszClassName 未设置 | 已规避 | 不自建窗口，无此代码 |
| WS_EX_LAYERED 缺失导致 SetAlpha 失败 | 已规避 | 不用 SetAlpha，用 transparent:true |
| keepTopmostRunning_ 双重赋值/重复 join | 已规避 | 不再使用 keep topmost 轮询线程 |
| Destroy 未 RemoveWindowSubclass | 已修复 | 新增 removePreventHide() + Destory 中清理 |
| getWindowsTaskbarLayout class 匹配错误 | 已修复 | C++ EnumChildWindows 精准检测 |
| 引用未定义 win 变量 | 已修复 | 模块化设计，独立作用域 |
| 时序竞态 setTimeout(0) | 已修复 | C++ 原生拖动，无 JS 时序依赖 |
| 500ms 轮询 | 已修复 | SetWinEventHook 事件级监控 |
| 无原生拖动（不跟手） | 已修复 | C++ WM_MOUSEMOVE 子类化 |
| 无空白检测（盲算位置） | 已修复 | C++ EnumChildWindows 枚举 |
| 只检测 SystemUsesLightTheme | 已修复 | 同时检测 SystemUsesLightTheme + AppsUseLightTheme |
