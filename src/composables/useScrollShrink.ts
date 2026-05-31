/**
 * useListScroll
 *
 * 与 SPlayer-dev useListScroll 完全一致的 scroll composable。
 *
 * - 100ms leading-edge 节流
 * - scrollTop > 10 触发 listScrolling = true
 * - 内容不够高时不触发收缩
 */

import { ref } from 'vue'

function createThrottleFn<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let lastCallTime = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    const now = Date.now()
    const elapsed = now - lastCallTime

    if (elapsed >= delay) {
      // Leading edge: fire immediately
      lastCallTime = now
      fn(...args)
      // Clear any trailing call
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    } else if (!timeoutId) {
      // Schedule trailing call
      timeoutId = setTimeout(() => {
        fn(...args)
        timeoutId = null
        lastCallTime = Date.now()
      }, delay - elapsed)
    }
  }
}

export function useListScroll() {
  const listScrolling = ref<boolean>(false)

  /**
   * 处理列表滚动 — 对应 SPlayer-dev handleListScroll
   */
  const handleListScroll = createThrottleFn(
    (e: Event) => {
      const target = e.target as HTMLElement
      const { scrollTop, scrollHeight, clientHeight } = target
      // 如果当前未处于滚动状态，且内容高度不足以支撑收缩后的布局，则不触发
      if (!listScrolling.value && scrollHeight - clientHeight < 150) {
        return
      }
      listScrolling.value = scrollTop > 10
    },
    100,
  )

  /**
   * 重置滚动状态 — 对应 SPlayer-dev resetScroll
   */
  const resetScroll = () => {
    listScrolling.value = false
  }

  return {
    listScrolling,
    handleListScroll,
    resetScroll,
  }
}
