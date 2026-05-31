<template>
  <div class="scroll-to-top-fab-wrap" :class="{ 'scroll-to-top-fab-wrap--fixed': fixed }">
    <button
      v-show="visible"
      class="scroll-to-top-fab"
      :class="{ 'scroll-to-top-fab--hidden': !visible }"
      aria-label="返回顶部"
      :title="`已滚动 ${Math.round(progress * 100)}%`"
      @click="scrollToTop"
    >
      <svg class="scroll-to-top-fab__ring" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          class="scroll-to-top-fab__ring-track"
          cx="24" cy="24" r="20"
        />
        <circle
          class="scroll-to-top-fab__ring-fg"
          cx="24" cy="24" r="20"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
          stroke-linecap="round"
        />
      </svg>
      <span class="scroll-to-top-fab__arrow" aria-hidden="true">&#8593;</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useBackToTop } from '../../composables/useBackToTop';

const props = withDefaults(defineProps<{
  scrollHostSelector?: string | (() => string | undefined);
  threshold?: number;
  fixed?: boolean;
}>(), {
  scrollHostSelector: '.content',
  threshold: 400,
  fixed: false,
});

const { visible, progress, scrollToTop } = useBackToTop({
  scrollHostSelector: props.scrollHostSelector,
  threshold: props.threshold,
});

const RADIUS = 20;
const circumference = 2 * Math.PI * RADIUS;

const dashOffset = computed(() => {
  return circumference * (1 - progress.value);
});
</script>

<style scoped>
.scroll-to-top-fab-wrap {
  position: sticky;
  bottom: 32px;
  display: flex;
  justify-content: flex-end;
  padding: 0 32px;
  pointer-events: none;
  z-index: 10;
}

.scroll-to-top-fab-wrap--fixed {
  position: fixed;
  bottom: calc(var(--player-bar-height, 84px) + 24px);
  right: 32px;
  padding: 0;
}

.scroll-to-top-fab {
  position: relative;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--bg-solid);
  color: var(--text-main);
  cursor: pointer;
  pointer-events: auto;
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.12),
    0 1px 4px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  transition:
    opacity 0.24s ease,
    transform 0.24s ease,
    box-shadow 0.2s ease;
  transform: translateY(0);
}

.scroll-to-top-fab:hover {

  animation: anPopUp var(--an-duration-base) var(--an-ease) both;
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px rgba(15, 23, 42, 0.16),
    0 2px 6px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.scroll-to-top-fab:active {
  transform: translateY(0) scale(0.96);
}

.scroll-to-top-fab--hidden {
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
}

.scroll-to-top-fab__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.scroll-to-top-fab__ring-track {
  fill: none;
  stroke: color-mix(in srgb, var(--border) 50%, transparent);
  stroke-width: 3;
}

.scroll-to-top-fab__ring-fg {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset 0.1s linear;
}

.scroll-to-top-fab__arrow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  color: var(--text-sub);
  transition: color 0.2s ease;
}

.scroll-to-top-fab:hover .scroll-to-top-fab__arrow {
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .scroll-to-top-fab {
    transition: none;
  }
  .scroll-to-top-fab__ring-fg {
    transition: none;
  }
}
</style>