# 本地音乐播放卡顿优化方案（完整版）

## 三次审计的完整演化

| 审计 | 触发场景 | 根因 | 严重程度 | 修复方式 |
|------|---------|------|---------|---------|
| 第1次 | 浏览/首次播放 | 主进程同步 I/O 阻塞 libuv | 整个应用冻结 | StreamingServer 子进程 + 异步 stat + 端口重试 + Cover 版本号合并 |
| 第2次 | 播放中持续卡顿 | timeupdate 每 250ms Vue 全组件重渲染 | 明显掉帧 | applyPlaybackSnapshot 按需更新 + publishState throttle |
| 第3次 | 播放中微卡顿 | toPlaybackSnapshot 每 250ms 创建新对象(GC) + 歌词 IPC 重复构建 | 轻微可感知 | 三处缓存(sanitizeTrack/playlist/lyrics) + desktopLyric lrcArray 缓存 |

## 完整改动清单（13 文件）

### electron/main.js
- protocol.handle 异步 stat + 307 大文件重定向
- StreamingServer fork + 启动 + cleanup
- streamingServerPort 提权到 protocol.handle 作用域

### electron/services/StreamingServer.js
- 独立子进程 HTTP 流媒体服务
- fs.statSync → fs.promises.stat

### electron/preload.js
- 暴露 getStreamingPort IPC

### src/stores/player.ts
- 优先使用 StreamingServer HTTP URL
- applyPlaybackSnapshot: 只在 track ID 变化时替换 currentTrack
- publishState throttle 最多 1 次/秒
- loadLocalTrackCoverAsync 延迟 1s

### src/stores/localMusic.ts
- batchCheckLocalCovers / lazyLoadCovers: _coverVersion++ 移出循环

### src/utils/platform.ts
- getStreamingPort 自动重试 3 次 + 模块加载时预获取

### src/player/runtimeState.ts
- sanitizeTrackForIPC 缓存: 相同对象引用返回缓存
- toSanitizedPlaylist 缓存: 相同数组引用返回缓存
- toSanitizedLyrics 缓存: 相同数组引用返回缓存

### src/components/PlayerBar.vue
- desktopLyric.updateData watcher: lrcArray 仅在歌词/曲目变化时重建

## 播放期间热路径最终状态

timeupdate (4次/秒):
  runtime.ts -> audio.ontimeupdate
    -> state.currentTime = audio.currentTime (1 number 赋值)
    -> notify() -> bridge -> toPlaybackSnapshot(state)
      -> sanitizeTrackForIPC(currentTrack) --> 缓存命中
      -> toSanitizedPlaylist(playlist) --> 缓存命中
      -> toSanitizedLyrics(fullLyrics) --> 缓存命中
    -> applyPlaybackSnapshot(snapshot)
      -> track 未变 -> 跳过 currentTrack 赋值
      -> state.currentTime = snapshot.currentTime (1 number 赋值)
    -> publishState throttle: >1s 时才发送 IPC

PlayerBar (60 FPS RAF):
  RAF tick -> displayTime.value = audio.currentTime
  -> currentLyricIndex computed (仅索引变化时)
  -> desktopLyric.updateData: lrcArray 不再重建
  -> trayLyric.syncTick([time, dur]): 3 number IPC

## 架构总图

NAS (SMB)
  +-> 扫描时: NodeMusicScanner - CoverCache(SSD) - SQLite(SSD)
  +-> 浏览时: SQLite + CoverCache(SSD) = 零 NAS I/O
  +-> 播放时: StreamingServer(子进程) - HTTP - audio element
      主进程从不在音频数据路径上

timeupdate 时渲染进程:
  toPlaybackSnapshot 所有对象创建均已缓存
  applyPlaybackSnapshot 只写 4 个轻量字段
  publishState IPC 每秒最多 1 次
  desktopLyric lrcArray 不重复构建