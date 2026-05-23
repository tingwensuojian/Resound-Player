import { computed, type Ref, type ComputedRef } from 'vue'

export interface UseVirtualScrollOptions {
  /** 数据源 */
  items: Ref<any[]>
  /** 行高（px），支持响应式 */
  rowHeight: Ref<number> | number
  /** 缓冲行数，默认 15 */
  overscan?: number
  /** 滚动位置（外部驱动） */
  scrollTop: Ref<number>
  /** 容器高度（ResizeObserver 测量） */
  containerHeight: Ref<number>
}

export interface UseVirtualScrollReturn {
  /** 当前可见的行数据 */
  visibleItems: ComputedRef<{ item: any; index: number }[]>
  /** 虚拟 spacer 总高度 */
  totalHeight: ComputedRef<number>
}

/**
 * 纯计算虚拟滚动引擎。
 * 不涉及任何 DOM 操作和生命周期，输入 ref → 输出 computed。
 */
export function useVirtualScroll(options: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const rh = computed(() =>
    typeof options.rowHeight === 'number' ? options.rowHeight : options.rowHeight.value,
  )
  const overscan = options.overscan ?? 15

  const visibleRange = computed(() => {
    const total = options.items.value.length
    const rowH = rh.value
    const st = options.scrollTop.value
    const ch = options.containerHeight.value
    if (!total || !rowH || !ch) return { start: 0, end: 0 }

    const start = Math.max(0, Math.floor(st / rowH) - overscan)
    const end = Math.min(total, Math.ceil((st + ch) / rowH) + overscan)
    return { start, end }
  })

  const visibleItems = computed(() => {
    const { start, end } = visibleRange.value
    const items = options.items.value
    const result: { item: any; index: number }[] = []
    for (let i = start; i < end; i++) {
      const item = items[i]
      if (item !== undefined && item !== null) {
        result.push({ item, index: i })
      }
    }
    return result
  })

  const totalHeight = computed(() => options.items.value.length * rh.value)

  return { visibleItems, totalHeight }
}