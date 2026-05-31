import { ref, onMounted } from 'vue'
import { platform } from '../utils/platform'

/**
 * GPU能力检测 composable
 *
 * 检测设备的GPU能力，用于动态调整视觉效果质量
 */
export interface GpuCapability {
  /** 是否支持WebGL */
  webgl: boolean
  /** 是否支持WebGL 2.0 */
  webgl2: boolean
  /** 是否支持backdrop-filter */
  backdropFilter: boolean
  /** 是否支持GPU硬件加速 */
  hardwareAcceleration: boolean
  /** 设备GPU等级: low/mid/high */
  tier: 'low' | 'mid' | 'high'
}

let _capability: GpuCapability | null = null
let _initialized = false

function detectGpuCapability(): GpuCapability {
  // WebGL检测
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  const gl2 = canvas.getContext('webgl2')
  
  // backdrop-filter检测
  const backdropFilterSupported = CSS.supports('backdrop-filter', 'blur(1px)')
  
  // 硬件加速检测 (通过WebGL参数推断)
  let hardwareAcceleration = false
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      // 排除软件渲染器
      hardwareAcceleration = !renderer.toLowerCase().includes('software') &&
                             !renderer.toLowerCase().includes('swiftshader')
    } else {
      // 无法获取调试信息，假设支持硬件加速
      hardwareAcceleration = true
    }
  }
  
  // 设备等级判定
  const mem = (navigator as any).deviceMemory
  const cpu = navigator.hardwareConcurrency
  const isDesktop = platform.isDesktop
  
  let tier: 'low' | 'mid' | 'high' = 'high'
  
  // 低端设备判定
  if (!gl || (mem !== undefined && mem < 2) || (cpu !== undefined && cpu <= 2)) {
    tier = 'low'
  }
  // 中端设备判定
  else if ((mem !== undefined && mem < 4) || (cpu !== undefined && cpu <= 4) || !hardwareAcceleration) {
    tier = 'mid'
  }
  // 高端设备判定
  else if ((mem !== undefined && mem >= 8) && (cpu !== undefined && cpu >= 8) && isDesktop) {
    tier = 'high'
  }
  else {
    tier = 'mid'
  }
  
  return {
    webgl: !!gl,
    webgl2: !!gl2,
    backdropFilter: backdropFilterSupported,
    hardwareAcceleration,
    tier
  }
}

/**
 * 获取GPU能力（单例）
 */
export function getGpuCapability(): GpuCapability {
  if (_capability) return _capability
  
  if (typeof window === 'undefined') {
    // SSR环境返回默认值
    return {
      webgl: false,
      webgl2: false,
      backdropFilter: false,
      hardwareAcceleration: false,
      tier: 'low'
    }
  }
  
  _capability = detectGpuCapability()
  return _capability
}

/**
 * useGpuCapability composable
 *
 * @example
 * ```ts
 * const { capability, isLowTier, shouldReduceEffects } = useGpuCapability()
 * ```
 */
export function useGpuCapability() {
  const capability = ref<GpuCapability>(getGpuCapability())
  const isLowTier = capability.value.tier === 'low'
  const isMidTier = capability.value.tier === 'mid'
  const isHighTier = capability.value.tier === 'high'
  
  // 是否应该减少视觉效果
  const shouldReduceEffects = isLowTier || !capability.value.hardwareAcceleration
  
  // 是否可以使用backdrop-filter
  const canUseBackdropFilter = capability.value.backdropFilter && !shouldReduceEffects
  
  // 是否可以使用WebGL效果
  const canUseWebgl = capability.value.webgl && !isLowTier
  
  return {
    capability,
    isLowTier,
    isMidTier,
    isHighTier,
    shouldReduceEffects,
    canUseBackdropFilter,
    canUseWebgl
  }
}
