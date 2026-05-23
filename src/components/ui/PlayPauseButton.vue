<template>
  <button
    ref="buttonRef"
    type="button"
    class="play-pause-button"
    :class="{
      'play-pause-button--control': isControlState,
      'play-pause-button--interactive': isInteractiveState,
      'idx': showIndex,
    }"
    :aria-label="ariaLabel"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focus="isFocused = true"
    @blur="isFocused = false"
    @click="onClick"
  >
    <span v-if="showIndex" class="play-pause-button__index">
      {{ indexLabel }}
    </span>

    <svg v-else-if="showPlayIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="play-pause-button__icon">
      <path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor" />
    </svg>

    <svg v-else-if="showPauseIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="play-pause-button__icon">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>

    <span v-else-if="showWave" class="play-pause-button__wave" aria-hidden="true">
      <i></i>
      <i></i>
      <i></i>
    </span>

    <span v-else class="play-pause-button__index">
      {{ indexLabel }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { usePlayerStore } from '../../stores/player'
const playerStore = usePlayerStore();

const props = defineProps<{
  songId: number;
  indexLabel: string | number;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
}>();

const buttonRef = ref<HTMLButtonElement | null>(null);
const isHovered = ref(false);
const isFocused = ref(false);
const isRowHovered = ref(false);
let hoverRowEl: HTMLElement | null = null;

const isCurrentSong = computed(() => Number(props.songId || 0) > 0 && Number(props.songId || 0) === Number(playerStore.state.currentSongId || 0));
const isCurrentSongPlaying = computed(() => isCurrentSong.value && playerStore.state.isPlaying);
const isInteractiveState = computed(() => isHovered.value || isFocused.value || isRowHovered.value);
const showIndex = computed(() => !isCurrentSongPlaying.value && !isInteractiveState.value);
const showPlayIcon = computed(() => !isCurrentSongPlaying.value && isInteractiveState.value);
const showPauseIcon = computed(() => isCurrentSongPlaying.value && isInteractiveState.value);
const showWave = computed(() => isCurrentSongPlaying.value && !isInteractiveState.value);
const isControlState = computed(() => !showIndex.value);
const ariaLabel = computed(() => {
  if (showPauseIcon.value) return '暂停';
  if (showPlayIcon.value) return '播放';
  if (showWave.value) return '正在播放';
  return `第 ${props.indexLabel} 首`;
});

function bindRowHover() {
  const buttonEl = buttonRef.value;
  if (!buttonEl) return;

  hoverRowEl = buttonEl.closest('.song-item') as HTMLElement | null;
  if (!hoverRowEl) return;

  hoverRowEl.addEventListener('mouseenter', onRowMouseEnter);
  hoverRowEl.addEventListener('mouseleave', onRowMouseLeave);
}

function unbindRowHover() {
  if (!hoverRowEl) return;
  hoverRowEl.removeEventListener('mouseenter', onRowMouseEnter);
  hoverRowEl.removeEventListener('mouseleave', onRowMouseLeave);
  hoverRowEl = null;
}

function onRowMouseEnter() {
  isRowHovered.value = true;
}

function onRowMouseLeave() {
  isRowHovered.value = false;
}

function onClick() {
  if (isCurrentSong.value) {
    void playerStore.togglePlay();
    return;
  }

  emit('play');
}

onMounted(() => {
  bindRowHover();
});

onBeforeUnmount(() => {
  unbindRowHover();
});
</script>

<style scoped>
.play-pause-button {
  padding: 0;
  border: 0;
  background: transparent;
  appearance: none;
  box-sizing: border-box;
  cursor: pointer;
  color: inherit;
}

.play-pause-button--control {
  width: 40px;
  min-width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.play-pause-button--interactive {
  color: var(--theme-primary);
}

.play-pause-button__index {
  display: inline;
}

.play-pause-button__icon {
  width: 18px;
  height: 18px;
  display: block;
}

.play-pause-button__wave {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  color: var(--theme-primary);
}

.play-pause-button__wave i {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  transform-origin: center bottom;
  animation: play-pause-button-wave 0.9s ease-in-out infinite;
  will-change: transform, opacity;
}

.play-pause-button__wave i:nth-child(1) {
  height: 14px;
  animation-delay: 0s;
}

.play-pause-button__wave i:nth-child(2) {
  height: 18px;
  animation-delay: 0.15s;
}

.play-pause-button__wave i:nth-child(3) {
  height: 11px;
  animation-delay: 0.3s;
}

@keyframes play-pause-button-wave {
  0%,
  100% {
    transform: scaleY(0.4);
    opacity: 0.55;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
