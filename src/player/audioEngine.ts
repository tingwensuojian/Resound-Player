/**
 * Web Audio 管线引擎
 *
 * 封装 AudioContext → MediaElementSourceNode → EQ 滤波链 → GainNode 的管理。
 * 单例模式，由 playerStore 创建后共享同一个 HTMLAudioElement 引用。
 *
 * 职责：
 *   - 惰性创建/销毁 Web Audio 管线
 *   - 10 段 peaking EQ 滤波链的插入/旁路
 *   - 音量同步到 GainNode
 *   - AudioContext 的 suspended → running 恢复
 *
 * 不依赖 Vue 响应式系统，不持有 playerStore 引用。
 */

const EQ_DEBUG = false;
const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_Q = 1.41;

function logEqDebug(...args: unknown[]) {
  if (EQ_DEBUG) console.debug('[EQ]', ...args);
}

export interface AudioEngine {
  /** Web Audio 管线是否就绪（audioCtx + sourceNode + gainNode 都已创建） */
  readonly isReady: boolean

  /** EQ 是否处于启用状态 */
  readonly isEnabled: boolean

  /** 惰性创建 Web Audio 管线。首次调用时创建 AudioContext + SourceNode + GainNode */
  ensureReady(): void

  /**
   * 重建或拆除 EQ 滤波链。
   * @param enable true=插入10段EQ, false=直连 source→gain
   * @param gains 可选初始增益值（10 段），不传则默认 0dB
   */
  rebuildChain(enable: boolean, gains?: number[]): void

  /**
   * 设置 10 段 EQ 增益值
   * 仅当 EQ 启用且滤波链存在时生效
   */
  setEqGains(gains: number[]): void

  /** 将 volume + muted 状态同步到 GainNode */
  syncVolume(volume: number, muted: boolean): void

  /** 当 AudioContext 处于 suspended 状态且 EQ 未启用时，恢复为 running */
  resumeIfSuspended(): void
}

export function createAudioEngine(audio: HTMLAudioElement): AudioEngine {
  let audioCtx: AudioContext | null = null
  let sourceNode: MediaElementAudioSourceNode | null = null
  let gainNode: GainNode | null = null
  let eqFilters: BiquadFilterNode[] = []
  let eqEnabled = false
  let initFailed = false

  // 内部：重建滤波链（不暴露 this 引用问题，直接操作闭包变量）
  function rebuildFilterChain(enable: boolean, gains?: number[]) {
    if (!sourceNode || !gainNode || !audioCtx) {
      logEqDebug('[EQ] rebuild skipped, nodes missing')
      return
    }
    eqEnabled = enable
    const mode = enable ? 'ENABLE' : 'BYPASS'
    logEqDebug('rebuild chain', { mode, state: audioCtx.state })

    // 断开所有现有连接
    sourceNode.disconnect()
    gainNode.disconnect()
    eqFilters.forEach((f) => {
      try { f.disconnect() } catch { /* ignore */ }
    })

    if (!enable) {
      // 直连 source → gain
      sourceNode.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      eqFilters = []
      return
    }

    // 启用 EQ：创建 10 段 peaking 滤波器串联插入
    const currentGains = gains ? [...gains] : new Array(10).fill(0)
    while (currentGains.length < 10) currentGains.push(0)

    const filters: BiquadFilterNode[] = []
    for (let i = 0; i < 10; i++) {
      const filter = audioCtx.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = EQ_FREQUENCIES[i]
      filter.Q.value = EQ_Q
      filter.gain.value = Math.max(-12, Math.min(12, currentGains[i]))
      filters.push(filter)
    }

    // 串联：source → filter[0] → ... → filter[9] → gain → destination
    sourceNode.connect(filters[0])
    for (let i = 0; i < 9; i++) {
      filters[i].connect(filters[i + 1])
    }
    filters[9].connect(gainNode)
    gainNode.connect(audioCtx.destination)

    eqFilters = filters
    logEqDebug('EQ filter chain ready', currentGains)
  }

  // 内部：写入现有滤波链的增益值
  function applyEqGains(gains: number[]): boolean {
    if (eqFilters.length !== 10) return false
    for (let i = 0; i < 10; i++) {
      eqFilters[i].gain.value = Math.max(-12, Math.min(12, gains[i]))
    }
    return true
  }

  return {
    get isReady() { return !!audioCtx && !!sourceNode && !!gainNode },
    get isEnabled() { return eqEnabled },

    ensureReady() {
      if (audioCtx) {
        logEqDebug('web audio already exists', {
          state: audioCtx.state,
          hasSource: !!sourceNode,
          hasGain: !!gainNode,
        })
        return
      }
      if (initFailed) {
        console.warn('[EQ] web audio init previously failed, skip')
        return
      }
      logEqDebug('creating web audio pipeline')
      try {
        const ctx = new AudioContext()

        // MediaElementSourceNode 需要 CORS
        if (audio.crossOrigin !== 'anonymous') {
          audio.crossOrigin = 'anonymous'
          if (audio.src && audio.src !== '') {
            const savedSrc = audio.currentSrc || audio.src
            audio.src = savedSrc
            audio.load()
          }
        }

        const src = ctx.createMediaElementSource(audio)
        const gain = ctx.createGain()
        src.connect(gain)
        gain.connect(ctx.destination)

        audioCtx = ctx
        sourceNode = src
        gainNode = gain

        // 确保原生 audio volume 为最大值，音量全部由 GainNode 控制
        audio.volume = 1

        ctx.onstatechange = () => {
          logEqDebug('audio context state changed', ctx.state)
          if (ctx.state === 'closed') {
            audioCtx = null
            sourceNode = null
            gainNode = null
            eqFilters = []
            eqEnabled = false
            initFailed = false
          }
        }

        logEqDebug('web audio pipeline ready', { state: ctx.state, gain: gain.gain.value })
      } catch (e) {
        console.warn('[EQ] web audio init failed:', e)
        audioCtx = null
        sourceNode = undefined as any
        gainNode = null
        eqFilters = []
        initFailed = true
      }
    },

    rebuildChain(enable: boolean, gains?: number[]) {
      rebuildFilterChain(enable, gains)
    },

    setEqGains(gains: number[]) {
      if (gains.length !== 10) {
        console.warn('[EQ] setEqGains invalid length:', gains.length)
        return
      }
      if (!eqEnabled) return
      if (!applyEqGains(gains)) {
        // 滤波链不存在 → 重建后再写入
        rebuildFilterChain(true, gains)
        applyEqGains(gains)
      }
    },

    syncVolume(volume: number, muted: boolean) {
      if (!gainNode) return
      gainNode.gain.value = muted ? 0 : volume
    },

    resumeIfSuspended() {
      if (audioCtx && audioCtx.state === 'suspended' && !eqEnabled) {
        audioCtx.resume().catch(() => {})
      }
    },
  }
}