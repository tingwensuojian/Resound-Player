import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { ShortcutActionId, ShortcutCombo, ShortcutConfig, ShortcutItem } from '../types/shortcut'
import { SHORTCUT_ACTION_ORDER } from '../types/shortcut'
import { usePlayerStore } from './player'
import { useUiStore } from './ui'

/**
 * 快捷键设置 Pinia Store
 *
 * 职责：
 * 1. 通过 IPC 与主进程 shortcutManager 通信（读取/保存/重置配置）
 * 2. 管理快捷键冲突检测（同类型内比较：app vs app, global vs global）
 * 3. 监听主进程发来的快捷键动作并分发到 playerStore
 *
 * 安全说明：
 * - 所有 IPC action 入口都有 `window.appEnv` guard，
 *   Web 端即使被 import 也不会报错。
 */
export const useShortcutStore = defineStore('shortcut', () => {
  const state = reactive({
    /** 以 actionId 为 key 的快捷键配置 */
    shortcuts: {} as Record<ShortcutActionId, ShortcutItem>,
    /** 启用全局快捷键总开关 */
    globalEnabled: true,
    /** 启用物理媒体键 */
    mediaKeysEnabled: true,
    /** 是否正在从 IPC 加载 */
    loading: false,
    regStatus: {} as Record<ShortcutActionId, boolean>,
  })

  // ── IPC 通信（带 Desktop-only guard） ──

  async function loadConfig(): Promise<void> {
    const api = (window as any).appEnv?.shortcutApi
    if (!api?.getConfig) return

    state.loading = true
    try {
      const config: ShortcutConfig = await api.getConfig()
      applyConfig(config)
      await loadRegStatus()
    } catch (e) {
      console.warn('[shortcutStore] loadConfig failed:', e)
    } finally {
      state.loading = false
    }
  }

  async function saveShortcut(
    actionId: ShortcutActionId,
    type: 'app' | 'global',
    combo: ShortcutCombo | null,
  ): Promise<void> {
    const api = (window as any).appEnv?.shortcutApi
    console.log('[shortcutStore] saveShortcut called, api=', !!api, 'saveConfig=', !!(api?.saveConfig))
    if (!api?.saveConfig) {
      console.warn('[shortcutStore] saveShortcut: api.saveConfig unavailable')
      return
    }

    const item = state.shortcuts[actionId]
    if (!item) return

    if (type === 'app') {
      item.appShortcut = combo
    } else {
      item.globalShortcut = combo
    }

    try {
      await api.saveConfig(buildConfig())
      await loadRegStatus()
    } catch (e) {
      console.warn('[shortcutStore] saveShortcut failed:', e)
    }
  }

  async function resetDefaults(): Promise<void> {
    const api = (window as any).appEnv?.shortcutApi
    if (!api?.resetDefaults) return

    try {
      const config: ShortcutConfig = await api.resetDefaults()
      applyConfig(config)
      await loadRegStatus()
    } catch (e) {
      console.warn('[shortcutStore] resetDefaults failed:', e)
    }
  }

  async function loadRegStatus(): Promise<void> {
    const api = (window as any).appEnv?.shortcutApi
    if (!api?.getRegStatus) return
    try {
      state.regStatus = (await api.getRegStatus()) as Record<ShortcutActionId, boolean>
    } catch (e) {
      console.warn('[shortcutStore] loadRegStatus failed:', e)
    }
  }

  async function setGlobalEnabled(enabled: boolean): Promise<void> {
    state.globalEnabled = enabled
    const api = (window as any).appEnv?.shortcutApi
    if (api?.setGlobalEnabled) {
      try { await api.setGlobalEnabled(enabled) } catch {}
    }
  }

  async function setMediaKeysEnabled(enabled: boolean): Promise<void> {
    state.mediaKeysEnabled = enabled
    const api = (window as any).appEnv?.shortcutApi
    if (api?.setMediaKeysEnabled) {
      try { await api.setMediaKeysEnabled(enabled) } catch {}
    }
  }

  // ── 冲突检测（同类型内） ──

  function checkConflict(
    combo: ShortcutCombo | null,
    type: 'app' | 'global',
    excludeId: ShortcutActionId,
  ): ShortcutActionId | null {
    if (!combo) return null

    for (const actionId of SHORTCUT_ACTION_ORDER) {
      if (actionId === excludeId) continue
      const item = state.shortcuts[actionId]
      if (!item) continue

      const target = type === 'app' ? item.appShortcut : item.globalShortcut
      if (!target) continue
      if (isComboEqual(combo, target)) return actionId
    }

    return null
  }

  function isComboEqual(a: ShortcutCombo, b: ShortcutCombo): boolean {
    if (a.key !== b.key) return false
    if (a.modifiers.length !== b.modifiers.length) return false
    const sortedA = [...a.modifiers].sort()
    const sortedB = [...b.modifiers].sort()
    return sortedA.every((m, i) => m === sortedB[i])
  }

  // ── 动作分发 ──

  async function dispatchAction(actionId: string): Promise<void> {
    const playerStore = usePlayerStore()

    switch (actionId) {
      case 'playPause':
        playerStore.togglePlay()
        break
      case 'prevTrack':
        playerStore.prev()
        break
      case 'nextTrack':
        playerStore.next({ forceNext: true })
        break
      case 'volumeUp': {
        const v = (playerStore as any).state?.volume ?? 0.7
        playerStore.setVolume(Math.min(1, v + 0.05))
        break
      }
      case 'volumeDown': {
        const v = (playerStore as any).state?.volume ?? 0.7
        playerStore.setVolume(Math.max(0, v - 0.05))
        break
      }
      case 'likeSong':
        window.appEnv?.playback?.sendCommand?.({ type: 'toggleLike' })
        break
      case 'toggleLyrics': {
        // 开关桌面歌词（浮动歌词窗口），非播放器内歌词面板
        const dlApi = (window as any).appEnv?.desktopLyric
        if (dlApi?.getConfig && dlApi?.setConfig) {
          const config = await dlApi.getConfig()
          config.enabled = !config.enabled
          await dlApi.setConfig(config)
        }
        break
      }
      case 'toggleMiniMode': {
        const uiStore = useUiStore()
        if (uiStore.state.isMiniMode) {
          uiStore.exitMiniMode()
        } else {
          uiStore.enterMiniMode()
        }
        break
      }
    }
  }

  // ── 内部工具 ──

  function applyConfig(config: ShortcutConfig): void {
    if (!config?.shortcuts) return
    const map: Record<string, ShortcutItem> = {}
    for (const item of config.shortcuts) {
      map[item.id] = item
    }
    state.shortcuts = map as Record<ShortcutActionId, ShortcutItem>
    state.globalEnabled = config.globalEnabled
    state.mediaKeysEnabled = config.mediaKeysEnabled
  }

  function buildConfig(): ShortcutConfig {
    return {
      shortcuts: SHORTCUT_ACTION_ORDER
        .map((id) => state.shortcuts[id])
        .filter(Boolean)
        .map((item) => ({
          id: item.id,
          name: item.name,
          appShortcut: item.appShortcut
            ? { key: item.appShortcut.key, modifiers: [...item.appShortcut.modifiers] }
            : null,
          globalShortcut: item.globalShortcut
            ? { key: item.globalShortcut.key, modifiers: [...item.globalShortcut.modifiers] }
            : null,
        })),
      globalEnabled: state.globalEnabled,
      mediaKeysEnabled: state.mediaKeysEnabled,
    }
  }

  // ── 监听主进程发来的快捷键动作 ──

  let cleanupAction: (() => void) | null = null
  let cleanupConfig: (() => void) | null = null

  function startListening(): void {
    stopListening()
    const api = (window as any).appEnv?.shortcutApi
    if (!api) return

    if (api.onShortcutAction) {
      cleanupAction = api.onShortcutAction((actionId: string) => {
        dispatchAction(actionId)
      })
    }
    if (api.onConfigChanged) {
      cleanupConfig = api.onConfigChanged((config: ShortcutConfig) => {
        applyConfig(config)
      })
    }
    if (api.onRegStatusChanged) {
      api.onRegStatusChanged((status: Record<ShortcutActionId, boolean>) => {
        state.regStatus = status
      })
    }
  }

  function stopListening(): void {
    if (cleanupAction) { cleanupAction(); cleanupAction = null }
    if (cleanupConfig) { cleanupConfig(); cleanupConfig = null }
  }

  return {
    state,
    loadConfig,
    saveShortcut,
    resetDefaults,
    loadRegStatus,
    setGlobalEnabled,
    setMediaKeysEnabled,
    checkConflict,
    dispatchAction,
    startListening,
    stopListening,
  }
})
