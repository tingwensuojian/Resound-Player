# 任务栏播控 -- 实现方式与托盘激活闪烁修复记录

## 体系架构总览

任务栏播控系统分为两层：

**JS 服务层** (electron/services/taskbarWidgetService.js)
- 窗口生命周期管理 (创建、销毁、显示/隐藏)
- 配置持久化 (JSON 文件)
- 播放状态同步 (IPC 通信)
- C++ addon 的 JS 胶合层
- 拖拽吸附逻辑的决策层

**C++ Native Addon** (taskbar_widget_helper.node)
- 底层 Windows 窗口操作 (样式、z-order、父窗口)
- 窗口子类化 (消息拦截)
- 任务栏空白区域追踪 (Tracker)
- 鼠标拖拽捕获 (DragHelper)
- 鼠标悬停检测 (HoverDetector)
- 系统主题监听 (ThemeMonitor)

两者的协作模式：JS 层调用 C++ addon 执行非托管操作，C++ 层通过 ThreadSafeFunction 向 JS 层回调事件。

---

## 模块一：JS 服务层 (taskbarWidgetService.js)

### 1.1 模块导入与常量

导入 Electron 的 BrowserWindow、ipcMain、screen、app，以及 Node.js 的 path、fs、url、module 模块。

常量定义：
- ADDON_PATH / ADDON_PATH_FALLBACK：native addon 的加载路径，开发与生产环境不同
- CONFIG_FILE：配置文件的持久化路径 (app.getPath('userData') 下的 JSON 文件)
- DEFAULT_CONFIG：默认配置对象 { enabled: false, widgetState: 'docked', freePosition: null, theme: 'system', width: 360, height: 48 }

### 1.2 模块状态变量

- addon：native addon 的引用
- config：运行时配置 (从 JSON 反序列化，与 DEFAULT_CONFIG 合并)
- widgetWin / shadowWin：播控窗口与阴影窗口 (BrowserWindow 实例)
- tracker：Tracker 实例 (任务栏空白区域追踪)
- dragHelper：DragHelper 实例 (拖拽事件)
- hoverHelper：HoverDetector 实例 (悬停检测)
- previewHelper：PreviewHelper 实例 (预览窗口)
- themeMonitor：ThemeMonitor 实例 (主题监听)
- isDragging：拖拽状态标志
- latestSnapshot：最新播放状态快照

### 1.3 生命周期方法

init()
  1. loadAddon()：尝试加载 native addon，先尝试开发路径，失败时尝试备选路径
  2. loadConfig()：从 CONFIG_FILE 读取配置，去除 BOM 后 JSON 解析
  3. 若 config.enabled 为 true，通过 setImmediate 异步调用 enable()

enable()
  1. 若 addon 未加载，尝试加载
  2. 若 widgetWin 已存在，直接 showWidget() 返回
  3. 否则依次调用 createShadowWindow() + createWidgetWindow()

disable()
  调用 destroyAll() 执行完整清理

destroyAll()
  1. 停止 z-order 守卫 (已移除)
  2. 调用 removeFromTaskbar(hwndBuf) 解除 Shell_TrayWnd 关系
  3. 调用 removePreventHide(hwndBuf) 移除窗口子类化
  4. destroy() 所有 helper 实例 (dragHelper、hoverHelper、previewHelper、tracker、themeMonitor)
  5. 关闭 shadowWin 和 widgetWin
  6. 重置 isDragging 状态

### 1.4 配置管理

配置文件位置：app.getPath('userData')/taskbar-widget-config.json
格式：UTF-8 JSON (自动处理 BOM)

配置字段：
- enabled：播控启用/禁用
- widgetState：'docked' 或 'free'
- freePosition：free 状态时的 { x, y } 坐标
- theme：'system'、'light'、'dark'
- width：播控宽度 (默认 360)
- height：播控高度 (默认 48)

saveConfig() 在拖拽结束和设置变更时调用。

### 1.5 IPC 通道

registerIpc() 注册以下 IPC 通信通道 (所有 Electron IPC 类型)：

taskbar-widget:renderer-ready (on)
  播控渲染层 DOM 就绪后调用。服务层同步最新播放状态和配置到渲染层。

taskbar-widget:get-config (handle)
  渲染层请求当前配置。返回 config 的浅拷贝。

taskbar-widget:set-config (handle)
  渲染层更新配置。调用 setConfig() 更新并持久化。

taskbar-widget:set-enabled (handle)
  渲染层启用/禁用播控。异步调用 setEnabled()。

taskbar-widget:close (on)
  渲染层请求关闭。调用 disable()。

taskbar-widget:get-initial-snapshot (handle)
  渲染层请求初始播放状态快照。返回 latestConvertedSnapshot。

taskbar-widget:renderer-log (on)
  渲染层日志转发到主进程控制台，包含 role 和 message 字段。

taskbar-widget:playback-command (on)
  播控发出的播放控制命令。type 为 'openExpanded' 时直接激活主窗口。
  其他命令转发到主窗口的渲染进程。

taskbar-widget:begin-track-drag (on)
  播控拖拽手柄触发。调用 removeFromTaskbar + startWindowDrag 启动原生拖拽。

taskbar-widget:like-status (on)
  收藏状态变化同步。转发到播控窗口和主窗口的所有渲染进程。

taskbar-widget:diagnostic (handle)
  诊断信息查询。返回 addonLoaded、hoverHelperExists、widgetWinExists 和悬停状态。

taskbar-widget:get-taskbar-info (handle)
  任务栏信息查询。返回 getTaskbarBounds() 的结果。

---

## 模块二：C++ Native Addon

### 2.1 Addon 入口 (module.cc + addon.cc)

module.cc 中的 RegisterAllClasses 注册所有类到 Napi::Env 的导出对象：

RegisterAllClasses -> RegisterWindowUtils + Tracker::Init + DragHelper::Init
  + HoverHelper::Init + PreviewHelper::Init + HoverDetector::Init + ThemeMonitor::Init

addon.cc 通过 NAPI_CPP_INIT 宏注册初始化钩子，Electron 加载 .node 文件时自动调用。

### 2.2 底层窗口工具 (window_utils.h / window_utils.cc)

#### 数据结构：TaskbarInfo

struct TaskbarInfo {
  RECT rect;     // 任务栏窗口矩形 (left, top, right, bottom)
  UINT edge;     // 任务栏位置 (ABE_LEFT/TOP/RIGHT/BOTTOM)
  bool autoHide; // 是否自动隐藏
  bool visible;  // 是否可见
};

#### findTaskbar()

C++: FindWindowW(L"Shell_TrayWnd", nullptr) 定位 Windows 任务栏窗口。
返回任务栏窗口的 HWND 转换为 int64 JS Number。

#### getWindowRect(hwnd)

接收 HWND (Number 类型)，调用 GetWindowRect 获取窗口矩形。
返回 { x, y, width, height } JS 对象。
若窗口无效返回 Undefined。

#### setWidgetStyles(hwndBuffer)

接收 native handle (Buffer 类型)，执行两个操作：

1. 设置窗口扩展样式：
   SetWindowLongPtrW(GWL_EXSTYLE, exStyle | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_LAYERED)

2. 设置 topmost z-order：
   SetWindowPos(HWND_TOPMOST, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

各样式位含义：
- WS_EX_NOACTIVATE (0x08000000)：点击窗口不会将其激活为前台窗口
- WS_EX_TOOLWINDOW (0x00000080)：窗口不显示在任务栏和 Alt+Tab 列表
- WS_EX_LAYERED (0x00080000)：支持按像素透明度渲染

#### setOwner(hwnd, ownerHwnd)

接受两个 HWND 参数 (Number 类型)。
调用 SetWindowLongPtrW(GWLP_HWNDPARENT, owner) 建立 owner-owned 关系。

#### ensureAboveTaskbar(hwndBuffer, [insertAfterHwnd])

接收窗口 HWND (支持 Buffer 或 Number)，可选第二参数。

核心调用：
SetWindowPos(hwnd, insertAfter, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING)

- 无第二参数时 insertAfter = HWND_TOPMOST，窗口进入/保持在 topmost 层级
- 有有效第二参数时插入到指定窗口之后 (如插入到任务栏之后)

随后检查窗口可见性，若已被隐藏则 ShowWindow(hwnd, SW_SHOWNOACTIVATE) 恢复显示。

#### embedInTaskbar(hwndBuffer)

1. 内部调用 FindShellTaskbar() 获取任务栏 HWND
2. SetWindowLongPtrW(GWLP_HWNDPARENT, (LONG_PTR)hwndTaskbar)
   -- 将播控设为 Shell_TrayWnd 的 owned 窗口
3. SetWindowPos(HWND_TOPMOST, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
   -- 重断言 topmost 层级 (parent 变更后必须立即重断言)

设为 Shell_TrayWnd 的 owned 窗口后，播控的行为特征：
- Explorer 刷新任务栏时播控随之刷新
- 任务栏拖动到屏幕另一侧时播控保持相对定位
- 任务栏的 z-order 管理将播控视为自身组成部分

第二步 SetWindowPos(HWND_TOPMOST) 不可省略。设置 GWLP_HWNDPARENT 后窗口的 z-order 会关联到新父窗口所在的层级。对于 Shell_TrayWnd，它的层级不是 topmost，因此需要 SetWindowPos(HWND_TOPMOST) 将窗口提回 topmost band。

#### removeFromTaskbar(hwndBuffer)

1. 通过 FindShellTaskbar() 获取任务栏 HWND
2. 检查当前 parent 是否为 Shell_TrayWnd
3. 若是，SetWindowLongPtrW(GWLP_HWNDPARENT, 0) 解除 parent 关系

#### installPreventHide / removePreventHide (hwndBuffer)

installPreventHide：
  通过 SetWindowSubclass(hwnd, PreventHideSubclassProc, 3, 0) 注册子类化。
  子类化 ID 固定为 3。

removePreventHide：
  通过 RemoveWindowSubclass(hwnd, PreventHideSubclassProc, 3) 移除子类化。

#### PreventHideSubclassProc

子类化处理器拦截两条 Windows 消息：

1. WM_SHOWWINDOW：
   当 wParam == FALSE 时，表示有代码调用 ShowWindow(hwnd, SW_HIDE) 尝试隐藏播控。
   处理器 return 0 阻止该消息的默认处理，窗口不会隐藏。

2. WM_WINDOWPOSCHANGING：
   检查 WINDOWPOS 结构体的 flags 字段。
   若 flags 包含 SWP_HIDEWINDOW 且不包含 SWP_SHOWWINDOW，表示有代码通过
   SetWindowPos(..., SWP_HIDEWINDOW) 尝试隐藏播控。处理器 return 0 阻止。

WM_WINDOWPOSCHANGED 已故意移除。该消息在 z-order 变化时触发。若在其中调用
SetWindowPos 重断言 z-order，会与主窗口激活时的 setAlwaysOnTop(true/false)
形成反馈循环，每次主窗口进入/离开 topmost band 都导致播控的位置重断言，产生视觉闪烁。

#### startWindowDrag(hwndBuffer)

1. ReleaseCapture() 释放鼠标捕获
2. GetCursorPos() 获取光标位置
3. PostMessage(WM_NCLBUTTONDOWN, HTCAPTION, MAKELPARAM(x, y))
   将 WM_NCLBUTTONDOWN 消息发送到窗口非客户区的标题栏区域。
   Windows 收到此消息后进入原生窗口拖拽模式，直到用户释放鼠标按钮。

#### getCursorPos()

调用 GetCursorPos 获取光标位置。返回 { x, y } JS 对象。
失败时返回 Undefined。

#### isMouseButtonDown(button)

使用 GetAsyncKeyState 检查鼠标按钮按下状态。
- button=0：VK_LBUTTON (左键)
- button=1：VK_RBUTTON (右键)
- button=2：VK_MBUTTON (中键)
返回布尔值。

#### refreshCursor()

GetCursorPos + SetCursorPos 组合，刷新光标图标。
用于清除 Windows 可能残留的 AppStarting 忙碌光标状态。

#### activateWindow(hwndBuffer)

完整的窗口前台激活流程（当前作为参考保留，JS 层实际使用 Electron 方案）：

1. 若最小化则 ShowWindow(SW_RESTORE)
2. ShowWindow(SW_SHOW)
3. BringWindowToTop()
4. SetWindowPos(HWND_TOP, SWP_SHOWWINDOW) -- 非 topmost 的顶部
5. 动态加载 user32.dll 的 SwitchToThisWindow (Chrome、VS Code 等均使用此方法)
6. AttachThreadInput(cur, foreThread, TRUE) -- 附加到前台线程输入队列
7. SetForegroundWindow(hwnd) -- 设置前台窗口
8. BringWindowToTop + SetWindowPos(HWND_TOP) -- 在前台权限内再次提升
9. AttachThreadInput(cur, foreThread, FALSE) -- 分离

### 2.3 Tracker 类 (tracker.h / tracker.cc)

Tracker 负责扫描 Shell_TrayWnd 的子窗口，计算任务栏上的空白区域。

#### 成员变量

- hwndTaskbar_：缓存的 Shell_TrayWnd 的 HWND
- layoutCallback_：任务栏布局变化时的回调 (Napi::ThreadSafeFunction)

#### FindBlanks()

通过 EnumChildWindows 枚举 Shell_TrayWnd 的所有子窗口。

对每个子窗口执行：
1. 检查窗口是否可见 (IsWindowVisible)
2. 排除播控自身的窗口 (通过预设 HWND 过滤)
3. 通过 GetWindowRect 获取窗口物理坐标和尺寸
4. 记录到排序列表中

扫描完成后，将所有子窗口按 x 坐标升序排列。
然后遍历排序后的窗口列表，计算未被任何按钮占据的区间。

返回值结构：
{
  candidates: [
    {
      x: number,     // 空白区域左上角 x
      y: number,     // 空白区域左上角 y
      width: number, // 空白区域宽度
      height: number,// 空白区域高度
      side: string   // 'left' 或 'right'
    },
    ...
  ],
  left: number,   // 最左侧空白边缘
  right: number   // 最右侧空白边缘
}

#### GetTaskbarInfo()

返回 QueryTaskbarInfo 的封装，包含任务栏位置、自动隐藏状态等。

#### EnumChildProc (静态回调)

EnumChildWindows 的回调函数。
处理每个子窗口：记录窗口位置到列表中。
参数 lParam 指向调用方传递的结果列表。

### 2.4 DragHelper 类 (drag_helper.h / drag_helper.cc)

DragHelper 通过 Windows 子类化实现播控区域内的鼠标拖拽。

#### 成员变量

- hwndTarget_：目标窗口的 HWND
- isDragging_ / isTrackDragging_：原子布尔标志，确保线程安全
- dragStartPos_ / dragWindowPos_：拖拽起始的光标位置和窗口位置
- dragStartCallback_ / dragMoveCallback_ / dragEndCallback_：ThreadSafeFunction

#### DragSubclassProc (子类化处理器)

WM_LBUTTONDOWN：
  1. 计算光标相对于窗口左上角的偏移 (dragStartPos_)
  2. 记录当前窗口位置 (dragWindowPos_)
  3. isDragging_ = true
  4. SetCapture(hwnd) 捕获鼠标

WM_MOUSEMOVE (当 isDragging_)：
  1. 计算偏移量：dx = X - dragStartPos_.x, dy = Y - dragStartPos_.y
  2. 计算新窗口位置：newX = dragWindowPos_.x + dx, newY = dragWindowPos_.y + dy
  3. 通过 ThreadSafeFunction 回调 JS dragMoveCallback_(newX, newY)

WM_LBUTTONUP (当 isDragging_)：
  1. 通过 ThreadSafeFunction 回调 JS dragEndCallback_(endX, endY)
  2. ReleaseCapture() 释放鼠标
  3. isDragging_ = false

#### JS 侧 API

- onDragStart(callback)：注册拖拽开始回调 (无参数)
- onDragMove(callback)：注册拖拽移动回调，参数为 (newX, newY) 物理像素坐标
- onDragEnd(callback)：注册拖拽结束回调，参数为 (endX, endY) 物理像素坐标
- isDragging()：查询当前是否在拖拽中，返回布尔值
- beginTrackDrag() / onTrackDragMove / onTrackDragEnd：另一种通过 SetCapture 实现的拖拽路径 (备用)

#### ThreadSafeFunction

Napi::ThreadSafeFunction 是 N-API 提供的线程安全函数包装器。
C++ 侧在非 JS 线程 (窗口消息处理线程) 中调用它来安全地向 JS 主线程传递事件。

### 2.5 HoverDetector 类 (hover_detector.h / hover_detector.cc)

HoverDetector 检测鼠标是否在播控区域或拖拽区域内悬停。

#### 成员变量

- hwndTarget_：目标窗口 HWND
- isHovering_ / isInDragRegion_：原子标志
- hoverCallback_ / dragRegionCallback_：ThreadSafeFunction

#### HoverSubclassProc

WM_MOUSEMOVE：
  1. 检查鼠标位置是否在播控区域内
  2. 与上一次悬停状态比较，若变化则通过 ThreadSafeFunction 回调 hoverCallback_
  3. 检查鼠标是否在拖拽区域 (预定义的拖拽手柄区域)，若变化则回调 dragRegionCallback_

WM_MOUSELEAVE：
  1. isHovering_ = false
  2. 回调 hoverCallback_(false)

#### JS 侧 API

- isHovering：属性，返回当前悬停状态 (原子变量读取)
- isInDragRegion：属性，返回当前是否在拖拽区域内
- onHoverChange(callback)：注册悬停状态变化回调，参数为 bool
- onDragRegionChange(callback)：注册拖拽区域状态变化回调，参数为 bool
- syncPosition(x, y, w, h)：同步窗口位置 (覆盖模式备用)
- destroy()：移除子类化，销毁回调

### 2.6 PreviewHelper 类 (preview_helper.h / preview_helper.cc)

PreviewHelper 监测窗口预览变化。

#### JS 侧 API

- onPreviewWindowChange(callback)：注册预览窗口变化回调
- destroy()：清理资源

### 2.7 ThemeMonitor 类 (theme_monitor.h / theme_monitor.cc)

ThemeMonitor 监听 Windows 系统深色/浅色主题变化。

#### 成员变量

- running_：原子标志，控制监控线程运行
- monitorThread_：独立线程
- lastDark_：上一次检测到的深色状态
- themeCallback_：主题变化的回调 (ThreadSafeFunction)

#### 实现机制

1. 通过独立线程轮询注册表：
   HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize
   - SystemUsesLightTheme (DWORD 0=深色, 1=浅色)
   - AppsUseLightTheme (DWORD 0=深色, 1=浅色)
   - 两者任一为 0 即视为深色模式

2. 线程以固定间隔轮询 (典型值 1-2 秒)

3. 检测到变化时，通过 ThreadSafeFunction 回调 JS 侧

#### JS 侧 API

- getTheme()：返回当前主题，'light' 或 'dark'
- onThemeChanged(callback)：注册主题变化回调，参数为 'light' 或 'dark'
- destroy()：停止监控线程，清理资源

---

## 模块三：窗口创建流程

### 3.1 整体启动顺序

enable() 调用顺序：
1. createShadowWindow()：先创建阴影窗口
2. createWidgetWindow()：后创建播控窗口

createShadowWindow 优先于 createWidgetWindow 的原因是：
calcDockPosition() 在窗口创建时即被调用，阴影窗口需要提前就绪以支持拖拽预览。

### 3.2 createShadowWindow() 流程

1. 获取播控尺寸 (getWidgetSize) 和任务栏边界 (getTaskbarBounds)
2. 创建 BrowserWindow：
   - width/height：与播控一致
   - transparent + frame + show + skipTaskbar：与播控相同
   - 不设 alwaysOnTop (拖拽时动态设置)
3. 加载 data:text/html 内联 HTML

阴影窗口的 HTML 结构：
- container (.shadow-indicator)：
  - 属性 data-stage：'hint' 或 'confirm'
  - data-theme：'light' 或 'dark'
- 虚线轮廓 (.outline)
- 提示文字：.hint-text "移动到此处吸附至任务栏" / .confirm-text "松手吸附"
- 预加载脚本通过 widgetEnv.shadow 通信：
  - onSnapStage(callback)：接收吸附阶段变化
  - onThemeChanged(callback)：接收主题变化
  - rendererReady()：通知渲染就绪

### 3.3 createWidgetWindow() 流程

详细执行步骤：

1. 若 addon 已加载但 tracker 未创建，提前创建 Tracker 实例
   目的是让 calcDockPosition() 在创建窗口时就能使用 Tracker 的数据

2. getWidgetSize() 计算尺寸：
   - width：config.width (默认 360)
   - height：任务栏高度 (tb.bottom - tb.top)

3. calcDockPosition() 计算 docked 位置：
   - 使用 getTaskbarBounds() 获取任务栏边界
   - 使用 Tracker.findBlanks() 获取空白区域 (若有)
   - 计算结果为 { x, y }

4. 创建 BrowserWindow (参数见 3.4 节)

5. 加载 URL：
   - 开发模式：process.env.VITE_DEV_SERVER_URL + '/taskbar-widget.html'
   - 生产模式：dist/public/taskbar-widget.html
   - 失败时重试一次

6. 设置初始位置 (positionWidget)

7. 开发模式下在 detached 窗口中打开 DevTools

8. 若 addon 已加载，执行 native 初始化：
   a. getNativeWindowHandle() 获取 HWND Buffer
   b. setWidgetStyles(hwndBuf)
   c. embedInTaskbar(hwndBuf)
   d. new DragHelper(hwndBuf)
   e. new HoverDetector(hwndBuf)
   f. new ThemeMonitor()
   g. installPreventHide(hwndBuf)

9. 注册 DragHelper 事件：
   - onDragStart：isDragging = true，docked->free 时 removeFromTaskbar
   - onDragMove：计算距离任务栏的距离，显示/隐藏/更新阴影窗口的阶段
   - onDragEnd：根据最终距离判断吸附或释放

10. 注册 HoverDetector 事件：
    - onHoverChange：IPC 发送 taskbar-widget:hover-changed
    - onDragRegionChange：IPC 发送 taskbar-widget:drag-region-changed

11. 若 HoverDetector 支持 syncPosition，启动 50ms 轮询定时器同步窗口位置

12. getTheme() 获取初始主题，sendThemeToWidget()

13. showWidget() -- showInactive 不抢占前台

14. syncPlaybackState() -- 同步最新播放状态

15. sendConfigToWidget() -- 同步配置

### 3.4 BrowserWindow 参数详解

| 参数 | 值 | 作用机理 |
|------|-----|---------|
| transparent | true | 配合 WS_EX_LAYERED 实现按像素透明度渲染 |
| frame | false | 无操作系统窗口边框，所有 UI 由 HTML 绘制 |
| resizable | false | 播控尺寸由配置控制，用户不可调整 |
| focusable | false | 点击播控不抢前台焦点，用户可与主窗口并行交互 |
| alwaysOnTop | true | Electron 级别设定 HWND_TOPMOST，与 setWidgetStyles 冗余但增强稳定性 |
| backgroundColor | #00000000 | ARGB 全透明，消除窗口创建时的白色闪屏 |
| show | false | 创建时不自动显示，等所有初始化完成后再 show() |
| skipTaskbar | true | 不在任务栏创建播控对应的按钮 |
| webPreferences.sandbox | false | 需要访问 preload 中的 Node.js API |
| webPreferences.contextIsolation | true | 保证渲染进程与 preload 的隔离 |
| webPreferences.nodeIntegration | false | 禁止渲染进程直接操作 Node.js |

---

## 模块四：位置管理与状态迁移

### 4.1 任务栏边界检测 (getTaskbarBounds)

通过 screen.getPrimaryDisplay() 获取主显示器的 workArea 和 bounds：

- workArea：排除任务栏后的可用工作区域
- bounds：显示器的完整物理尺寸

边缘判定规则：
- wy > by：workArea 的顶部起点大于 bounds 的顶部起点 -> 任务栏在顶部
- wh < bh：workArea 高度小于 bounds 高度 -> 任务栏在底部
- wx > bx：workArea 左侧起点大于 bounds 左侧起点 -> 任务栏在左侧
- ww < bw：workArea 宽度小于 bounds 宽度 -> 任务栏在右侧
- 兜底：默认任务栏在底部

返回结构：
{ left, top, right, bottom, edge }

### 4.2 播控尺寸计算 (getWidgetSize)

- width：config.width (默认 360px)
- height：任务栏高度 (tb.bottom - tb.top)，使播控高度与任务栏一致

### 4.3 Docked 位置计算 (calcDockPosition)

定位策略按优先级从高到低：

1. Tracker.findBlanks() 有空白候选区域：
   - 选择第一个候选空白 (candidates[0])
   - 播控右边缘 = 空白右边缘 - 2px
   - 若空白宽度不够播控宽度，缩小到空白宽度范围
   - y = 任务栏垂直居中

2. Tracker.findBlanks() 无空白但提供了左右边界：
   - gapLeft = blanks.left, gapRight = blanks.right
   - 空隙足够播控时：右对齐预留 2px 边距
   - 空隙不够时：左对齐
   - y = 任务栏垂直居中

3. 无 Tracker：
   - gapLeft = tb.left + 2, gapRight = tb.right - 2
   - 同上定位逻辑

### 4.4 状态迁移

播控有两个状态，状态间有四种迁移路径：

迁移路径表：

| 从 | 到 | 触发条件 | 执行操作 |
|----|-----|---------|---------|
| docked | docked | 位置微调 (Tracker 更新) | positionWidget(newX, newY) |
| docked | free | 用户拖拽开始 | removeFromTaskbar, config.widgetState = 'free' |
| free | docked | 拖拽结束且距离 < 60px | embedInTaskbar + ensureAboveTaskbar, 定位到 calcDockPosition |
| free | free | 拖拽结束且距离 >= 60px | 记录 freePosition |

---

## 模块五：拖拽与吸附系统

### 5.1 拖拽触发方式

两种方式均可触发拖拽：

方式一：播控区域直接拖拽
- DragHelper 子类化拦截 WM_LBUTTONDOWN
- SetCapture 捕获鼠标
- WM_MOUSEMOVE 时计算偏移量
- WM_LBUTTONUP 时结束

方式二：播控 UI 拖拽手柄
- 渲染进程通过 IPC taskbar-widget:begin-track-drag 触发
- 主进程调用 removeFromTaskbar + startWindowDrag
- startWindowDrag 通过 PostMessage(WM_NCLBUTTONDOWN, HTCAPTION) 触发 Windows 原生拖拽

### 5.2 拖拽开始处理

JS 侧 onDragStart 回调：

1. isDragging = true
2. 若当前为 docked 状态：
   a. config.widgetState = 'free'
   b. sendConfigToWidget() 通知渲染层
   c. removeFromTaskbar() 解除 Shell_TrayWnd 关系

### 5.3 拖拽移动处理

JS 侧 onDragMove(newX, newY) 回调：

1. 检查任务栏边界 (getTaskbarBounds)
2. 判断播控是否在任务栏水平范围内 (x + width > tb.left && x < tb.right)
3. 计算播控到任务栏的垂直距离：
   - 底部任务栏：distToTaskbar = Math.abs(y - tb.top)
   - 顶部任务栏：distToTaskbar = Math.abs(y + height - tb.bottom)
4. 根据距离决定阴影窗口状态：
   - distToTaskbar < 60px：confirm 阶段
   - 60px <= distToTaskbar < 300px：hint 阶段
   - 其他：隐藏阴影

### 5.4 拖拽结束处理

JS 侧 onDragEnd(endX, endY) 回调：

1. isDragging = false
2. hideShadow() 隐藏阴影
3. 若满足吸附条件 (距离 < 60px 且在任务栏水平范围内)：
   a. config.widgetState = 'docked'
   b. config.freePosition = null
   c. positionWidget(calcDockPosition()) 定位
   d. embedInTaskbar() + ensureAboveTaskbar() 重新嵌入
4. 若不满足：
   a. config.widgetState = 'free'
   b. config.freePosition = { x: endX, y: endY }
   c. removeFromTaskbar() 解除关系
5. saveConfig() + sendConfigToWidget()

### 5.5 阴影窗口管理

showShadow(pos, size, stage)：
1. shadowWin.setBounds({ x, y, width, height })
2. 若不可见则 showInactive()
3. setAlwaysOnTop(true, 'screen-saver') 确保预览在所有窗口之上
4. IPC 发送 shadow-snap-stage ('hint' 或 'confirm')

hideShadow()：
1. IPC 发送 shadow-snap-stage = 'none'
2. shadowWin.hide()

---

## 模块六：播放状态同步

### 6.1 数据来源

playbackStateStore (渲染进程) -> IPC:playback:state -> taskbarWidgetService -> 存储快照 -> IPC:playback:state -> 播控渲染进程

### 6.2 快照结构 (convertSnapshot)

输入：原始 snapshot 对象
输出：播控渲染进程可用的数据结构

转换逻辑：
1. 从 currentTrack.track 或 raw.track 提取歌曲信息
2. 若不存在 mediaDetail 但有 fullLyrics，从 fullLyrics 构建 mediaDetail.lyricInfo.lyricData
3. lyrics 行格式：{ time, text, duration, words: [{ text, startTime, duration, space }] }
4. 歌词数据支持逐字时间戳，实现卡拉 OK 效果

输出结构：
{
  track: { id, name, artist, cover_url, duration },
  mediaDetail: { lyricInfo: { lyricData: { lines: [...] } } },
  playing: boolean,
  currentTime: number,
  duration: number,
  liked: boolean,
  fullLyrics: array,
  miniWords: number,
  miniLyric: string,
  isFm: boolean
}

---

## 模块七：主题同步

### 7.1 检测方式

ThemeMonitor 读取 Windows 注册表：
- 路径：HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize
- SystemUsesLightTheme：0 为深色，1 为浅色
- AppsUseLightTheme：0 为深色，1 为浅色
- 两者任一为 0 即判定为深色模式

### 7.2 同步流程

1. 播控初始化时 themeMonitor.getTheme() 获取初始主题
2. sendThemeToWidget(theme) 通过 IPC 发送到播控和阴影窗口
3. ThemeMonitor 的独立线程轮询注册表，检测到变化时回调 onThemeChanged
4. JS 侧再次 sendThemeToWidget()

### 7.3 渲染层主题应用

播控渲染层的预加载脚本暴露 widgetEnv.theme API。
渲染层根据主题切换 CSS light-dark() 或显式 class 切换。

---

## 模块八：配置持久化

### 8.1 文件读写

loadConfig()：
1. 检查 CONFIG_FILE 是否存在
2. 存在：读取文件，去除 BOM (0xFEFF)，JSON.parse
3. 不存在或解析失败：使用 DEFAULT_CONFIG

saveConfig()：
1. JSON.stringify(config)
2. fs.writeFileSync(CONFIG_FILE, json, 'utf-8')
3. 写失败时静默捕获 (try/catch)

### 8.2 配置同步

配置变化时通过 sendConfigToWidget() 发送到播控渲染进程。
渲染进程接收 taskbar-widget:config-changed IPC 后更新本地状态。

---

## 模块九：主界面激活

### 9.1 系统托盘激活 (showMainWindowFromTray)

定义在 electron/main.js 中，作为 Tray 的 click 事件回调。

完整流程：
1. 获取所有未销毁的 BrowserWindow
2. 取第一个窗口 (主窗口)
3. 若窗口最小化则 restore()
4. setAlwaysOnTop(true) -- 主窗口进入 topmost band，获取前台焦点权限
5. app.focus() -- 将整个应用程序设置为前台
6. setAlwaysOnTop(false) -- 释放主窗口回到普通 z-order band
7. show() -- 确保窗口可见
8. focus() -- 聚焦窗口

步骤 4-6 的原理：Windows 的前台权限规则规定，只有前台进程可以设置另一个窗口为前台。
通过 setAlwaysOnTop(true) 短暂将主窗口放入 topmost band，再 app.focus() 将应用设为前台，
最后 setAlwaysOnTop(false) 释放回普通层级。这种手法是 Electron 应用的标准做法。

### 9.2 任务栏图标激活 (handleActivateWindow / second-instance)

当用户点击任务栏上的应用图标时，Windows 会启动应用的第二个实例。
通过 app.requestSingleInstanceLock() 获得单例锁后，app.on('second-instance') 会被触发。

handleActivateWindow 流程：
1. 检查迷你模式 (preMiniState)，若是则先恢复迷你窗口
2. 获取所有未销毁的 BrowserWindow
3. 若窗口最小化则 restore()
4. show()
5. focus()
6. setAlwaysOnTop(true) -- 进入 topmost
7. 200ms 后 setAlwaysOnTop(false) -- 延迟释放，确保前台激活

---

## 问题描述

启用任务栏播控时，以下操作会导致播控窗口异常：

1. 系统托盘左键点击 (唤出主界面)：播控窗口闪烁一次
2. 系统托盘右键点击 (打开上下文菜单)：播控窗口闪烁或消失
3. 切换到其他应用：播控窗口可能消失

## 根本原因

### 问题一：托盘激活时闪烁

showMainWindowFromTray() 使用 setAlwaysOnTop(true/false) 将主窗口短暂送入 topmost band 再释放。这会触发当前 topmost band 中所有窗口的 z-order 重评。

播控窗口上注册的 PreventHideSubclassProc 原始版本中包含 WM_WINDOWPOSCHANGED 处理器，每次 z-order 变化时调用 SetWindowPos(hwnd, hTaskbar) 重断言位置，导致视觉闪烁。

影响链：setAlwaysOnTop(true) -> 主窗口进入 topmost band -> Windows 重评 topmost 窗口 z-order -> 播控收到 WM_WINDOWPOSCHANGED -> SetWindowPos(hwnd, hTaskbar) 重断言位置 -> 闪烁

### 问题二：z-order 守卫定时器导致消失

为解决闪烁加入的 z-order 守卫定时器 (250ms) 使用 SetWindowPos(hwnd, taskbarHwnd) 将播控插入到任务栏之后而非 HWND_TOPMOST。

问题在于：SetWindowPos(hwnd, taskbarHwnd) 在播控处于 topmost band 时调用，会将播控移出 topmost band 并放入任务栏所在的普通 z-order band。由于播控没有 alwaysOnTop 来即时恢复，每次定时器触发都将播控推出 topmost band，导致它掉到任务栏下方消失且无法自动恢复。

### 完整的影响链

托盘点击 -> setAlwaysOnTop(true) -> 主窗口进入 topmost band
  -> Windows 重排 z-order -> 播控收到 WM_WINDOWPOSCHANGED
    -> 子类化处理器重断言位置 -> 闪烁
  -> zOrderGuard 250ms 触发
    -> SetWindowPos(hwnd, taskbarHwnd) -> 播控离开 topmost band -> 消失

## 修复方案

### 1. BrowserWindow 添加 alwaysOnTop: true

在 createWidgetWindow() 中创建播控窗口时，直接设定 alwaysOnTop: true。Electron 在窗口生命周期内持续维护 topmost 状态，即使其他操作 (如 embedInTaskbar 改变父窗口) 暂离 topmost band，也会在下一事件循环中自动恢复。

### 2. 精简 PreventHideSubclassProc -- 移除 WM_WINDOWPOSCHANGED

保留防隐藏功能 (WM_SHOWWINDOW + WM_WINDOWPOSCHANGING)，移除导致闪烁的 WM_WINDOWPOSCHANGED 处理器。

### 3. 移除 z-order 守卫定时器

移除每 250ms 执行的 z-order 守卫定时器。alwaysOnTop: true 已提供足够的 topmost 维持能力，定时器中的 SetWindowPos(hwnd, taskbarHwnd) 反而会主动破坏 topmost 状态。

## 改动文件清单

### electron/services/taskbarWidgetService.js

- 播控窗口构造参数添加 alwaysOnTop: true
- 移除 startZOrderGuard() / stopZOrderGuard() 函数及调用
- 移除 zOrderGuardTimer 变量
- 保留 installPreventHide / removePreventHide 调用
- Drag-end snap 恢复为单参数 ensureAboveTaskbar(hwnd) 调用

### native/taskbar-widget-helper/src/window_utils.cc

- PreventHideSubclassProc 精简为仅保留 WM_SHOWWINDOW + WM_WINDOWPOSCHANGING (防隐藏)，移除 WM_WINDOWPOSCHANGED (去闪烁)
- embedInTaskbar 保持 SetWindowPos(HWND_TOPMOST) (parent 变更后重断言 topmost)
- ensureAboveTaskbar 保留双参数支持 ((hwnd, insertAfterHwnd)，后续可复用)

## 验证结果

| 场景 | 结果 |
|------|------|
| 托盘左键 -> 唤出主界面 | 播控不闪烁、不消失 |
| 托盘右键 -> 上下文菜单 | 播控不闪烁、不消失 |
| 切换到其他应用 | 播控保持显示 |
| 点击任务栏空白区域 | 播控保持显示 |
| 任务栏播控拖拽到桌面 | 吸附 UI 正常 |
| 播控从桌面拖回任务栏 | 正确吸附 |


---

## 补充记录

### 2026-07 — 启动时序优化

**文件：** electron/main.js

**改动：** 将 initTaskbarWidget() 和 
egisterTaskbarWidgetIpc() 从 ootstrap() 最开头（第 657 行）移到 createMainWindow() 之后（第 773 行）。

**原因：** enable() → createWidgetWindow() 依赖 calcDockPosition() 计算吸附位置。若在任务栏尚未稳定时就初始化，getTaskbarBounds() + Tracker.findBlanks() 会计算出偏右的 x 坐标（压住托盘图标区域），等任务栏完全就绪后才会校正。窗口首次定位偏右约 30px（x:1714），再跳回正确位置（x:1682）。

**效果：** 首次定位即与拖拽吸附后的位置一致，无先偏右再校正的视觉跳动。

### 2026-07 — openExpanded IPC 主窗口搜索修复

**文件：** electron/services/taskbarWidgetService.js

**改动：** 	askbar-widget:playback-command 处理器中，openExpanded 查找主窗口的方式从标题匹配改为排除法：

`js
// 之前（标题搜索，脆弱）
const mainWin = wins.find(function(w) {
  return w.title && w.title.includes('Resound');
});

// 之后（排除法，健壮）
const mainWin = wins.find(function(w) {
  return !w.isDestroyed() &&
    w.title !== 'Resound-Player Widget' &&
    w.title !== 'Resound-Player Snap';
});
`

**原因：**
- 窗口标题可能被 cmd: 前缀覆盖（如最小化时 document.title 设为 cmd:minimize:xxx），导致 includes('Resound') 搜索失败
- Widget/Snap 窗口标题本身包含 'Resound'，ind() 优先命中主窗口仅因创建顺序靠前，属于脆弱假设
- 排除法与同一 handler 中 irstWin 的搜索模式一致
