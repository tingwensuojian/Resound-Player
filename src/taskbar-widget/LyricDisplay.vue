<template>
  <div class="lyric-wrapper">
    <div class="lyric-viewport" ref="viewportRef">
      <div class="lyric-track" :style="trackStyle">
        <div class="lyric lyric--base" ref="baseRef">{{ displayText }}</div>
        <div class="lyric lyric--played" :style="{ width: playedWidth + 'px' }">{{ displayText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  playable: any;
  mediaDetail: any;
}>();

const viewportRef = ref<HTMLElement | null>(null);
const baseRef = ref<HTMLElement | null>(null);
const displayText = ref('');
const playedWidth = ref(0);
const playedFraction = ref(0);
const isPlaying = ref(false);
const scrollOffset = ref(0);

// Lyric data from mediaDetail
let lyricLines: any[] = [];
let currentLineIndex = -1;

const trackStyle = computed(() => ({
  transform: `translateX(${scrollOffset.value}px)`,
}));

function updateScrollOffset() {
  if (!viewportRef.value || !baseRef.value) { scrollOffset.value = 0; return; }
  const vw = viewportRef.value.clientWidth;
  const tw = baseRef.value.scrollWidth;
  if (tw <= vw) { scrollOffset.value = 0; return; }
  const offset = Math.round(vw * 0.55 - playedWidth.value);
  scrollOffset.value = Math.max(vw - tw, Math.min(0, offset));
}

function parseLyricData() {
  lyricLines = [];
  if (!props.mediaDetail?.lyricInfo?.lyricData) return;
  const data = props.mediaDetail.lyricInfo.lyricData;
  if (data.lines && Array.isArray(data.lines)) {
    lyricLines = data.lines;
  }
}

function getCurrentLine(timeSec: number): { line: any; index: number } | null {
  if (!lyricLines.length) return null;
  let best = -1;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].time <= timeSec) best = i;
    else break;
  }
  if (best < 0) return null;
  return { line: lyricLines[best], index: best };
}

function getLineProgress(line: any, timeSec: number): number {
  if (!line) return 1;
  if (!line.words || !line.words.length) {
    const lineEnd = line.time + (line.duration || 3);
    const total = lineEnd - line.time;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (timeSec - line.time) / total));
  }
  let totalProgress = 0;
  for (const w of line.words) {
    if (timeSec * 1000 >= w.startTime + (w.duration || 0)) {
      totalProgress += 1;
    } else if (timeSec * 1000 >= w.startTime) {
      const wordMs = (w.duration || 100);
      totalProgress += (timeSec * 1000 - w.startTime) / wordMs;
    }
  }
  return totalProgress / line.words.length;
}

function updateDisplay(timeSec: number) {
  const lineInfo = getCurrentLine(timeSec);
  if (!lineInfo) {
    scrollOffset.value = 0;
    if (lyricLines.length > 0 && props.playable?.name) {
      displayText.value = props.playable.name;
    }
    playedWidth.value = 0;
    return;
  }
  const { line, index } = lineInfo;
  displayText.value = line.text || '';
  currentLineIndex = index;

  const progress = getLineProgress(line, timeSec);
  playedFraction.value = progress;

  if (baseRef.value) {
    const totalWidth = baseRef.value.scrollWidth;
    playedWidth.value = totalWidth * progress;
    updateScrollOffset();
  }
}

let timeOffset = 0;
function setTime(sec: number) {
  timeOffset = sec;
  updateDisplay(sec);
}

function setPlaying(playing: boolean) {
  isPlaying.value = playing;
}

defineExpose({ setTime, setPlaying, parseLyricData });

watch(() => props.mediaDetail, () => {
  parseLyricData();
}, { immediate: true });
</script>

<style scoped>
.lyric-wrapper {
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 15px;
  height: 1lh;
}
.lyric-viewport {
  width: 100%;
  overflow: hidden;
}
.lyric-track {
  position: relative;
  will-change: transform;
  width: fit-content;
  min-width: 100%;
}
.lyric {
  white-space: nowrap;
}
.lyric--base {
  color: light-dark(rgba(0,0,0,0.5), rgba(255,255,255,0.5));
}
.lyric--played {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: light-dark(rgba(0,0,0,0.9), rgba(255,255,255,0.9));
  pointer-events: none;
}
</style>
