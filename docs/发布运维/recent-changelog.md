# 最近改动汇总 (2026-07)

## 一、本地音乐播放性能优化（未提交）

### 1.1 流媒体服务 StreamingServer（新增）

**文件：** electron/services/StreamingServer.js

新增独立的 HTTP 流媒体服务子进程 (fork)，用于 NAS 音频文件播放：
- 启动时分配端口 38764，通过 IPC 通知主进程
- 支持 Range Request（206 Partial Content），浏览器 audio 可直接播放
- 大文件 (>5MB) 通过 307 Redirect 从 local:// 协议重定向到流媒体服务
- 音频数据不经过主进程事件循环，避免 NAS I/O 阻塞主进程 UI

## 二、播放体验改进（未提交）

### 2.1 播放按钮加载指示器（修改）

**文件：** src/components/PlayerBar.vue

- 主播放栏播放按钮新增 Loader2 加载旋转图标
- isLoadingLocalTrack 计算属性检测本地音乐加载状态
- 加载中显示旋转圈，播放中显示暂停图标，暂停显示播放图标
- .spin CSS 动画（1s linear infinite）

### 2.2 Buffered 进度条（修改）

**文件：** src/components/PlayerBar.vue
- 迷你控制台新增 .progress-buffered 元素显示缓冲区加载进度
- 透明度 8%，通过 playerStore.state.buffered 驱动宽度
## 三、UI 规范统一（已提交）

### 3.1 Typography token 审计 (d5c0afc6)
- 新增 --text-label-lg token（16px/500/22px/0.01em）
- 约 40 处硬编码字号/行高替换为 token
- 排版层级统一：Display / Headline / Body / Label

### 3.2 Transition duration 统一 (ca572bcc)
- 0.2s/0.18s/0.16s ease 归一为 220ms var(--an-ease)
- 颜色/文字过渡改为 220ms ease

### 3.3 Radius/bg-hover/layout 归一化 (1b7f3101)
- 圆角 token 对齐 --radius-*
- 背景 hover 统一使用 --bg-hover
- 页面布局间距统一

### 3.4 按钮激活态规范 (13010d45)
- 清除 hover 彩色阴影光晕
- 激活态统一：color-mix(in srgb, var(--accent) 14%, var(--bg-solid))

### 3.5 搜索框 box-shadow 修复 (bb746536)
- 移除搜索框展开时的彩色 box-shadow 光晕

## 四、性能优化（未提交）

### 4.1 歌词索引计算优化

**文件：** src/composables/useLyrics.ts
- currentLyricIndex 从 computed 改为手动 RAF 驱动的 ref
- 歌词行切换时（约2-3秒一次）才触发 Vue 响应式更新
- displayTime 受控更新：最多 10 FPS（100ms 节流）

### 4.2 Three.js 3D 场景优化

**文件：** src/composables/useThreeScene.ts
- 像素比上限 Math.min(window.devicePixelRatio, 2)
- IcosahedronGeometry 细分从 64 降到 32
- THREE 改为同步 import * as THREE

### 4.3 Progressive Cover 优化

**文件：** src/composables/useProgressiveCover.ts
- data: URL 跳过渐进式加载层级（LQIP/thumbnail/target 直接标记为已加载）

### 4.4 RuntimeState 记忆化

**文件：** src/player/runtimeState.ts
- sanitizeTrackForIPC() 新增缓存：相同对象引用直接返回缓存结果
- toSanitizedPlaylist() / toSanitizedLyrics() 新增：数组引用不变时复用结果
- 新增 buffered: number 字段

### 4.5 PlaybackSnapshot 扩展

**文件：** src/player/contracts.ts
- 新增 buffered: number 字段

## 五、其他修复（未提交）
- useIridescence.ts：静态导入修复（OGL Color 类）
- electron/preload.js：新增 openCoverCache、getStreamingPort API 暴露
- electron/main.js：新增 before-quit 清理 StreamingServer 子进程
- electron/main.js：新增开发模式 setTimeout 打开 DevTools 的 fallback

## 回退记录

### 任务栏播控加载旋转图标（已回退）
对 TaskbarWidget.vue 的改动（添加 isLoading 状态 + spinner SVG）和 taskbarWidgetService.js convertSnapshot 的 loading 字段传递已全部回退，不影响现有功能。
### 1.2 protocol.handle 替换 registerFileProtocol（修改）

**文件：** electron/main.js

- 用 protocol.handle(local, async handler) 替换旧的 registerFileProtocol
- 异步 I/O：fs.promises.stat() 替代同步 fs.existsSync() + fs.statSync()
- 支持 Range Request 协议（206 响应 + Content-Range 头）
- 大音频文件自动 307 重定向到 StreamingServer
- 新增 covercache:// 协议，用于封面缓存图片的零拷贝传输
- 在 app.whenReady() 之前注册 registerSchemesAsPrivileged（CORS 支持）
