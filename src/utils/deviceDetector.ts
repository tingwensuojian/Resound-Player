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

const STORAGE_KEY = 'resound_device_tier'
const STORAGE_EXPIRY = 24 * 60 * 60 * 1000
let _capability: DeviceCapability | null = null

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
  const tier = calculateDeviceTier({ memory, cpuCores, isMobile, isSlowNetwork, isDesktop })
  return { tier, memory, cpuCores, isTouchDevice, isMobile, isDesktop, isSlowNetwork: Boolean(isSlowNetwork), supportsBackdropFilter, supportsWebGL }
}

function calculateDeviceTier(params: { memory: number | null; cpuCores: number; isMobile: boolean; isSlowNetwork: boolean; isDesktop: boolean }): DeviceTier {
  const { memory, cpuCores, isSlowNetwork, isMobile, isDesktop } = params
  
  // 低端设备判定
  if ((memory !== null && memory < 2) || cpuCores <= 2 || isSlowNetwork) return 'low'
  
  // 中端设备判定：未知内存(常见于平板/移动端)但核数≥8也判为中端，因为 GPU 带宽低于桌面
  const unknownMemory = memory === null
  if ((memory !== null && memory < 4) || cpuCores <= 4 || (unknownMemory && !isDesktop)) return 'mid'
  
  // 高端设备：仅桌面端且内存≥8GB且核数≥8
  if (isDesktop && memory !== null && memory >= 8 && cpuCores >= 8) return 'high'
  
  // 非桌面端即使有 8 核也限为 mid（平板 GPU 带宽不足）
  return 'mid'
}

function loadCachedTier(): { tier: DeviceTier; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) return null
    const data = JSON.parse(cached)
    if (Date.now() - data.timestamp > STORAGE_EXPIRY) { localStorage.removeItem(STORAGE_KEY); return null }
    return data
  } catch { return null }
}

function cacheTier(tier: DeviceTier): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier, timestamp: Date.now() })) } catch {}
}

function getTierPriority(tier: DeviceTier): number {
  return tier === 'low' ? 0 : tier === 'mid' ? 1 : 2
}

export function getDeviceCapability(): DeviceCapability {
  if (_capability) return _capability
  const cached = loadCachedTier()
  _capability = detectDeviceCapability()
  if (cached && getTierPriority(cached.tier) < getTierPriority(_capability.tier)) {
    _capability.tier = cached.tier
  } else {
    cacheTier(_capability.tier)
  }
  return _capability
}

export function injectDeviceTierCSS(): void {
  const cap = getDeviceCapability()
  const root = document.documentElement
  root.setAttribute('data-device-tier', cap.tier)
  root.setAttribute('data-is-mobile', String(cap.isMobile))
  root.setAttribute('data-slow-network', String(cap.isSlowNetwork))
  root.style.setProperty('--device-tier', `'${cap.tier}'`)
  const config = getRenderConfig()
  root.style.setProperty('--detail-blur-radius', `${config.blurRadius}px`)
  root.style.setProperty('--gpu-blur-enabled', config.enableBlur ? '1' : '0')
  root.style.setProperty('--gpu-webgl-enabled', config.enableWebGL ? '1' : '0')
  root.style.setProperty('--gpu-max-animations', String(config.maxConcurrentAnimations))
  console.log('[DeviceDetector] 设备能力:', { tier: cap.tier, memory: cap.memory, cpuCores: cap.cpuCores, isMobile: cap.isMobile, supportsWebGL: cap.supportsWebGL })
}

export function shouldSkipWebGLEffect(): boolean {
  const cap = getDeviceCapability()
  return cap.tier === 'low' || !cap.supportsWebGL
}

export function shouldSimplifyCSSEffects(): boolean {
  return getDeviceCapability().tier === 'low'
}

export function getRenderConfig() {
  const cap = getDeviceCapability()
  const isMobileOrTablet = cap.isMobile || cap.isTouchDevice
  switch (cap.tier) {
    case 'low': return { enableBlur: false, enableWebGL: false, blurRadius: 0, maxConcurrentAnimations: 2 }
    case 'mid': return { enableBlur: true, enableWebGL: false, blurRadius: isMobileOrTablet ? 8 : 12, maxConcurrentAnimations: isMobileOrTablet ? 4 : 6 }
    case 'high': return { enableBlur: true, enableWebGL: true, blurRadius: isMobileOrTablet ? 12 : 24, maxConcurrentAnimations: isMobileOrTablet ? 4 : 8 }
  }
}

export function resetDeviceTierCache(): void {
  localStorage.removeItem(STORAGE_KEY)
  _capability = null
}
