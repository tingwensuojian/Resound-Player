/**
 * 应用内快捷键 keydown 监听 composable
 *
 * 仅在桌面端生效（通过 platform.isDesktop 门控）。
 * 职责：
 * 1. 启动时加载 shortcutStore 配置
 * 2. 注册主进程 shortcut:action IPC 监听（全局快捷键动作）
 * 3. 监听 window keydown 事件，匹配 appShortcut 组合键
 * 4. 匹配成功后 dispatchAction 到 playerStore
 *
 * 生命周期：在调用方 setup 中注册，onUnmounted 时清理。
 * 必须在组件 setup 顶层调用（不可在 onMounted 内部）。
 */

import { onUnmounted } from 'vue'
import { useShortcutStore } from '../stores/shortcutStore'
import { platform } from '../utils/platform'
import { eventToShortcutCombo } from '../utils/shortcutPlatformUtil'
import { SHORTCUT_ACTION_ORDER } from '../types/shortcut'

export function useShortcutKeydown(): void {
  // Web 端不启用任何快捷键功能
  if (!platform.isDesktop) return

  const shortcutStore = useShortcutStore()

  // 1. 加载快捷键配置
  shortcutStore.loadConfig()

  // 2. 监听主进程发来的全局快捷键动作（shortcut:action IPC）
  shortcutStore.startListening()

  // 3. 注册应用内 keydown 监听
  const handler = (event: KeyboardEvent): void => {
    // 输入元素中不触发快捷键
    const tag = (event.target as HTMLElement)?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    if ((event.target as HTMLElement)?.contentEditable === 'true') return

    // 忽略长按重复
    if (event.repeat) return

    const combo = eventToShortcutCombo(event.code, event.altKey, event.ctrlKey, event.metaKey, event.shiftKey)

    // 匹配 appShortcut
    for (const actionId of SHORTCUT_ACTION_ORDER) {
      const item = shortcutStore.state.shortcuts[actionId]
      if (!item?.appShortcut) continue

      const app = item.appShortcut
      if (combo.key !== app.key) continue
      if (combo.modifiers.length !== app.modifiers.length) continue

      // 比较修饰符
      const sortedCombo = [...combo.modifiers].sort()
      const sortedApp = [...app.modifiers].sort()
      const match = sortedCombo.every((m, i) => m === sortedApp[i])

      if (match) {
        event.preventDefault()
        shortcutStore.dispatchAction(actionId)
        return
      }
    }
  }

  window.addEventListener('keydown', handler)

  // 4. 组件卸载时清理
  onUnmounted(() => {
    window.removeEventListener('keydown', handler)
    shortcutStore.stopListening()
  })
}
