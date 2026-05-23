/**
 * Resound-Player 封面图片缓存 Service Worker
 *
 * 策略：
 *   - 仅拦截 music.126.net 的图片请求（JPEG/PNG/WebP）
 *   - Cache-First：缓存命中直接返回，未命中走网络并缓存
 *   - LRU 淘汰：缓存超过 MAX_CACHE_ITEMS 时删除最早的内容
 *   - 空闲预缓存：通过 postMessage 接收预缓存 URL 队列
 */

const CACHE_NAME = 'resound-covers-v1'
const MAX_CACHE_ITEMS = 500
const STALE_DAYS = 30

// ── 安装时：跳过等待，立即激活 ──
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith('resound-covers-'))
          .map((key) => caches.delete(key)),
      ),
    ),
  )
})

// ── 是否可缓存的请求 ──
function isCacheableCover(req) {
  const url = new URL(req.url)
  if (!url.hostname.includes('music.126.net')) return false
  if (req.method !== 'GET') return false

  const accept = req.headers.get('Accept') || ''
  const ext = url.pathname.split('.').pop()?.toLowerCase() || ''
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)
  const acceptsImage = accept.includes('image/')

  return isImage || acceptsImage
}

// ── LRU 淘汰 ──
async function evictIfNeeded(cache) {
  const keys = await cache.keys()
  if (keys.length < MAX_CACHE_ITEMS) return

  const entries = await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request)
      const storedAt = response?.headers.get('x-sw-stored-at')
        ? parseInt(response.headers.get('x-sw-stored-at'), 10)
        : Date.now()
      return { request, storedAt }
    }),
  )

  entries.sort((a, b) => a.storedAt - b.storedAt)
  const toDelete = entries.slice(0, Math.min(50, entries.length - MAX_CACHE_ITEMS + 20))
  await Promise.all(toDelete.map((entry) => cache.delete(entry.request)))
}

// ── 异步缓存写入（在 fetch handler 中用 event.waitUntil 管理生命周期） ──
async function writeToCache(request, response) {
  const cache = await caches.open(CACHE_NAME)
  await evictIfNeeded(cache)

  const headers = new Headers(response.headers)
  headers.set('x-sw-stored-at', String(Date.now()))

  const cloned = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })

  await cache.put(request, cloned)
}

// ── 缓存优先策略 ──
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  return fetch(request)
}

// ── fetch 事件处理 ──
self.addEventListener('fetch', (event) => {
  if (!isCacheableCover(event.request)) return

  event.respondWith(
    (async () => {
      const response = await cacheFirst(event.request)

      // 成功后异步写入缓存（用 event.waitUntil 延长生命周期）
      if (response && response.ok) {
        event.waitUntil(writeToCache(event.request, response))
      }

      return response
    })(),
  )
})

// ── 空闲预缓存队列 ──
const PRELOAD_QUEUE = []

self.addEventListener('message', (event) => {
  const msg = event.data

  if (msg?.type === 'preload' && Array.isArray(msg.urls)) {
    for (const url of msg.urls) {
      if (typeof url === 'string' && !PRELOAD_QUEUE.includes(url)) {
        PRELOAD_QUEUE.push(url)
      }
    }
    event.waitUntil(processPreloadQueue())
  }

  if (msg?.type === 'clear-cache') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        cache.keys().then((keys) =>
          Promise.all(keys.map((k) => cache.delete(k))),
        ),
      ),
    )
  }
})

// ── 空闲时逐批处理预缓存队列 ──
async function processPreloadQueue() {
  if (PRELOAD_QUEUE.length === 0) return

  const batch = PRELOAD_QUEUE.splice(0, 3)
  const cache = await caches.open(CACHE_NAME)

  await Promise.all(
    batch.map(async (url) => {
      const existing = await cache.match(url)
      if (existing) return

      try {
        const response = await fetch(url, { mode: 'no-cors' })
        if (response.ok || response.type === 'opaque') {
          await evictIfNeeded(cache)
          await cache.put(url, response)
        }
      } catch {
        // 静默失败
      }
    }),
  )

  if (PRELOAD_QUEUE.length > 0) {
    // 用 setTimeout 代替 requestIdleCallback（SW 中兼容性更好）
    self.setTimeout(() => {
      self.clients.matchAll().then((clients) => {
        if (clients.length > 0) {
          processPreloadQueue()
        }
      })
    }, 2000)
  }
}