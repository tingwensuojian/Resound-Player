<template>
  <div
    class="horizontal-scroll-rail"
    :class="{
      'horizontal-scroll-rail--controls-visible': controlsVisible,
      'horizontal-scroll-rail--hide-mobile-controls': hideControlsOnMobile,
    }"
    @mouseenter="showControlsTemporarily"
    @focusin="showControlsTemporarily"
  >
    <button
      class="horizontal-scroll-rail__btn horizontal-scroll-rail__btn--left button-surface"
      type="button"
      :aria-label="leftLabel"
      @click="scroll('left')"
    >‹</button>
    <div
      ref="railRef"
      class="horizontal-scroll-rail__content ui-safe-rail"
      :class="[contentClass, `horizontal-scroll-rail__content--${contentLayout}`]"
      @scroll.passive="emitScroll"
      @wheel.passive="onWheel"
    >
      <slot />
    </div>
    <button
      class="horizontal-scroll-rail__btn horizontal-scroll-rail__btn--right button-surface"
      type="button"
      :aria-label="rightLabel"
      @click="scroll('right')"
    >›</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = withDefaults(defineProps<{
  ariaLabel?: string;
  contentClass?: string | string[] | Record<string, boolean>;
  contentLayout?: 'grid' | 'flex' | 'block';
  leftLabel?: string;
  rightLabel?: string;
  minScroll?: number;
  scrollRatio?: number;
  controlsTimeout?: number;
  hideControlsOnMobile?: boolean;
}>(), {
  ariaLabel: '横向内容',
  contentClass: '',
  contentLayout: 'grid',
  minScroll: 240,
  scrollRatio: 0.72,
  controlsTimeout: 3000,
  hideControlsOnMobile: true,
});
const emit = defineEmits<{
  (e: 'rail-scroll', event: Event, element: HTMLElement): void;
  (e: 'rail-wheel', event: WheelEvent, element: HTMLElement): void;
}>();

const railRef = ref<HTMLElement | null>(null);
const controlsVisible = ref(false);
let controlsTimer: number | null = null;

const leftLabel = computed(() => props.leftLabel || `向左滚动${props.ariaLabel}`);
const rightLabel = computed(() => props.rightLabel || `向右滚动${props.ariaLabel}`);

function resetControlsTimer() {
  if (controlsTimer) {
    window.clearTimeout(controlsTimer);
  }

  controlsTimer = window.setTimeout(() => {
    controlsVisible.value = false;
    controlsTimer = null;
  }, props.controlsTimeout);
}

function showControlsTemporarily() {
  controlsVisible.value = true;
  resetControlsTimer();
}

function scroll(direction: 'left' | 'right') {
  const root = railRef.value;
  if (!root) return;
  showControlsTemporarily();
  const delta = Math.max(props.minScroll, Math.floor(root.clientWidth * props.scrollRatio));
  root.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
}

function emitScroll(event: Event) {
  const root = railRef.value;
  if (!root) return;
  emit('rail-scroll', event, root);
}

function onWheel(event: WheelEvent) {
  const root = railRef.value;
  if (!root) return;

  const canScroll = root.scrollWidth > root.clientWidth;
  if (!canScroll) return;

  const absDeltaX = Math.abs(event.deltaX);
  const absDeltaY = Math.abs(event.deltaY);
  if (absDeltaY <= absDeltaX) {
    emit('rail-wheel', event, root);
    return;
  }

  root.scrollBy({ left: event.deltaY, behavior: 'auto' });
  emit('rail-wheel', event, root);
}

function scrollToStart() {
  railRef.value?.scrollTo({ left: 0, behavior: 'auto' });
}

defineExpose({
  scrollToStart,
  getRailElement: () => railRef.value,
});

onBeforeUnmount(() => {
  if (controlsTimer) {
    window.clearTimeout(controlsTimer);
    controlsTimer = null;
  }
});
</script>

<style scoped>
.horizontal-scroll-rail {
  position: relative;
  min-width: 0;
  width: 100%;
  overflow: visible;
}

.horizontal-scroll-rail__content {
  gap: var(--horizontal-scroll-gap, var(--space-4));
  min-width: 0;
  width: 100%;
  overflow-x: auto;
  padding-bottom: var(--horizontal-scroll-padding-bottom, var(--space-2));
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  cursor: grab;
}

.horizontal-scroll-rail__content--grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(var(--horizontal-scroll-item-width, 180px), var(--horizontal-scroll-item-width, 180px));
}

.horizontal-scroll-rail__content--flex {
  display: flex;
}

.horizontal-scroll-rail__content--block {
  display: block;
}

.horizontal-scroll-rail__content:active {
  cursor: grabbing;
}

.horizontal-scroll-rail__content::-webkit-scrollbar {
  display: none;
}

.horizontal-scroll-rail__content::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 999px;
}

.horizontal-scroll-rail__content::-webkit-scrollbar-track {
  background: transparent;
}

.horizontal-scroll-rail__btn {
  position: absolute;
  top: 50%;
  z-index: 3;
  width: var(--horizontal-scroll-btn-size, 37px);
  height: var(--horizontal-scroll-btn-size, 37px);
  padding: 0;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) scale(.96);
  transition: opacity .18s ease, transform .18s ease;
}

.horizontal-scroll-rail__btn--left {
  left: var(--horizontal-scroll-btn-offset, -12px);
}

.horizontal-scroll-rail__btn--right {
  right: var(--horizontal-scroll-btn-offset, -12px);
}

.horizontal-scroll-rail:hover .horizontal-scroll-rail__btn,
.horizontal-scroll-rail:focus-within .horizontal-scroll-rail__btn,
.horizontal-scroll-rail--controls-visible .horizontal-scroll-rail__btn {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) scale(1);
}

@media (max-width: 767px) {
  .horizontal-scroll-rail--hide-mobile-controls .horizontal-scroll-rail__btn {
    display: none;
  }
}
</style>
