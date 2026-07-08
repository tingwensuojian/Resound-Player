# macOS 状态栏歌词功能说明

## 功能概述

在 macOS 菜单栏实时显示当前播放的歌词或歌名（左侧）和 Logo 图标（右侧）。点击 Logo 可打开系统托盘右键菜单（播放控制、收藏、桌面歌词开关等）。

## 架构总览

```
渲染进程 (PlayerBar.vue)
  ├─ watch(lyricLines)       → syncState({type:'lyrics-loaded', lines})
  ├─ watch(currentTrack)     → syncState({type:'track-change', ...})
  ├─ watch(currentTime)      → syncTick([currentTimeMs, durationMs, 0])  ← 200ms throttle
  ├─ watch(isPlaying)        → syncState({type:'playback-state', isPlaying})
  ├─ watch(isCurrentLiked)   → notifyLikeStatus(liked)  ← 收藏状态上行
  └─ handleLyricClick        → 桌面端弹歌词上拉栏 / Web 端直接 toggle showBarLyric
        └─ Popover 面板 (Teleport to body)
              ├─ 状态栏歌词 → trayLyric.setConfig({ enabled: !current })
              ├─ 桌面歌词 → desktopLyric.setConfig({ enabled: !current })
              └─ 控制中心歌词 → lyricsSettings.showBarLyric = !showBarLyric
                                ↓
主进程 (electron/main.js)
  ├─ tray-lyric:sync-state handler
  │   ├─ lyrics-loaded  → engineLyricLines = [...]
  │   ├─ track-change   → 清空旧状态 + 设置新歌名
  │   ├─ playback-state → 更新 trayCurrentPlaying + 重建菜单 + 启停插值引擎
  │   └─ full-hydration → 全量恢复
  ├─ tray-lyric:sync-tick handler
  │   └─ 容差校准 (100ms) → engineCurrentTime = currentTime
  ├─ 50ms 插值器 setInterval
  │   └─ engineCurrentTime += elapsed → engineFindCurrentIndex() → setTrayDisplay()
  ├─ tray-lyric:get-config (handle) → 读取持久化配置
  └─ tray-lyric:set-config (handle) → 写入配置 + 更新托盘显示
                                ↓
macOS 菜单栏 (2 个独立 Tray 实例)
  ├─ lyricTray  — 透明 PNG 占位图标 + Tray.setTitle(歌词/歌名)
  └─ mainTray   — Logo 图标 (public/logo.png)，点击展开右键菜单
```

## 布局方案：双 Tray 分离

macOS 的 `NSStatusItem` 硬编码了 `[icon][title]` 布局，无法通过 API 交换位置。同时 macOS 按创建顺序**从右向左**排列 Tray（后创建的出现在左边）。

因此采用双 Tray 分离方案：

| Tray | 创建顺序 | 位置 | icon | title | 视觉效果 |
|------|---------|------|------|-------|---------|
| `mainTray` | 第 1 个 | 右侧 | Logo（public/logo.png） | 始终为空 | `[Logo]` |
| `lyricTray` | 第 2 个 | 左侧 | 透明 PNG | 歌词或歌名 | `[  歌词文字]` |

最终效果：**`[歌词/歌名] [Logo]`**

参考项目：AlgerMusicPlayer（4 Tray 方案）、SPlayer（单 Tray 方案）。

### 透明图标生成

`lyricTray` 需要一个有效尺寸的图标才能正常渲染 `setTitle()` 的文字。使用 Node.js 内置 `zlib` 和 CRC32 运行时生成合法透明 PNG：

- **有文字时**：18×18 透明 PNG，给 `setTitle()` 提供正常渲染空间
- **无文字时**（停播或禁用）：4×18 窄透明 PNG，减少菜单栏空隙
- 两个尺寸的图标缓存为 `_transparentIcon18` / `_transparentIcon4`，避免高频调用重复生成

### 文字分配规则

`setTrayDisplay(lyricText)` 统一管理两个托盘的显示：

```
enabled=true, 有歌词   → lyricTray.setTitle(歌词), mainTray 纯 Logo
enabled=true, 无歌词   → lyricTray.setTitle(歌名), mainTray 纯 Logo
enabled=false          → lyricTray.setTitle(歌名), mainTray 纯 Logo
无歌曲播放             → lyricTray 空文字 + 窄图标, mainTray 纯 Logo
```

核心逻辑：`enabled` 控制是否显示滚动歌词，但无论启用或禁用，有歌时都会显示歌名作为兜底。
`mainTray` 永远不显示文字，所有文字始终在 `lyricTray`（左侧）。

## 数据流

### 歌词显示

```
歌曲播放 → PlayerBar watch(currentTime) → syncTick([time, duration, offset])
                                              ↓
                                    主进程容差校准（100ms 阈值）
                                    引擎 currentTime 更新
                                              ↓
                                    50ms 插值器自驱动
                                    engineCurrentTime += elapsed
                                              ↓
                                    engineFindCurrentIndex()
                                    从 engineLyricLines 查找当前行
                                              ↓
                                    !forceUpdate && idx === lastIndex ? 跳过
                                              ↓
                                    setTrayDisplay(当前歌词文本)
                                    → lyricTray.setTitle(歌词)
```

### 切歌

```
用户切歌 → PlayerBar watch(currentTrack)
         → syncState({type:'track-change', data:{title, artist}})
                                               ↓
                                    主进程清空 engineLyricLines
                                    设置 trayCurrentTrackName = 新歌名
                                    engineUpdateDisplay() → setTrayDisplay('')
                                    → lyricTray.setTitle(新歌名)
                                               ↓
        新歌词加载 → lyricLines 变化
         → syncState({type:'lyrics-loaded', data:{lines}})
                                               ↓
                                    主进程加载 engineLyricLines
                                    engineUpdateDisplay() → 开始逐行显示
```

### 设置切换

```
SettingsPage / 托盘菜单 → setTrayLyricConfig({enabled: true/false})
                                            ↓
                              tray-lyric:set-config IPC（仅渲染端设置入口）
                              或直接调用（托盘菜单 click handler）
                                            ↓
                             setTrayLyricConfig() → 持久化到 JSON
                             setTrayDisplay() → 更新托盘显示
                             → 通知渲染进程 config-changed
```

托盘菜单的「状态栏歌词」和「桌面歌词」toggle 均直接在主进程完成开关，不绕路渲染进程 IPC，避免依赖 `getWin()` 找对窗口。

### 打开设置

状态栏 Logo 菜单中的「设置」不是普通窗口聚焦动作，必须走主进程统一入口：

```text
托盘菜单点击「设置」
  → main 进程 dispatchMainWindowTrayAction('openSettings')
  → restoreMainWindowFromMiniMode()
      ├─ 如果当前处于迷你模式：关闭 miniWin，恢复 mainWin bounds，发送 mini-mode-state=false
      └─ 如果主窗口已存在：show() + focus()
  → mainWin.webContents.send('tray-action', 'openSettings')
  → PlayerBar.handleTrayAction
  → window.dispatchEvent('open-tray-settings')
  → App.vue openTraySettings()
      ├─ playerStore.closeExpanded()
      └─ openSettings('playback')
```

这样处理两个历史边界：

- **迷你模式下打不开设置**：旧逻辑把事件发给隐藏的主窗口，但没有先退出迷你模式；当前先恢复主窗口再发事件。
- **播放页状态下打不开设置**：旧逻辑已经切换 `activePage='settings'`，但 `PlayerExpanded` 仍覆盖在上层；当前进入设置前先关闭播放页。

### 收藏切换

```
托盘菜单点击「喜欢」/「取消喜欢」
         → main 进程 send('tray-action', 'toggleLike')
                           ↓
                PlayerBar.handleTrayAction 调用 toggleCurrentLike()
                           ↓
                useCurrentTrackLike composable
                  → toggleSongLike / toggleDjSubscribe API
                  → 更新 userStore.likedSongIds / subscribedDjIds
                           ↓
                watch(isCurrentLiked) 触发
                  → notifyLikeStatus(liked) → ipcRenderer.send('like-status-change', liked)
                           ↓
                主进程更新 trayIsLiked → setTrayMenu 重建菜单
                  → 「喜欢」↔「取消喜欢」
```

收藏同步走双车道：

1. **下行（托盘→渲染）**：`tray-action: toggleLike` — 托盘菜单 click → 渲染进程调用 `toggleCurrentLike()`
2. **上行（渲染→托盘）**：`like-status-change` IPC — 渲染进程 watch `isCurrentLiked` 变化后通知主进程重建菜单

`isCurrentLiked` 由 `useCurrentTrackLike` composable 实时计算，支持歌曲收藏和播客 DJ 订阅两种模式。切歌时自动重置加载状态。通过 `{ immediate: true }` 确保组件挂载时立即同步初始收藏状态。

### 桌面端歌词控制上拉栏

桌面端（Electron）PlayerBar 的歌词按钮在点击时不再直接 toggle 底部歌词栏，而是弹出上拉面板，集中管理三个歌词模式：

```
桌面端点击歌词按钮
  → handleLyricClick() → showLyricPopover = true
  → initLyricStates() 异步读取 trayLyric / desktopLyric 当前配置
  → updateLyricPopoverPosition() 计算 fixed 定位
  → Popover 面板（Teleport + backdrop）

点击「状态栏歌词」→ toggleTrayLyric()
  → trayLyric.setConfig({ enabled: !current })
  → 主进程启停歌词插值引擎 + 更新托盘显示
  → 关闭 popover

点击「桌面歌词」→ toggleDesktopLyric()
  → desktopLyric.setConfig({ enabled: !current })
  → 主进程创建/销毁桌面歌词窗口
  → 关闭 popover

点击「控制中心歌词」→ toggleBarLyric()
  → lyricsSettings.showBarLyric = !showBarLyric
  → 切换 PlayerBar 底部歌词栏显示
  → 关闭 popover
```

歌词按钮的高亮由 `isAnyLyricActive` computed 控制：三个歌词模式中任意一个开启，按钮即显示高亮（`active` class），全部关闭则取消高亮。

| 条件 | 平台限制 |
|------|---------|
| 状态栏歌词 | 仅 macOS（`platform.isMacOS`） |
| 桌面歌词 | 所有桌面端（macOS/Windows/Linux） |
| 控制中心歌词 | 所有桌面端 + Web 端 |

Web 端不受影响，歌词按钮保持原有行为：直接 toggle `lyricsSettings.showBarLyric`，无弹出面板。

## 核心技术方案

### 主进程 50ms 插值引擎

借鉴 SPlayer 的 `ipc-mac-statusbar.ts` 设计，渲染进程推送完整歌词数组 + 精确进度，主进程自行插值：

```js
engineStartInterpolation()
  → setInterval(50ms) {
      elapsed = Date.now() - lastUpdateTime
      currentTime += elapsed
      updateDisplay()
    }

engineFindCurrentIndex()
  → targetMs = currentTime - offset + 300  // 提前 300ms 预显示
  → 从后往前遍历 lyrics，找到首个 startTime ≤ targetMs 的行

engineTick()
  → 若行索引未变 && 非强制更新 → 跳过
  → 行索引变化 → setTrayDisplay(当前行文本)
```

### 容差校准机制

渲染进程每 ~200ms 推送一次精确进度 `[currentTime, duration, offset]`，主进程以 100ms 为阈值：

- **误差 ≤ 100ms** 且正在播放 → 不干预插值器，保持稳态
- **误差 > 100ms** → 校准 `engineCurrentTime`，更新时间戳

```js
const diff = Math.abs(currentTime - engineCurrentTime);
if (!(diff <= ENGINE_SYNC_THRESHOLD_MS && engineIsPlaying)) {
  engineCurrentTime = currentTime;
  engineLastUpdateTime = Date.now();
}
```

### 系统托盘菜单

使用 Electron `Menu.buildFromTemplate()` 构建完整上下文菜单。点击时通过 `getWin()` 工具函数动态获取有效窗口引用，避免捕获已销毁的 BrowserWindow。

注意：播放控制 / 收藏等动作仍可通过当前有效窗口分发；「设置」必须使用 `dispatchMainWindowTrayAction('openSettings')`，不能直接 `getWin()?.webContents.send(...)`，否则在迷你模式或播放页覆盖状态下会再次出现不可见问题。

菜单仅设置在 `mainTray` 上，`lyricTray` 不挂载菜单——点击歌词/歌名区域不会弹出菜单，仅点击右侧 Logo 图标才打开菜单。

点击 Logo 图标不再跳转到应用窗口（已移除 `mainTray.on('click')` 处理），纯作为菜单入口使用。

### IPC 通信

| IPC 通道 | 方向 | 用途 |
|----------|------|------|
| `tray-lyric:get-config` | 渲染→主进程 invoke | 获取持久化配置 |
| `tray-lyric:set-config` | 渲染→主进程 invoke | 保存配置 + 更新托盘显示 |
| `tray-lyric:sync-state` | 渲染→主进程 send | 完整歌词数组/播放状态/切歌/全量恢复 |
| `tray-lyric:sync-tick` | 渲染→主进程 send | 高频精确进度 `[time, duration, offset]` |
| `tray-lyric:config-changed` | 主进程→渲染 send | 配置变更通知 |
| `tray:play-pause/prev/next` | 主进程→渲染 send | 托盘菜单播放控制 |
| `tray-action` | 主进程→渲染 send | 通用动作（toggleLike/openSettings/toggleDesktopLyric等） |
| `like-status-change` | 渲染→主进程 send | 当前歌曲收藏状态变更通知 |
| `desktop-lyric:get-config` | 渲染→主进程 invoke | 获取桌面歌词配置 |
| `desktop-lyric:set-config` | 渲染→主进程 invoke | 保存桌面歌词配置 + 创建/销毁窗口 |

### 持久化

- 配置存储文件：`~/Library/Application Support/Resound-Player/tray-lyric-config.json`
- 字段：
  ```json
  {
    "enabled": false
  }
  ```
- 读写通过 `electron/tray-lyric-store.js` 模块封装
- 早期版本遗留的 `mode` / `bgColor` 字段已废弃，主进程不再读取

### 托盘菜单结构

```
┌─ 当前歌曲名（禁用态）
├─ ─ ─ ─ ─ ─ ─
├─ 喜欢 / 取消喜欢
├─ 播放模式 → 列表循环 / 单曲循环 / 随机播放
├─ ─ ─ ─ ─ ─ ─
├─ 上一首
├─ 播放 / 暂停
├─ 下一首
├─ ─ ─ ─ ─ ─ ─
├─ ☐ 桌面歌词
├─ ☐ 状态栏歌词（macOS 仅显示）
├─ ─ ─ ─ ─ ─ ─
├─ 设置
├─ ─ ─ ─ ─ ─ ─
└─ 退出
```

## 相关文件

| 文件 | 角色 |
|------|------|
| `electron/main.js` | 主进程：Tray 管理、double-tray 创建、透明 PNG 生成、50ms 插值引擎、`like-status-change` IPC 监听 |
| `electron/tray-lyric-store.js` | 配置持久化模块 |
| `electron/preload.js` | `appEnv.trayLyric` API 桥接（含 `notifyLikeStatus`） |
| `src/types/global.d.ts` | TypeScript 类型声明（`syncState`/`syncTick`/`notifyLikeStatus`/`desktopLyric`） |
| `src/components/PlayerBar.vue` | 渲染进程：歌词、进度、播放状态 IPC 发送，`toggleLike` 托盘动作处理，`isCurrentLiked` 状态同步，桌面端歌词上拉栏（三选项 toggle） |
| `src/stores/lyricsSettings.ts` | 播放器歌词设置（含 `showBarLyric` 控制中心歌词开关） |
| `src/composables/useCurrentTrackLike.ts` | 收藏切换逻辑（toggleSongLike / toggleDjSubscribe），`isCurrentLiked` 计算 |
| `src/components/SettingsPage.vue` | 设置页 UI（系统托盘开关） |
| `src/utils/throttle.ts` | throttle 工具函数（200ms 节流 syncTick） |
| `src/App.vue` | `open-tray-settings` 事件监听 |
| `public/favicon.svg` | Logo SVG 源图（浏览器 favicon） |
| `public/logo.png` | 托盘 Logo 图标 |

## 设置页入口

设置 → 外观 → 系统托盘（macOS）：

- **启用状态栏歌词** — switch 开关（默认关闭）

仅桌面端可见。

## 跨平台注意事项

- macOS 状态栏 Tray 功能仅在 `process.platform === 'darwin'` 生效
- 非 macOS 平台仅创建 `mainTray`（系统托盘图标 + 菜单）
- Web 端通过 `platform.isDesktop` 条件跳过所有 IPC 发送
- 所有 IPC 调用前检查 `window.appEnv?.trayLyric`

## 开发规范遵守

- 平台检测走 `src/utils/platform.ts`（禁止业务代码直接访问 `window.appEnv`）
- IPC 桥接按规则同步更新 `preload.js` + `global.d.ts`
- 所有改动完成后做 lint 自检

## 调试

主进程日志前缀 `[tray]`，关键日志：

```
[tray] 创建托盘失败: ...
[tray] 设置菜单失败: ...
[settings] 托盘配置已加载: { enabled: true }
[settings] 发送托盘配置: { enabled: true }
```
