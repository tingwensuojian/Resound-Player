#!/usr/bin/env node
'use strict'

/**
 * API 服务器启动包装器
 *
 * 原版 @neteasecloudmusicapienhanced/api/app.js 中 serveNcmApi 是 async 函数
 * 但调用时没有 await，导致顶层 Promise 立即 resolve，进程在 Express 启动后退出。
 *
 * 本脚本：
 * 1. 保留原 app.js 的全部逻辑（generateConfig + serveNcmApi）
 * 2. 保留 process.stdin.resume() 防止事件循环空转退出
 * 3. 捕获 serveNcmApi 的 Promise rejection
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpPath = os.tmpdir()
const tokenFile = path.resolve(tmpPath, 'anonymous_token')

async function start() {
  if (!fs.existsSync(tokenFile)) {
    fs.writeFileSync(tokenFile, '', 'utf-8')
  }

  const generateConfig = require(
    path.resolve(__dirname, '../node_modules/@neteasecloudmusicapienhanced/api/generateConfig')
  )
  await generateConfig()

  const { serveNcmApi } = require(
    path.resolve(__dirname, '../node_modules/@neteasecloudmusicapienhanced/api/server')
  )

  // 不 await —— 让 serveNcmApi 在后台运行，Express 的 app.listen() 会创建 TCP 句柄保持进程存活
  serveNcmApi({ checkVersion: true, port: Number(process.env.PORT) || 38761 }).catch((err) => {
    console.error('[api-wrapper] serveNcmApi error:', err)
    process.exit(1)
  })
}

start().catch((err) => {
  console.error('[api-wrapper] startup error:', err)
  process.exit(1)
})

// 安全网：预防事件循环在 app.listen() 建立 TCP 句柄前退出
// 当 Express server 开始监听后，这个 stdin resume 可以安全存在
if (process.stdin && !process.stdin.isTTY) {
  process.stdin.resume()
}