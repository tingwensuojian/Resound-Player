/**
 * IOWorker.js — 原生 I/O 子进程
 * 
 * 通过 IPC 接收主进程的读取请求，使用原生 N-API 模块执行文件 I/O。
 * 运行在独立子进程中，即使原生模块崩溃也不影响主进程。
 */

const path = require('path')

// 查找原生模块路径
function findNativeModule() {
  // CMakeLists.txt 编译输出为 io-worker.node（所有平台统一命名）
  const filename = 'io-worker.node'

  // 开发模式路径
  const devPath = path.join(
    __dirname, '..', 'native', 'io-worker', 'build', 'Release', filename
  )
  // 生产模式路径（通过 electron-builder extraResources 部署）
  const prodPath = path.join(
    process.resourcesPath || '', 'native', 'io-worker', filename
  )

  // 父进程可以通过环境变量指定路径
  if (process.env.NATIVE_MODULE_PATH) {
    return process.env.NATIVE_MODULE_PATH
  }

  try {
    return require.resolve(devPath) ? devPath : null
  } catch {
    try {
      return require.resolve(prodPath) ? prodPath : null
    } catch {
      return null
    }
  }
}

const nativePath = findNativeModule()
if (!nativePath) {
  console.error('[IOWorker] Native module not found')
  process.send({ type: 'error', code: 'MODULE_NOT_FOUND', message: 'Native module not found' })
  process.exit(1)
}

let native
try {
  native = require(nativePath)
} catch (err) {
  console.error('[IOWorker] Failed to load native module:', err.message)
  process.send({ type: 'error', code: 'MODULE_LOAD_ERROR', message: err.message })
  process.exit(1)
}

// ── IPC 消息处理 ──

process.on('message', async (msg) => {
  switch (msg.type) {
    case 'read': {
      try {
        const buffer = await native.readFileChunk(msg.path, msg.offset, msg.size)
        process.send({ type: 'data', id: msg.id, buffer: buffer, bytesRead: buffer.length })
      } catch (err) {
        process.send({ type: 'error', id: msg.id, code: 'READ_ERROR', message: err.message })
      }
      break
    }

    case 'stat': {
      try {
        const result = await native.stat(msg.path)
        process.send({ type: 'stat-result', id: msg.id, size: result.size, isFile: result.isFile, exists: result.exists })
      } catch (err) {
        process.send({ type: 'error', id: msg.id, code: 'STAT_ERROR', message: err.message })
      }
      break
    }

    case 'shutdown': {
      try { native.shutdown() } catch {}
      process.exit(0)
    }
  }
})

// 通知父进程已就绪
process.send({ type: 'ready' })
