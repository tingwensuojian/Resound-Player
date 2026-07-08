# 原生 N-API 流媒体服务优化方案 v2（双平台版）

> 基于前几轮优化之后的**下一阶段优化**。
> 目标：根本性消除 NAS/SMB 音频文件读取对 UI 的卡顿影响。
> 覆盖平台：**Windows（同步 I/O）+ macOS（dispatch_io）**

---

## 为什么还需要这一轮优化

即使当前 StreamingServer 跑在独立子进程中，仍然存在两个深层问题：

| 问题 | 根因 | 影响 |
|------|------|------|
| **子进程的 I/O 仍走 libuv 线程池** | fs.promises.stat 和 fs.createReadStream 底层通过 libuv 线程池发起 I/O。SMB/NFS 操作 50-200ms 的延迟会长时间占用线程池 slot | 当音频大文件占用 libuv 线程池时，主进程的其他 I/O 被排队阻塞 |
| **渲染进程和音频解码共享主线程** | HTMLAudioElement 的解码/缓冲在渲染进程的主线程上进行。50MB WAV 解码时，Chromium 媒体管道占用大量 CPU | UI 渲染和音频解码互相竞争，导致 UI 掉帧 |

**当前 StreamingServer 的瓶颈：**

```
NAS -> SMB/NFS -> StreamingServer(子进程)
  -> fs.promises.stat(file)    每次 Range Request 都做, 50-200ms
  -> fs.createReadStream(file, {start,end})
    -> 内部使用 libuv 线程池
      当多个 Range 同时进来 -> 线程池排队
      主进程的其他 fs 操作也排队
  -> res.pipe(stream) -> HTTP
```

---

## 最终架构（落地后）

**核心思路：C++ 原生模块只做 I/O，HTTP 逻辑保留在 JS。**

```
+----------------------+
|  Electron 主进程     |
|  (main.js)           |
|  +- protocol.handle  |
|  +- 启动流媒体服务   |
+----------+-----------+
           | child_process.fork()
+----------v-----------+
| StreamingServer.js   |
|  (子进程, crash隔离)  |
|  http.createServer() |
|  +- 解析 Range Req  |
|  +- 设置 CORS/MIME  |
|  +- res.end(buffer) |
|  +- 启动 IOWorker   |
+----------+-----------+
           | child_process.fork()
+----------v-----------+
| IOWorker.js          |
|  (子进程, crash隔离)  |
|  JS 层 (Node.js)     |
|  +- IPC 消息调度     |
|  +- 调用 native I/O |
|  +- Buffer 传输     |
|                      |
|  +- N-API 原生模块   |
|    Windows: 同步 I/O |
|    macOS: dispatch_io|
|    +- 专用文件句柄   |
|    +- 零拷贝 Buffer  |
+----------------------+
           |
           v
  HTMLAudioElement (渲染进程)
```

### 关键差异

| 对比项 | 优化前（纯 JS） | 优化后（原生 N-API） |
|--------|----------------|---------------------|
| I/O 线程 | libuv 线程池（4 线程共享） | 子进程独立线程（不阻塞 libuv） |
| 文件打开 | fs.createReadStream | CreateFileW(FILE_FLAG_SEQUENTIAL_SCAN) |
| 崩溃隔离 | 单进程 | 双层隔离（StreamingServer → IOWorker）|
| HTTP 解析 | JS | JS（不变、安全）|
| 回退路径 | 无 | IOWorker 不可用时自动回退 fs.promises |

---

## 分阶段实施状态

### Phase 0 - 环境搭建 ✅ 已落地

- cmake-js 8.0.0 已安装
- VS 2022 BuildTools 已配置
- CMAKE 3.31.6 已下载到 `C:\cmake\`

---

### Phase 1a - Windows N-API 模块 ✅ 已落地

**实现方式：** 子进程内纯同步 I/O（无 OVERLAPPED/IOCP）

```
CreateFileW(path, GENERIC_READ, FILE_SHARE_READ|WRITE,
            NULL, OPEN_EXISTING,
            FILE_FLAG_SEQUENTIAL_SCAN | FILE_FLAG_BACKUP_SEMANTICS,
            NULL)
SetFilePointerEx(hFile, offset, NULL, FILE_BEGIN)
ReadFile(hFile, buffer, size, &bytesRead, NULL)
```

**关键设计决策：** 同步 I/O 在独立子进程中执行，只阻塞该子进程，不影响 Electron 主进程。

---

### Phase 1b - macOS dispatch_io ✅ 已落地

**实现方式：** GCD dispatch_io 异步 I/O

```cpp
dispatch_io_t io = dispatch_io_create_with_path(
  DISPATCH_IO_RANDOM, path.c_str(), O_RDONLY, 0, queue,
  ^(int error) { /* cleanup */ });

dispatch_io_read(io, offset, size, queue,
  ^(bool done, dispatch_data_t data, int error) {
    // dispatch_data -> Buffer (零拷贝)
    callback(buffer, dataSize, 0);
  });
```

**说明：** macOS 上 dispatch_io 是内核级异步 I/O，由 GCD 管理线程池，不需要手动管理 IOCP。

---

### Phase 1c - 共享 N-API 模块入口 ✅ 已落地

```cpp
// main.cc 跨平台导出：
Napi::Value ReadFileChunk(info);  // readFileChunk(path, offset, size) -> Promise<Buffer>
Napi::Value Stat(info);           // stat(path) -> Promise<{size, isFile, exists}>
Napi::Value Shutdown(info);       // shutdown() -> 清理句柄缓存
```

---

### Phase 2 - IOWorker 子进程 ✅ 已落地

**文件：** `electron/services/IOWorker.js`

IPC 协议：

| 方向 | 类型 | 数据 | 说明 |
|------|------|------|------|
| 父->子 | read | { id, path, offset, size } | 读取文件块 |
| 父->子 | stat | { id, path } | 获取文件信息 |
| 父->子 | shutdown | - | 停止子进程 |
| 子->父 | ready | - | 子进程已就绪 |
| 子->父 | data | { id, buffer, bytesRead } | 读取结果 |
| 子->父 | stat-result | { id, size, isFile, exists } | stat 结果 |
| 子->父 | error | { id, code, message } | 操作失败 |

崩溃恢复：5 秒后自动重启，所有待处理请求通过 fallback 路径重试。

---

### Phase 3 - StreamingServer 集成 ✅ 已落地

**文件：** `electron/services/StreamingServer.js`

集成点：
- `startIOWorker()` — 启动 IOWorker 子进程
- `ioWorkerStat(filePath)` — 使用 IOWorker stat（失败回退 fs.promises.stat）
- `ioWorkerRead(filePath, offset, size)` — 使用 IOWorker read（失败回退 fs.createReadStream）
- `handleRequest()` — 完全使用 IOWorker 进行文件 I/O

---

### Phase 4 - 双平台构建 + 分发 ✅ 已落地

**package.json：**
```json
{
  "scripts": {
    "build:native": "cmake-js build -d electron/native/io-worker -O electron/native/io-worker/build",
    "rebuild:native": "cmake-js rebuild -d electron/native/io-worker -O electron/native/io-worker/build"
  }
}
```

**electron-builder（package.json build.extraResources）：**
```json
{
  "from": "electron/native/io-worker/build/Release/io-worker.node",
  "to": "native/io-worker/io-worker.node"
}
```

**CI/CD：**
- `build-win.yml` — 新增 `Build native N-API module` 步骤
- `build-mac.yml` — 新增 `Build native N-API module` 步骤

**CMakeLists.txt：** macOS 新增 `-framework System` 链接

---

## 改动文件清单（最终）

| 层级 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 新建 | electron/native/io-worker/CMakeLists.txt | ✅ | cmake-js 构建配置，条件编译 |
| 新建 | electron/native/io-worker/src/main.cc | ✅ | N-API 入口，导出 readFileChunk/stat/shutdown |
| 新建 | electron/native/io-worker/src/file_io.h | ✅ | 统一回调/结构体接口 |
| 新建 | electron/native/io-worker/src/file_io_win.cc | ✅ | Windows 同步 I/O（CreateFileW + ReadFile）|
| 新建 | electron/native/io-worker/src/file_io_mac.cc | ✅ | macOS dispatch_io 异步 I/O |
| 新建 | electron/native/io-worker/src/thread_safe.h | ✅ | threadsafe function 封装 |
| 新建 | electron/native/io-worker/src/thread_safe.cc | ✅ | TSFN 实现 |
| 新建 | electron/native/io-worker/package.json | ✅ | 模块元信息 |
| 新建 | electron/services/IOWorker.js | ✅ | 子进程入口，IPC 协议实现 |
| 修改 | electron/services/StreamingServer.js | ✅ | 集成 IOWorker，含回退路径 |
| 修改 | package.json | ✅ | extraResources + build:native 脚本 |
| 修改 | .github/workflows/build-win.yml | ✅ | CI 中编译 native 模块 |
| 修改 | .github/workflows/build-mac.yml | ✅ | CI 中编译 native 模块 |

---

## 与现有优化对比

| 优化层次 | 方案 | 状态 | 收益 |
|----------|------|------|------|
| L1 | StreamingServer 子进程 + 异步 stat | ✅ 已实现 | 主进程不阻塞 |
| L2 | Vue reactivity throttle + 缓存 | ✅ 已实现 | UI 更新不卡顿 |
| L3 | Cover 缓存到本地 SSD | ✅ 已实现 | 浏览零 NAS I/O |
| **L4** | **原生 N-API I/O 子进程链路** | **✅ 全部落地** | **libuv 线程池隔离 + 崩溃双层隔离** |

---

## 未来可优化方向

| 方向 | 说明 | 优先级 |
|------|------|--------|
| Windows IOCP 异步 I/O | 当前是同步 I/O 跑子进程，可升级为 OVERLAPPED + IOCP | 低（当前已够用）|
| macOS 真机验证 | file_io_mac.cc 的 dispatch_io 需在 macOS CI 上实测 | 中 |
| 文件句柄缓存 LRU | 当前无限缓存，可加 LRU 淘汰避免句柄泄漏 | 低 |
| 性能 benchmark | 对比 fs.promises vs 原生模块的 SMB 读取延迟 | 低 |
| 流式响应（transfer-encoding: chunked）| 大文件渐进式响应而非一次性读取 | 低 |
