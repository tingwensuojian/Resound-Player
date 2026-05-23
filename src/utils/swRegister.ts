import { platform } from './platform'

/**
 * Service Worker 注册工具
 *
 * 仅在 Web 环境（非 Electron）且页面通过 localhost 或 HTTPS 提供时注册。
 * Electron 桌面端使用 file:// 协议，不支持 Service Worker。
 */

let _registered = false

export async function registerCoverCacheSW(): Promise<boolean> {
  // 只注册一次
  if (_registered) return true
  if (!('serviceWorker' in navigator)) return false

  // Electron 桌面端：file:// 不支持 SW
  if (platform.isDesktop) {
    console.log('[SW] Electron 桌面端，跳过 Service Worker 注册')
    return false
  }

  // 仅 localhost / HTTPS 可用
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!isLocalhost && location.protocol !== 'https:') {
    console.log('[SW] 非安全上下文，跳过 Service Worker 注册')
    return false
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    _registered = true

    if (registration.installing) {
      console.log('[SW] 安装中...')
    } else if (registration.waiting) {
      console.log('[SW] 等待激活')
    } else if (registration.active) {
      console.log('[SW] 已激活')
    }

    // 监听更新
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            console.log('[SW] 新版本已激活')
          }
        })
      }
    })

    return true
  } catch (err) {
    console.warn('[SW] 注册失败:', err)
    return false
  }
}

/**
 * 向 Service Worker 发送预缓存请求。
 * @param urls - 需要预缓存的封面图片 URL 数组
 */
export function preloadCovers(urls: string[]): void {
  if (!_registered || !navigator.serviceWorker.controller) return

  navigator.serviceWorker.controller.postMessage({
    type: 'preload',
    urls,
  })
}

/**
 * 清空封面缓存
 */
export function clearCoverCache(): void {
  if (!_registered || !navigator.serviceWorker.controller) return

  navigator.serviceWorker.controller.postMessage({
    type: 'clear-cache',
  })
}

/**
 * 获取 SW 是否已注册
 */
export function isSwRegistered(): boolean {
  return _registered
}