<template>
  <!-- self 模式：组件自身作为滚动容器 -->
  <div
    v-if="scrollMode === 'self'"
    ref="containerRef"
    class="vtl-self"
    :class="containerClass"
    @scroll="onSelfScroll"
  >
    <div class="vtl-body" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="vi in visibleItems"
        :key="resolveKey(vi.item, vi.index)"
        class="vtl-row"
        :style="getRowStyle(vi.index)"
      >
        <slot name="default" :item="vi.item" :index="vi.index" />
      </div>
    </div>
    <div v-if="$slots.sentinel" class="vtl-sentinel">
      <slot name="sentinel" />
    </div>
  </div>

  <!-- parent 模式：监听外部滚动容器 -->
  <div v-else ref="containerRef" class="vtl-parent" :class="containerClass">
    <div class="vtl-body" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="vi in visibleItems"
        :key="resolveKey(vi.item, vi.index)"
        class="vtl-row"
        :style="getRowStyle(vi.index)"
      >
        <slot name="default" :item="vi.item" :index="vi.index" />
      </div>
    </div>
    <div v-if="$slots.sentinel" class="vtl-sentinel">
      <slot name="sentinel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualScroll } from '../composables/useVirtualScroll'

const props = withDefaults(
  defineProps<{
    items: any[]
    rowHeight?: number
    overscan?: number
    scrollMode?: 'self' | 'parent'
    scrollHostSelector?: string
    itemKey?: (item: any, index: number) => string | number
    containerClass?: string
  }>(),
  {
    rowHeight: 68,
    overscan: 15,
    scrollMode: 'self',
    itemKey: (_: any, i: number) => i,
    containerClass: '',
  },
)

defineSlots<{
  default(props: { item: any; index: number }): any
  sentinel?(): any
}>()

// ── 滚动状态 ──
const scrollTop = ref(0)
const containerHeight = ref(600)

// ── 容器 ref ──
const containerRef = ref<HTMLElement | null>(null)

// ── parent 模式：父滚动宿主 ──
let parentScrollHost: HTMLElement | null = null

// ── ResizeObserver ──
let resizeObserver: ResizeObserver | null = null

// ── key 解析 ──
function resolveKey(item: any, index: number): string | number {
  return props.itemKey(item, index)
}

// ── 行样式 ──
function getRowStyle(index: number) {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: `${props.rowHeight}px`,
    transform: `translateY(${index * props.rowHeight}px)`,
  }
}

// ── 可见范围计算 ──
const itemsRef = computed(() => props.items)
const rowHeightRef = computed(() => props.rowHeight)

const { visibleItems, totalHeight } = useVirtualScroll({
  items: itemsRef,
  rowHeight: rowHeightRef,
  overscan: props.overscan,
  scrollTop,
  containerHeight,
})

// ── self 模式 ──
function onSelfScroll(e: Event) {
  const target = e.target as HTMLElement
  scrollTop.value = Math.max(0, target.scrollTop)
}

// ── parent 模式 ──
function onParentScroll() {
  if (!parentScrollHost || !containerRef.value) return
  // 关键：每帧读取 offsetTop，适应吸顶栏折叠等动态偏移
  const listOffset = containerRef.value.offsetTop
  scrollTop.value = Math.max(0, parentScrollHost.scrollTop - listOffset)
}

// ── 清理 ──
function disconnectResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

function unbindParentScroll() {
  if (parentScrollHost) {
    parentScrollHost.removeEventListener('scroll', onParentScroll)
    parentScrollHost = null
  }
}

// ── 生命周期 ──
onMounted(() => {
  // 1. ResizeObserver（self 和 parent 都需要）
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight || containerHeight.value

    resizeObserver = new ResizeObserver(([entry]) => {
      containerHeight.value = entry.contentRect.height
    })
    resizeObserver.observe(containerRef.value)
  }

  // 2. parent 模式：绑定外部滚动容器
  if (props.scrollMode === 'parent' && props.scrollHostSelector) {
    const host = document.querySelector(props.scrollHostSelector) as HTMLElement | null
    if (host) {
      parentScrollHost = host
      parentScrollHost.addEventListener('scroll', onParentScroll, { passive: true })
      // 初始计算一次
      onParentScroll()
    }
  }
})

onBeforeUnmount(() => {
  disconnectResizeObserver()
  unbindParentScroll()
})

// ── items 变化时截断 scrollTop（Bug #2 修复） ──
watch(
  () => props.items.length,
  () => {
    const maxScroll = Math.max(0, props.items.length * props.rowHeight - containerHeight.value)
    if (scrollTop.value > maxScroll) {
      scrollTop.value = maxScroll
    }
  },
)

// ── refresh ──
function refresh() {
  scrollTop.value = 0
  if (props.scrollMode === 'parent' && parentScrollHost) {
    parentScrollHost.scrollTop = 0
  }
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight || containerHeight.value
  }
}

defineExpose({ refresh })
</script>

<style scoped>
.vtl-self {
  overflow-y: auto;
  height: 100%;
}

.vtl-parent,
.vtl-body {
  position: relative;
  width: 100%;
}

.vtl-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
}

.vtl-sentinel {
  position: relative;
  z-index: 0;
}
</style>