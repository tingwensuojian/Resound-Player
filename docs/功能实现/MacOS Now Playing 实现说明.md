# macOS Now Playing 实现说明

本项目通过浏览器 **Media Session API** (`navigator.mediaSession`) 实现 macOS 系统级媒体控件集成，使播放器状态（封面、歌名、进度、播放/暂停）同步显示到 macOS 的 Control Center、菜单栏音频图标、Touch Bar 和锁屏界面。

---

## 一、原理

### 1.1 Media Session API

Media Session API 是 W3C 标准，允许 Web 应用向操作系统暴露媒体播放元数据和播放控制能力。Electron 渲染进程的 Chromium 原生支持此 API，无需额外 IPC 或原生插件。

### 1.2 macOS 集成层

```
Media Session API (renderer)
    ↓
Chromium media service (Electron)
    ↓
MPNowPlayingInfoCenter (macOS)
    ↓
Control Center / 菜单栏 / Touch Bar / 锁屏
```

当 `navigator.mediaSession.metadata` 被设置后，Electron 自动将信息桥接到 macOS 的 `MPNowPlayingInfoCenter`，后者负责在系统 UI 中展示。

---

## 二、实现文件

### 2.1 核心文件

| 文件 | 职责 |
|---|---|
| `src/composables/useMediaSession.ts` | Media Session API 封装：元数据更新、action handler 注册、状态同步 |
| `src/stores/player.ts` | 播放器 Store，`init()` 方法首行调用 `setupMediaSession()` |

### 2.2 文件结构

```
src/composables/useMediaSession.ts
  ├── setupMediaSession()          ← 入口函数，在 playerStore.init() 中调用一次
  │   ├── 注册 action handlers     ← play / pause / previoustrack / nexttrack / seekto
  │   ├── watch(currentTrack)      ← 异步合成 badge 后更新 MediaMetadata
  │   ├── watch(isPlaying)         ← 更新 playbackState
  │   └── watch(duration)          ← 更新 positionState
  ├── resolveArtwork()             ← 异步构造带 badge 的 artwork 数组（含缓存）
  ├── compositeBadge()             ← canvas 合成：封面 + 右下角品牌 Logo
  └── BADGE_LOGO_SVG              ← 源版 Logo SVG（docs/logo-guide.md 派生）
```

---

## 三、API 详解

### 3.1 `setupMediaSession()`

```typescript
export function setupMediaSession(): void
```

在 `playerStore.init()` 中调用一次即可，内部通过 `watch` 自动响应播放状态变化。

- **平台兼容**：浏览器不支持 `navigator.mediaSession` 时静默跳过
- **生命周期**：无需手动清理，watch 跟随 playerStore 的响应式生命周期

### 3.2 Metadata 更新

```typescript
watch(() => playerStore.currentTrack, (track) => {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: track.ar.map(a => a.name).join(', '),
    album: track.al?.name,
    artwork: resolveArtwork(track.al?.picUrl),
  })
}, { immediate: true })
```

| Metadata 字段 | 数据来源 | 示例 |
|---|---|---|
| `title` | `playerStore.currentTrack.name` | "晴天" |
| `artist` | `ar[]` 数组 join 为逗号分隔字符串 | "周杰伦" |
| `album` | `al?.name` | "叶惠美" |
| `artwork` | canvas 合成：封面图 + 品牌 Logo badge | `[{ src: 'data:image/jpeg;base64,...', sizes: '512x512' }]` |

### 3.3 Action handlers

| Action | 触发场景 | 调用的 Store 方法 |
|---|---|---|
| `play` | 系统恢复播放 | `playerStore.togglePlay()` |
| `pause` | 系统暂停 | `playerStore.togglePlay()` |
| `previoustrack` | 系统"上一首"控制 | `playerStore.prev()` |
| `nexttrack` | 系统"下一首"控制 | `playerStore.next()` |
| `seekto` | 系统进度条拖动 | `playerStore.seek(details.seekTime)` |

### 3.4 Playback state

```typescript
watch(() => playerStore.isPlaying, (playing) => {
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
})
```

`playbackState` 三个可选值：`'playing'` | `'paused'` | `'none'`

macOS 根据此状态显示对应的播放/暂停图标。

### 3.5 Position state

```typescript
watch(() => playerStore.duration, (dur) => {
  navigator.mediaSession.setPositionState({
    duration: dur,
    playbackRate: playerStore.playbackRate || 1,
    position: playerStore.currentTime || 0,
  })
})
```

`setPositionState` 使系统控件可以显示播放进度条和剩余时间。

### 3.6 Artwork — 封面右下角品牌 Logo badge

封面 artwork 不再直接使用原始封面 URL，而是通过 canvas **将品牌 Logo 合成到封面右下角**，使 macOS 系统栏中显示带来源标识的封面。

```typescript
/** badge 尺寸占封面总尺寸的比例 */
const BADGE_SCALE = 0.49
/** badge 与封面边缘的间距（0 = 完全贴合右下角） */
const BADGE_PADDING_SCALE = 0
```

**合成流程**（`compositeBadge`）：

1. 加载封面图片，绘制到 canvas（居中填满正方形）
2. 加载品牌 Logo SVG（源版，含深色圆角矩形背景），直接贴合绘制在 canvas 右下角
3. 固定导出为 `512x512` JPEG data URL，用作 `MediaMetadata` 的 `artwork`

固定尺寸是为了避免本地歌曲内嵌大封面按原始分辨率导出，导致 Chromium 抛出 `MediaImage src exceeds maximum URL length`。当前实现使用 `ARTWORK_SIZE = 512`，并以较低 JPEG 质量导出，优先保证系统媒体信息稳定更新。

**Logo 来源**：`docs/logo-guide.md` 的源版 SVG（绿色渐变耳机 + `#121317` 深色圆角背景），通过内联 data URL 加载，无需额外网络请求。

**缓存策略**：同一封面 URL 的合成结果缓存在模块级变量 `_lastCompositeUrl` / `_lastCompositeResult` 中，避免重复 canvas 渲染。

**设计参数**：

| 参数 | 值 | 说明 |
|---|---|---|
| `BADGE_SCALE` | 0.49 | badge 尺寸占封面宽度的 49% |
| `BADGE_PADDING_SCALE` | 0 | 无间距，完全贴合右下角 |
| `logoMargin` | 0 | Logo 填满整个 badge 区域 |
| 导出格式 | `image/jpeg`, quality 0.85 | 平衡画质与体积 |

**回退策略**：
- 封面图片加载失败 → 使用原始封面 URL（不带 badge）
- Logo SVG 加载失败 → 使用纯封面 canvas 图（不带 badge）

---

## 四、接入方式

### 4.1 在 playerStore.init() 中接入

```typescript
// src/stores/player.ts
import { setupMediaSession } from '../composables/useMediaSession'

// inside playerStore:
init() {
  // ...
  setupMediaSession()  // ← 首行调用，仅需一次
  // ...
}
```

### 4.2 调用时机

`setupMediaSession()` 应在播放器初始化时调用一次，通常在 `App.vue` 的 `onMounted` 中触发 `playerStore.init()` 时自动完成。

### 4.3 依赖

- 无额外 npm 依赖
- 仅需 Electron 渲染进程（Chromium）原生支持 `navigator.mediaSession`
- 无需修改 Electron 主进程代码
- 无需 IPC 通信

---

## 五、验证方法

### 5.1 运行时验证

```bash
# 启动桌面应用
npm run dev:desktop

# 播放任意歌曲后，检查以下位置：
# 1. macOS 菜单栏右侧 → 点击音频图标 → 显示封面、歌名、控制按钮
# 2. macOS Control Center → 正在播放模块
# 3. Touch Bar（如有）→ 播放控制
# 4. 锁屏界面 → 媒体控件
```

### 5.2 开发者工具验证

在 Electron 渲染进程的 Console 中执行：

```javascript
navigator.mediaSession.metadata
// → MediaMetadata { title: "晴天", artist: "周杰伦", album: "叶惠美", artwork: [...] }

navigator.mediaSession.playbackState
// → "playing"
```

---

## 六、排查指南

### 6.1 `navigator.mediaSession` 不存在

```javascript
typeof navigator.mediaSession // → undefined
```

**原因**：运行在 Web 浏览器（Chrome/Firefox 支持，Safari 部分版本不支持）或过旧的 Electron 版本。

**修复**：`setupMediaSession()` 内部已做 `typeof navigator === 'undefined' || !navigator.mediaSession` 守卫，不支持的平台静默跳过。

### 6.2 封面不显示

- 检查 `track.al?.picUrl` 是否有值（在线歌曲有封面，本地歌曲可能无封面数据）
- 检查 artwork URL 是否为完整 `https://` URL
- macOS 系统栏可能需要时间缓存封面，切歌后等待 1-2 秒

### 6.3 系统控制不响应

- 检查 action handler 注册是否成功（某些平台不支持 `seekto`）
- 检查 `playerStore.togglePlay()` 是否能正常触发播放/暂停
- Electron 版本 ≥ 25 才完整支持 Media Session API

### 6.4 只在 Electron 桌面端生效

Media Session API 依赖 Chromium 的媒体服务桥接 macOS 原生 API。在 Web 浏览器中虽然 `navigator.mediaSession` 存在，但 macOS 系统栏集成程度因浏览器而异：

| 浏览器 | macOS 系统栏集成 |
|---|---|
| Electron (Chromium) | ✅ 完整支持（Control Center / 菜单栏 / Touch Bar / 锁屏） |
| Google Chrome | ✅ 支持（Control Center / 锁屏） |
| Safari | ⚠️ 部分支持（需要 WebKit 特定适配） |
| Firefox | ❌ 不支持 |

---

## 七、维护指南

### 7.1 新增 track 字段

如果 `Track` 类型新增了影响元数据的字段（如 `subtitle`、`podcast` 等），同步更新 `useMediaSession.ts` 中的 `MediaMetadata` 构造。

### 7.2 新增 action handler

```typescript
try {
  navigator.mediaSession.setActionHandler('seekforward', () => {
    playerStore.seek(playerStore.currentTime + 10)
  })
  navigator.mediaSession.setActionHandler('seekbackward', () => {
    playerStore.seek(playerStore.currentTime - 10)
  })
} catch { /* 静默跳过 */ }
```

- 每个 action 只需注册一次
- 用 `try/catch` 包裹以兼容不支持该 action 的平台

### 7.3 相关文件

| 文件 | 说明 |
|---|---|
| `src/composables/useMediaSession.ts` | Media Session 实现（新增） |
| `src/stores/player.ts` | 播放器 Store，`init()` 中调用 |
| `docs/MacOS Now Playing 实现说明.md` | 本文档 |
| `docs/logo-guide.md` | 品牌 Logo SVG 源文件 |
