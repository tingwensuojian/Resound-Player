# 快捷键设置 UI 调整说明

## 调整清单

### 1. ShortcutInput 字体与字号

| 属性 | 修改前 | 修改后 |
|------|--------|--------|
| font-size | 13px | 16px |
| font-family | monospace 字体栈 | -apple-system, sans-serif |

macOS 特殊符号（Cmd、Option、Ctrl、Shift）在 monospace 字体中渲染偏小。改用系统字体后符号渲染清晰。

### 2. 开关布局

快捷键设置页底部两个开关（启用全局快捷键、使用系统媒体快捷键）的布局从开关在左、标签在右，改为与 SettingsPage 其他设置行一致：标签+说明在左、开关在右。

### 3. 弹窗遮罩层

冲突对话框和恢复默认确认弹窗加上 <Teleport to="body"> 包裹，使 position: fixed 基于 viewport 定位，不被 SettingsPage 的 AnimatedAppear（带 transform）限制。

遮罩层背景统一为 rgba(0,0,0,0.25)，与 PlayQueuePanel 和 EqPanel 一致。

### 4. 弹窗面板背景

冲突对话框的背景从纯色（var(--bg-surface)）改为玻璃面板样式，与 EqPanel 和 PlayQueuePanel 统一。

## 参考组件

| 功能 | 参考组件 | 参考点 |
|------|---------|--------|
| 弹窗遮罩层 | PlayQueuePanel | 遮罩层背景 rgba(0,0,0,0.25)、Teleport to="body" |
| 弹窗面板玻璃效果 | EqPanel | 渐变 radial-gradient + backdrop-filter + 半透明背景 |
| 底部开关布局 | SettingsPage | grid 1fr/auto 布局、控制槽在右侧 |
