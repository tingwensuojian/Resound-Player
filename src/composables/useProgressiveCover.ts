import { ref, computed, watch, type WatchSource } from 'vue'
import { normalizeImageUrl } from '../utils/image'

/**
 * 网易云封面 URL 尺寸参数映射。
 * 原始 URL: https://p2.music.126.net/xxx/yyy.jpg
 * 缩略版:   https://p2.music.126.net/xxx/yyy.jpg?param=100y100
 */
const COVER_PARAMS = {
  lqip: '100y100',
  thumb: '300y300',
  medium: '640y640',
  large: '1024y1024',
} as const

function resolveUrl(base: string, param: string): string {
  if (!base) return ''
  const normalized = normalizeImageUrl(base)
  if (!/^https?:\/\//i.test(normalized)) return normalized
  // 去除已有 param 参数，避免叠加
  const clean = normalized.split('?param=')[0]
  return `${clean}?param=${param}`
}

// ── 设备能力检测（单例，只计一次） ──

function getDeviceTier(): 'high' {
  return 'high'
}
export interface ProgressiveCoverOptions {
  /** 目标全尺寸：'thumb' | 'medium' | 'large'，默认 'large'（1024px） */
  targetSize?: keyof typeof COVER_PARAMS
  /** 是否启用设备自适应降级，默认 true */
  enableDeviceAdaptation?: boolean
}

/**
 * useProgressiveCover
 *
 * 三层渐进式封面加载：
 *   1. LQIP（100px 模糊占位）— 立即显示
 *   2. 缩略图（300px）— 快速加载后替换 LQIP
 *   3. 全尺寸（640/1024px）— 加载完成替换缩略图
 *
 * 根据设备等级（low/mid/high）自动决定最终分辨率，
 * 低端设备在缩略图层级停止，不加载全尺寸。
 *
 * @example
 * ```ts
 * const { lqipUrl, thumbUrl, targetUrl, showFinal, deviceTier, loadedClasses } =
 *   useProgressiveCover(() => props.cover)
 * ```
 */
export function useProgressiveCover(
  src: WatchSource<string | undefined | null>,
  options: ProgressiveCoverOptions = {},
) {
  const { targetSize = 'large', enableDeviceAdaptation = true } = options

  const deviceTier = enableDeviceAdaptation ? getDeviceTier() : 'high'

  // ── 根据设备等级决定最终目标尺寸 ──
  const tierTargetSize = (() => {
    switch (deviceTier) {
      case 'low':  return 'thumb'
      case 'mid':  return 'medium'
      case 'high': return targetSize
    }
  })()

  // ── 响应式原始 URL ──
  const rawUrl = ref('')
  watch(src, (v) => { rawUrl.value = (v as string | undefined | null) || '' }, { immediate: true })

  // ── 三层 URL ──
  const lqipUrl  = computed(() => resolveUrl(rawUrl.value, COVER_PARAMS.lqip))
  const thumbUrl = computed(() => resolveUrl(rawUrl.value, COVER_PARAMS.thumb))
  const targetUrl = computed(() => resolveUrl(rawUrl.value, COVER_PARAMS[tierTargetSize]))

  // ── 加载状态 ──
  const lqipLoaded = ref(false)
  const thumbLoaded = ref(false)
  const targetLoaded = ref(false)

  // showFinal = 页面应显示哪一层
  // - low 设备：thumb 加载完成即 true
  // - mid/high 设备：target 加载完成即 true
  const showFinal = ref(false)

  // 低端设备：跳过渐入动画
  const skipAnimation = deviceTier === 'low'

  // ── 预加载第 1 层：LQIP ──
  watch(lqipUrl, (url) => {
    // For data: URLs (local covers), skip progressive tiers
    if (!url || url.startsWith('data:')) { lqipLoaded.value = true; return }
    const img = new Image()
    img.onload = () => { lqipLoaded.value = true }
    img.onerror = () => { lqipLoaded.value = true }
    img.src = url
  }, { immediate: true })

  // ── 预加载第 2 层：缩略图 ──
  watch(thumbUrl, (url) => {
    if (!url || url.startsWith('data:')) { thumbLoaded.value = true; showFinal.value = true; return }
    const img = new Image()
    img.onload = () => {
      thumbLoaded.value = true
      if (deviceTier === 'low') showFinal.value = true
    }
    img.onerror = () => {
      thumbLoaded.value = true
      if (deviceTier === 'low') showFinal.value = true
    }
    img.src = url
  }, { immediate: true })

  // ── 预加载第 3 层：目标尺寸 ──
  watch(targetUrl, (url) => {
    if (!url || deviceTier === 'low') {
      targetLoaded.value = true
      return
    }
    // For data: URLs (local covers), skip progressive
    if (url.startsWith('data:')) { targetLoaded.value = true; showFinal.value = true; return }
    const img = new Image()
    img.onload = () => {
      targetLoaded.value = true
      showFinal.value = true
    }
    img.onerror = () => {
      targetLoaded.value = true
      // target 加载失败 → 降级到 thumb
      showFinal.value = thumbLoaded.value
    }
    img.src = url
  }, { immediate: true })

  // ── 计算属性：CSS 类名渲染辅助 ──
  const loadedClasses = computed(() => ({
    'progressive--lqip-loaded': lqipLoaded.value,
    'progressive--thumb-loaded': thumbLoaded.value,
    'progressive--final-loaded': targetLoaded.value,
    'progressive--show-final': showFinal.value,
    'progressive--skip-animation': skipAnimation,
  }))

  // ── srcset 字符串（供 <img> 标签使用） ──
  const srcset = computed(() => {
    const normalized = normalizeImageUrl(rawUrl.value || '')
    if (!/^https?:\/\//i.test(normalized)) return ''
    const base = normalized.split('?param=')[0]
    if (!base) return ''
    return [
      `${base}?param=100y100 100w`,
      `${base}?param=300y300 300w`,
      `${base}?param=640y640 640w`,
      `${base}?param=1024y1024 1024w`,
    ].join(', ')
  })

  return {
    lqipUrl,
    thumbUrl,
    targetUrl,
    lqipLoaded,
    thumbLoaded,
    targetLoaded,
    showFinal,
    deviceTier,
    skipAnimation,
    loadedClasses,
    srcset,
  }
}
