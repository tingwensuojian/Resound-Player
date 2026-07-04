# 任务栏播控组件开发计划（审计修订版）

> 基于汽水音乐逆向分析文档 + Resound-Player 现有代码  
> 目标：实现与汽水音乐一致的 Windows 任务栏播控组件  
> 审计日期：2026-06-10

---

## 现状分析

### 已有基础
| 组件 | 状态 | 说明 |
|------|------|------|
| 原生 C++ 插件 | ✅ 已编译 | `native/taskbar-widget-helper/build/Release/taskbar_widget_helper.node`，Electron 42.1.0 ABI |
| Widget 渲染进程 | ✅ 存在 | `src/taskbar-widget/` + `public/taskbar-widget.html` |
| Shadow 渲染进程 | ✅ 存在（骨架） | `src/taskbar-widget-shadow/` + `public/taskbar-widget-shadow.html` |
| Preload 脚本 | ✅ 存在 | `electron/taskbar-widget-preload.js`（widget 和 shadow 共用） |
| 主进程 IPC 通道 | ✅ 存在 | `taskbar-widget:get-config / set-config / move / dock / close / playback-command` |
| 前端 UI 开关 | ✅ 已接入 | SettingsPage + PlayerBar 中的启用/禁用开关 |
| CSS 拖拽手柄 | ✅ 存在 | `widget.css` 中 `.drag-handle-area` 已有 `-webkit-app-region: drag` |

### 核心缺陷（8 项，审计确认）

| # | 缺陷 | 根因 | 严重度 |
|---|------|------|--------|
| 1 | 窗口不可见 | 创建后未调用定位函数，窗口落在 (0,0) | 🔴 阻塞 |
| 2 | 原生插件加载失败 | 加载顺序错误：先读 `_taskbarWidgetHelper`（null）再创建实例 | 🔴 阻塞 |
| 3 | 拖拽不工作 | CSS `-webkit-app-region: drag` 与 Vue 自定义 pointer 事件冲突，两套拖拽系统打架 | 🔴 阻塞 |
| 4 | 无 Shadow 窗口 | 主进程没有创建 shadow BrowserWindow 的逻辑 | 🟡 体验 |
| 5 | 无吸附检测 | 没有判断鼠标是否靠近任务栏的算法 | 🟡 体验 |
| 6 | move IPC 只回吸附 | `taskbar-widget:move` 只调 `ensureAboveTaskbar()`，不处理自由移动 | 🔴 阻塞 |
| 7 | autoStart: false | 即使 enabled=true，也不会自动启动 widget | 🟡 体验 |
| 8 | 无 DPI 坐标转换 | 原生插件用物理像素，Electron 用 DIP，未做转换 | 🟡 精度 |

---

## 审计发现的关键修订

### 修订 1：拖拽方案推翻原计划

**原计划（Phase 4）**：移除 `-webkit-app-region: drag`，改用自定义 `pointerdown/pointermove/pointerup`。

**问题**：
- Widget 窗口设置了 `focusable: false`，渲染进程的 pointer 事件不可靠
- 与汽水音乐的实际实现不一致

**审计结论**：汽水音乐的 widget 渲染进程中**没有任何 pointer 事件处理代码**，拖拽完全由 CSS `-webkit-app-region: drag` + Electron 原生窗口拖拽处理。

**修订方案**：
- **保留** CSS 中的 `-webkit-app-region: drag`（已有）
- **删除** `TaskbarWidget.vue` 中的 `onDragStart/onDragMove/onDragEnd` 自定义拖拽代码
- 在主进程监听 `taskbarWidgetWin.on('move', ...)` 事件跟踪窗口位置
- 用 `move` 事件 + debounce（200ms 无 move）检测拖拽结束
- 拖拽期间执行吸附检测 + 显示 Shadow 窗口

### 修订 2：原生插件加载问题细化

**原计划**：说"改为 `process.dlopen()`"。

**审计结论**：`createRequire(import.meta.url)` 方式本身可行，当前代码的真正 bug 是**执行顺序**——先读 `_taskbarWidgetHelper.getTaskbarInfo()`（此时为 null）再创建实例。

**修订方案**：保持 `createRequire` 方式，修正执行顺序即可。

### 修订 3：DPI 处理方案修正

**原计划**：说"原生插件返回物理像素，需要转换"。

**审计结论**：
- Electron 42 默认启用 per-monitor DPI 感知
- `BrowserWindow.setPosition(x, y)` 接受 DIP 坐标
- 原生 `SetWindowPos` 接受物理像素
- `SHAppBarMessage(ABM_GETTASKBARPOS)` 返回物理像素
- 需要在两个坐标系之间转换

**修订方案**：在主进程中用 `screen.dipToScreenPoint()` / `screen.screenToDipPoint()` 转换。

### 修订 4：无原生插件时的 fallback

**原计划**：未明确 fallback 策略。

**审计结论**：Electron 的 `screen.getAllDisplays()` 可以通过 `display.bounds` vs `display.workArea` 差值推算任务栏位置。这是纯 JS fallback，无需原生插件。

**修订方案**：原生插件优先，`screen` API 作为 fallback。

---

## 修订后开发计划

### Phase 1：修复原生插件加载 + 窗口定位（解除阻塞）

**文件：`electron/main.js`**

#### 1.1 修复原生插件加载顺序
```
// 修复前（错误顺序）：
const { TaskbarWidget } = _require(addonPath);
const tbInfo = _taskbarWidgetHelper?.getTaskbarInfo?.() || {};  // null!
_taskbarWidgetHelper = new TaskbarWidget(...);

// 修复后（正确顺序）：
const { TaskbarWidget } = _require(addonPath);
_taskbarWidgetHelper = new TaskbarWidget(initX, initY, width, height);  // 先创建
const tbInfo = _taskbarWidgetHelper.getTaskbarInfo();  // 再查询
```
- 保持 `createRequire(import.meta.url)` 方式
- 先创建 `TaskbarWidget` 实例，再查询任务栏信息
- 加载失败时打印详细错误并继续（降级到无原生模式）

#### 1.2 创建窗口后立即定位
- 原生插件可用时：调用 `ensureAboveTaskbar()` 定位原生 HWND + 计算 DIP 坐标设置 BrowserWindow 位置
- 原生插件不可用时：用 `screen` API fallback 计算任务栏位置并设置 BrowserWindow 位置
- 窗口定位完成后调用 `showInactive()` 显示

#### 1.3 修复 autoStart 默认值
- `autoStart` 默认值改为 `true`

#### 1.4 修复 focusable 设置
- 初始 `focusable: false`（不抢焦点）
- 拖拽期间临时改为 `focusable: true`（确保鼠标事件可靠）
- 拖拽结束后恢复 `focusable: false`
- **注意**：Electron 的 `-webkit-app-region: drag` 在 `focusable: false` 下可能不工作，需要测试验证。如果不行，需要在拖拽期间切换。

---

### Phase 2：实现主进程拖拽跟踪 + 吸附检测

**文件：`electron/main.js`**

#### 2.1 监听 BrowserWindow `move` 事件
```javascript
taskbarWidgetWin.on('move', () => {
  if (!isDragging) {
    isDragging = true;
    onDragStart();
  }
  clearTimeout(dragEndTimer);
  dragEndTimer = setTimeout(() => {
    isDragging = false;
    onDragEnd();
  }, 200); // 200ms 无 move 视为拖拽结束
  
  const bounds = taskbarWidgetWin.getBounds();
  onDragMove(bounds.x, bounds.y);
});
```

#### 2.2 实现吸附检测算法
- 获取任务栏位置（原生插件或 screen fallback）
- 计算 widget 窗口底边与任务栏顶边的距离
- 吸附判定：距离 < 50px 且 widget 水平范围在任务栏内
- 进入吸附区 → 在吸附位置显示 Shadow 窗口
- 离开吸附区 → 隐藏 Shadow 窗口

#### 2.3 实现 dragStart / dragMove / dragEnd 处理
- `onDragStart()`：创建/显示 Shadow 窗口
- `onDragMove(x, y)`：更新 Shadow 窗口位置，检测吸附状态
- `onDragEnd()`：
  - 在吸附区 → `widgetState = 'docked'`，窗口动画移动到吸附位置
  - 不在吸附区 → `widgetState = 'free'`，保持当前位置
  - 隐藏/销毁 Shadow 窗口
  - 通知渲染进程状态变更

#### 2.4 位置保存与恢复
- docked 位置：由任务栏位置决定，无需保存
- free 位置：保存到 `taskbar-widget-config.json`，下次启动恢复

---

### Phase 3：Shadow 窗口实现

**文件：`electron/main.js` + `src/taskbar-widget-shadow/TaskbarShadow.vue`**

#### 3.1 创建 Shadow BrowserWindow
- 属性：`frame: false, transparent: true, skipTaskbar: true, focusable: false, alwaysOnTop`
- 尺寸与 widget 相同
- 加载 `taskbar-widget-shadow.html`
- 默认隐藏，拖拽时显示

#### 3.2 Shadow 窗口 IPC 通信
- 复用 `taskbar-widget-preload.js` 的 shadow API
- 通过 `taskbar-widget:theme-changed` 通知主题切换
- 通过 `taskbar-widget:shadow-snap-stage` 通知吸附状态（`none` / `confirm`）

#### 3.3 Shadow UI 完善
- `TaskbarShadow.vue` 添加 `data-snap-stage` 属性响应
- `confirm` 状态显示圆角矩形轮廓 + 半透明背景
- 样式对齐文档中的 `taskbarWidgetShadow.css`

---

### Phase 4：清理渲染进程拖拽代码

**文件：`src/taskbar-widget/TaskbarWidget.vue`**

#### 4.1 删除自定义拖拽代码
- 删除 `onDragStart / onDragMove / onDragEnd` 函数
- 删除 `@pointerdown="onDragStart"` 绑定
- 删除 `widgetApi.move()` 调用
- 保留 `-webkit-app-region: drag`（由 Electron 原生处理拖拽）

#### 4.2 简化 widgetState 响应
- widgetState 由主进程通过 IPC 下发，渲染进程只负责显示
- `data-widget-state="docked"` → 无边框，融入任务栏
- `data-widget-state="free"` → 显示边框背景，独立悬浮

#### 4.3 保留按钮交互
- 播放/暂停/上一首/下一首按钮使用 `@click.stop` 阻止冒泡到 drag 区域
- `-webkit-app-region: no-drag` 确保按钮可点击

---

### Phase 5：DPI 感知 + 边界保护

**文件：`electron/main.js`**

#### 5.1 坐标转换
- 原生插件返回物理像素 → 用 `screen.screenToDipPoint()` 转为 DIP
- BrowserWindow 坐标（DIP）→ 用 `screen.dipToScreenPoint()` 转为物理像素传给原生插件
- 封装 `toDip(point)` / `toPhysical(point)` 工具函数

#### 5.2 多显示器
- `screen.getDisplayMatching(taskbarWidgetWin.getBounds())` 获取当前显示器
- widget 限制在当前显示器 workArea 范围内
- 拖拽到其他显示器时跟随

#### 5.3 任务栏自动隐藏处理
- 原生插件的 `autoHide` 字段可检测
- 自动隐藏时 widget 应该也自动隐藏或缩小

---

### Phase 6：主题同步 + 播放状态验证

#### 6.1 主题同步（原生插件已有能力）
- `onTaskbarThemeChanged` 回调 → 通知 widget 和 shadow 窗口
- 支持 `config.theme` 覆盖：`'system' | 'dark' | 'light'`

#### 6.2 播放状态同步（已有，验证即可）
- `syncTaskbarWidgetToWin()` 推送播放状态到 widget
- 验证封面、歌名、歌词、进度、收藏状态

---

## 文件变更清单（修订后）

| 文件 | 变更类型 | Phase | 说明 |
|------|----------|-------|------|
| `electron/main.js` | **重写** | 1,2,3,5 | 插件加载、窗口定位、拖拽引擎、Shadow 窗口、DPI |
| `src/taskbar-widget/TaskbarWidget.vue` | **简化** | 4 | 删除自定义拖拽，保留 UI |
| `src/taskbar-widget-shadow/TaskbarShadow.vue` | **完善** | 3 | 吸附指示器 UI |
| `src/taskbar-widget/styles/widget.css` | **不改** | — | 已有正确的 `-webkit-app-region` |
| `electron/taskbar-widget-preload.js` | **微调** | 3 | 添加 shadow snap-stage IPC |

## 实现顺序

```
Phase 1 (原生插件 + 定位)     ← 解除阻塞，让窗口可见
    ↓
Phase 2 (主进程拖拽跟踪)      ← 让拖拽和吸附工作
    ↓
Phase 3 (Shadow 窗口)         ← 吸附预览
    ↓
Phase 4 (清理渲染进程代码)     ← 消除冲突
    ↓
Phase 5 (DPI + 边界)          ← 精度完善
    ↓
Phase 6 (主题 + 状态验证)      ← 体验完善
```

Phase 1 是最小可用。Phase 1-4 是完整体验。

---

## 与汽水音乐实现方式的一致性（修订后）

| 特性 | 汽水音乐 | Resound-Player 计划 | 一致性 |
|------|----------|---------------------|--------|
| 原生 C++ 插件 | taskbar_widget_helper.node | 同名插件，API 对齐 | ✅ 一致 |
| 独立 widget 进程 | taskbarWidget.asar | 独立 Vue 入口 + Vite 多页 | ✅ 一致 |
| 独立 shadow 进程 | taskbarWidgetShadow.asar | 已有骨架 | ✅ 一致 |
| CSS 拖拽（非 JS） | `-webkit-app-region: drag` | 同（修订后） | ✅ 一致 |
| 主进程 move 事件跟踪 | ✅ | 同（修订后） | ✅ 一致 |
| 吸附检测 | 主进程 | 主进程 | ✅ 一致 |
| Shadow 预览窗口 | 独立 BrowserWindow | 同 | ✅ 一致 |
| dock/free 状态 | widgetState | 同 | ✅ 一致 |
| 主题同步 | 注册表监听 | 原生插件已实现 | ✅ 一致 |
| 点击穿透 | WS_EX_TRANSPARENT | 原生插件已实现 | ✅ 一致 |
| 焦点管理 | focusable 动态切换 | 同（修订后） | ✅ 一致 |

---

## 风险项（修订后）

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 原生插件 ABI 不兼容 | 无法加载 | 已确认 `--target=42.1.0` 编译，匹配 Electron 版本 |
| `focusable:false` 下 `-webkit-app-region:drag` 不工作 | 拖拽失败 | 测试验证，必要时在 drag 期间切换 focusable |
| 原生 HWND 与 BrowserWindow 位置不同步 | 视觉错位 | 每次 move 事件同步两个窗口坐标 |
| Electron `move` 事件不触发（某些 edge case） | 拖拽检测失败 | 备选：用 `will-resize` 或定时轮询 |
| `screen` API fallback 精度不足 | 任务栏位置偏差 | 仅在原生插件不可用时使用，精度够用 |


---

## 修订记录

### 2026-07 — 启动时序优化

**改动：** 将 initTaskbarWidget() 和 
egisterTaskbarWidgetIpc() 从 ootstrap() 最开头移到 createMainWindow() 之后。

**原因：** 任务栏播控初始化时需要依赖任务栏按钮稳定。主窗口创建前任务栏尚未就绪，calcDockPosition() 可能计算出偏右的 x 坐标（压住托盘图标），等任务栏稳定后才会校正到正确位置。

**效果：** 播控窗口首次定位即与拖拽吸附后的位置一致（x:1682），不再出现先偏右再跳回的现象。

### 2026-07 — openExpanded 主窗口搜索修复

**文件：** electron/services/taskbarWidgetService.js

**改动：** openExpanded 查找主窗口的方式，从基于标题包含 'Resound' 改为排除法（排除两个已知的 widget 窗口）。与同一 handler 中 irstWin 的搜索模式一致。

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

**原因：** page-title-updated 处理器曾存在 _originalTitle 被 cmd: 标题（如 cmd:minimize:xxx）覆盖的问题，导致窗口标题不包含 'Resound' 时搜索失败。标题搜索本身也是脆弱模式——mini window 和 widget 窗口的标题同样包含 'Resound'，ind() 可能命中非目标窗口。

> 注：main.js 中 _originalTitle = title 已在 else 分支内，不会被 cmd: 前缀的标题污染。
