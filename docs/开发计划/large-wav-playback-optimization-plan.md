# Large WAV 播放优化方案 - 实现计划

> 基于 StreamingServer + IOWorker + N-API 现有架构，针对 600-700MB 整轨 CD WAV 的加载速度和 UI 反馈优化。

---

## 问题背景

用户播放 NAS 上 600-700MB 的整轨 WAV 文件时，有两个问题：

1. **加载时间长**：浏览器首次请求 Range: bytes=0-（开放式），服务器读取整个 700MB 文件
2. **无 UI 反馈**：点击播放后没有任何加载指示器，用户不知道文件正在加载

---

## 改动清单

### A - StreamingServer 文件读取优化（核心性能）✅ 已落地

| 编号 | 文件 | 改动 | 说明 |
|------|------|------|------|
| A1 | electron/services/StreamingServer.js | parseRange() 中开放式 Range 请求限制最大 1MB | 避免 2800 次 IPC 轮询 |
| A2 | electron/services/StreamingServer.js | 无 Range 头的大文件返回 206 + 只发前 1MB | 浏览器自动按需 Range |
| A3 | electron/services/StreamingServer.js | full-content 分支增加文件大小判断 | 大文件走 206 流式响应 |
| A4 | electron/services/StreamingServer.js | 首次响应设 Accept-Ranges: bytes | 告诉浏览器支持断点续读 |

### B - UI 加载反馈 ✅ 已落地

| 编号 | 文件 | 改动 | 说明 |
|------|------|------|------|
| B1 | src/player/runtime.ts | 新增 oncanplay 事件重置 loading=false | 音频可播放时消除加载状态 |
| B2 | src/player/runtime.ts | 新增 onerror 事件重置 loading=false | 失败时消除加载状态 |
| B3 | src/player/runtime.ts | 新增 onprogress 事件更新 buffered | 驱动 buffered 进度显示 |
| B4 | src/player/runtimeState.ts | 新增 buffered 字段 | 存储已缓冲时长 |
| B5 | src/player/contracts.ts | 新增 buffered 字段 | 跨进程同步 |
| B6 | src/stores/player.ts | buffered 状态初始化 + 同步 | 渲染进程可读取 |
| B7 | src/components/PlayerBar.vue | 播放按钮显示 Loader2 旋转图标 | 用户看到"正在加载" |

### C - 增量优化（待实现）

| 编号 | 文件 | 改动 | 说明 |
|------|------|------|------|
| C1 | electron/services/StreamingServer.js | 对 WAV 文件优先读取前 4KB header | 浏览器收到 header 即可解码 |
| C2 | electron/services/StreamingServer.js | 大文件使用 Transfer-Encoding: chunked | 边读边发，降低首字节延迟 |
| C3 | src/stores/player.ts | 用户 hover 歌曲时预取前 64KB | 点击瞬间开始播放 |

---

## 改动详情

### Phase 1 - StreamingServer 核心修复 ✅

**parseRange() 函数修改：**

开放式 Range 请求的 end 值限制为 start + 1MB，避免浏览器请求整个文件。

**handleRequest() 大文件分支：**

大文件（>10MB）无论是否有 Range 头都返回 206，只发送前 1MB。浏览器收到 Accept-Ranges: bytes 后会自动按 Range 请求后续数据块。

### Phase 2 - UI Loading 反馈 ✅

**runtime.ts 新增事件：**

- oncanplay → loading = false：音频缓冲到可播放时立即清除加载状态
- onerror → loading = false, buffered = 0：加载失败时清除状态
- onprogress → buffered 更新：每 200-500ms 更新已缓冲的数据长度

**PlayerBar.vue 改动：**

- 播放按钮在 isLoadingLocalTrack 时显示 Loader2 旋转图标（CSS spin 动画 1s linear infinite）
- computed: isLoadingLocalTrack = state.loading && currentTrack.source === 'local'

### Phase 3 - 流式响应优化（待实现）

大文件使用 Transfer-Encoding: chunked 边读边发，降低首字节延迟。对 WAV 文件可优先读取前 4KB header 让浏览器立即开始解码。

---

## 影响评估

### 正向影响

| 场景 | 当前行为 | 优化后行为 |
|------|---------|-----------|
| 700MB WAV 首次加载 | 读取整个文件（2800 次 IPC） | 只读前 1MB（1 次 IPC）+ 浏览器自动按需 Range |
| 首次播放时间 | 5-15 秒无反馈 | 1-3 秒内开始播放 |
| UI 反馈 | 无，用户以为卡死 | 旋转图标 + buffered 进度条 |
| 内存占用 | 子进程缓冲整个文件 | 最多缓冲 1MB |

### 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 浏览器不支持 206 后 Range | 低 | audio 规范要求支持 |
| IOWorker 流式兼容性 | 低 | ioWorkerRead 返回 Buffer |
| Loading 干扰非本地来源 | 低 | 只在 sourceKind === 'local' 激活 |

---

## 验证方法

1. 启动桌面开发模式
2. 播放 700MB WAV 文件
3. 确认：
   - [ ] 点击播放后播放按钮立即显示旋转动画
   - [ ] 1-3 秒内听到声音
   - [ ] 进度条显示 buffered 进度
   - [ ] StreamingServer 日志只有少量 ioWorkerRead（非 2800 次）
   - [ ] 整体 UI 不卡顿