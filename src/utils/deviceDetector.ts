export type DeviceTier = 'low' | 'mid' | 'high'

export interface DeviceCapability {
  tier: DeviceTier
  memory: number | null
  cpuCores: number
  isTouchDevice: boolean
  isMobile: boolean
  isDesktop: boolean
  isSlowNetwork: boolean
  supportsBackdropFilter: boolean
  supportsWebGL: boolean
}

/**
 * 始终返回高端设备能力，移除逐级降级逻辑。
 * 所有视觉效果（动画、模糊、WebGL 等）全部启用。
 */
function detectDeviceCapability(): DeviceCapability {
  const isDesktop = typeof window !== 'undefined' && (Boolean((window as any).appEnv?.isDesktop) || /Macintosh|Windows|Linux (?!Android)/i.test(navigator.userAgent || ''))
  const isTouchDevice = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || ('ontouchstart' in window))
  const isMobile = !isDesktop && (isTouchDevice || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''))
  const memory = (navigator as any).deviceMemory ?? null
  const cpuCores = navigator.hardwareConcurrency ?? 4
  const connection = (navigator as any).connection
  const isSlowNetwork = connection && (connection.effectiveType?.includes('2g') || connection.effectiveType?.includes('3g') || connection.saveData === true)
  const supportsBackdropFilter = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)')
  let supportsWebGL = false
  try {
    const canvas = document.createElement('canvas')
    supportsWebGL = Boolean(canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl'))
  } catch (e) { supportsWebGL = false }
  return {
    tier: 'high',
    memory, cpuCores, isTouchDevice, isMobile, isDesktop,
    isSlowNetwork: Boolean(isSlowNetwork), supportsBackdropFilter, supportsWebGL,
  }
}

let _capability: DeviceCapability | null = null

export function getDeviceCapability(): DeviceCapability {
  if (!_capability) _capability = detectDeviceCapability()
  return _capability
}

export function injectDeviceTierCSS(): void {
  const root = document.documentElement
  root.setAttribute('data-device-tier', 'high')
  root.setAttribute('data-is-mobile', String(false))
  root.setAttribute('data-slow-network', String(false))
  root.style.setProperty('--device-tier', "'high'")
  root.style.setProperty('--detail-blur-radius', '24px')
  root.style.setProperty('--gpu-blur-enabled', '1')
  root.style.setProperty('--gpu-webgl-enabled', '1')
  root.style.setProperty('--gpu-max-animations', '8')
}

export function shouldSkipWebGLEffect(): boolean {
  return false
}

export function shouldSimplifyCSSEffects(): boolean {
  return false
}

export function getRenderConfig() {
  return {
    enableBlur: true,
    enableWebGL: true,
    blurRadius: 24,
    maxConcurrentAnimations: 8,
  }
}

export function resetDeviceTierCache(): void {
  try { localStorage.removeItem('resound_device_tier') } catch {}
  _capability = null
}
