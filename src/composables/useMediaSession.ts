import { watch } from 'vue'
import { usePlayerStore } from '../stores/player'

/** 应用 badge 尺寸占封面总尺寸的比例 */
const BADGE_SCALE = 0.49
/** badge 右下角距封面边缘的留白比例 */
const BADGE_PADDING_SCALE = 0

/**
 * 源版 Logo SVG（完整版，含深色圆角矩形背景），用作 badge 图标。
 * 源自 docs/logo-guide.md 的源版 SVG，包含渐变耳机和深色背景。
 */
const BADGE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="%2322c55e"/>
      <stop offset="100%" stop-color="%2316a34a"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="200" height="200" rx="44" fill="%23121317"/>
  <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(%23g)" stroke-width="16" stroke-linecap="round"/>
  <rect x="40" y="100" width="30" height="45" rx="12" fill="url(%23g)"/>
  <rect x="130" y="100" width="30" height="45" rx="12" fill="url(%23g)"/>
  <circle cx="145" cy="122.5" r="5" fill="%23121317" opacity="0.8"/>
</svg>`

const BADGE_LOGO_DATA_URL = `data:image/svg+xml,${BADGE_LOGO_SVG.replace(/\s+/g, ' ')}`

/**
 * 在封面图片右下角叠加品牌 Logo badge（canvas 合成）。
 * macOS 系统栏中显示合成后的图片，badge 使用 Resound-Player 耳机 Logo。
 */
function compositeBadge(coverUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const cover = new Image()
    cover.crossOrigin = 'anonymous'
    cover.onload = () => {
      const size = Math.max(cover.width, cover.height, 256)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // 绘制封面（居中填满正方形）
      const sx = (size - cover.width) / 2
      const sy = (size - cover.height) / 2
      ctx.drawImage(cover, sx, sy, cover.width, cover.height)

      // ── 右下角 badge ──
      const badgeSize = Math.round(size * BADGE_SCALE)
      const pad = Math.round(size * BADGE_PADDING_SCALE)
      const bx = size - badgeSize - pad
      const by = size - badgeSize - pad

      // 加载 Logo SVG（源版含深色背景）并绘制
      const logoImg = new Image()
      logoImg.onload = () => {
        const logoMargin = 0
        const logoSize = badgeSize
        ctx.drawImage(logoImg, bx + logoMargin, by + logoMargin, logoSize, logoSize)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      logoImg.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.85)) // 回退到无 badge 的封面
      logoImg.src = BADGE_LOGO_DATA_URL
    }
    cover.onerror = () => resolve(coverUrl) // 封面加载失败时回退到原图
    cover.src = coverUrl
  })
}

/**
 * 兼容 artwork size：Media Session API 支持多分辨率，至少提供一个平方图
 */
let _lastCompositeUrl = ''
let _lastCompositeResult: string | null = null

async function resolveArtwork(picUrl?: string): Promise<MediaImage[]> {
  if (!picUrl) return []

  // 缓存同一封面 URL 的合成结果，避免重复 canvas 渲染
  if (_lastCompositeUrl === picUrl && _lastCompositeResult) {
    return [
      { src: _lastCompositeResult, sizes: '640x640', type: 'image/jpeg' },
    ]
  }

  const composed = await compositeBadge(picUrl)
  _lastCompositeUrl = picUrl
  _lastCompositeResult = composed

  return [
    { src: composed, sizes: '640x640', type: 'image/jpeg' },
  ]
}

/**
 * 设置 macOS Now Playing / Media Session 元数据和系统媒体控件。
 *
 * 在 renderer 进程调用一次即可，内部通过 watch 自动响应播放状态变化。
 * Electron 的 renderer 进程原生支持 navigator.mediaSession，无需 IPC。
 */
export function setupMediaSession(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) {
    return
  }
  const playerStore = usePlayerStore()

  // ── 注册 action handlers（只需注册一次） ──
  const actions: MediaSessionAction[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']
  for (const action of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, (details) => {
        switch (action) {
          case 'play':
            playerStore.togglePlay()
            break
          case 'pause':
            playerStore.togglePlay()
            break
          case 'previoustrack':
            playerStore.prev()
            break
          case 'nexttrack':
            playerStore.next()
            break
          case 'seekto':
            if (details.seekTime != null) {
              playerStore.seek(details.seekTime)
            }
            break
        }
      })
    } catch {
      // 某些 action 在特定平台可能不支持，静默跳过
    }
  }

  // ── 响应 track 切换 → 更新 metadata（含 badge 合成） ──
  watch(
    () => playerStore.state.currentTrack,
    async (track) => {
      if (!track) {
        navigator.mediaSession.metadata = null
        return
      }

      const title = track.name || ''
      const artist = (track.ar || []).map((a: any) => a.name).join(', ') || '未知艺术家'
      const album = track.al?.name || ''
      const artwork = await resolveArtwork(track.al?.picUrl)

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      })
    },
    { immediate: true },
  )

  // ── 响应播放/暂停状态 → 更新 playbackState ──
  watch(
    () => playerStore.state.isPlaying,
    (playing) => {
      try {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
      } catch {
        // 一些旧版浏览器不支持设置 playbackState
      }
    },
    { immediate: true },
  )

  // ── 响应 duration 变化 → 更新 position state ──
  let lastDuration = -1
  watch(
    () => playerStore.state.duration,
    (dur) => {
      if (dur <= 0 || lastDuration === dur) return
      lastDuration = dur
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: playerStore.state.playbackRate || 1,
          position: playerStore.state.currentTime || 0,
        })
      } catch {
        // 不支持时静默跳过
      }
    },
  )
}