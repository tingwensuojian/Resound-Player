<template>
  <AnimatedAppear
    tag="button"
    variant="control"
    rhythm="actions"
    type="button"
    class-name="play-btn play-icon-btn"
    :aria-label="computedAriaLabel"
    :disabled="disabled"
    @click="onClick"
  >
    <svg v-if="shouldShowPause" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" />
    </svg>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnimatedAppear from '../AnimatedAppear.vue';
import { usePlayerStore } from '../../stores/player'
const playerStore = usePlayerStore();

const props = defineProps<{
  songId?: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
}>();

const isCurrent = computed(() => Number(props.songId || 0) > 0 && Number(props.songId || 0) === Number(playerStore.state.currentSongId || 0));
const shouldShowPause = computed(() => isCurrent.value && playerStore.state.isPlaying);
const computedAriaLabel = computed(() => (shouldShowPause.value ? '暂停' : '播放'));

function onClick() {
  if (props.disabled) return;
  if (isCurrent.value) {
    void playerStore.togglePlay();
    return;
  }
  emit('play');
}
</script>

<style scoped>
/* 内聚自 theme.css — 覆盖 .play-btn 基线的 icon-only 播放按钮样式 */
.play-icon-btn {
  width: 32px;
  min-width: 32px;
  padding: 0 !important;
  display: inline-grid;
  place-items: center;
  border-radius: 999px !important;
  background: var(--glass-reflection), var(--theme-primary-soft) !important;
  border-color: color-mix(in srgb, var(--theme-primary-strong) 34%, var(--border)) !important;
  color: var(--theme-primary-strong) !important;
  box-shadow: var(--glass-highlight) !important;
}

.play-icon-btn:hover {
  background: var(--glass-reflection), var(--theme-primary-hover) !important;
  border-color: color-mix(in srgb, var(--theme-primary-strong) 46%, var(--border)) !important;
  box-shadow: 0 12px 22px color-mix(in srgb, var(--theme-primary-strong) 12%, transparent), var(--glass-highlight) !important;
}

.play-icon-btn:active {
  background: var(--glass-reflection), var(--theme-primary-active) !important;
}

.play-icon-btn svg {
  width: 16px;
  height: 16px;
  display: block;
  fill: currentColor;
}
</style>
