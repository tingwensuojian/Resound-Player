<template>
  <div class="lyric-wrapper">
    <div class="lyric-viewport" ref="viewportRef">
      <div class="lyric-track">
        <div class="lyric lyric--base" ref="baseRef">{{ displayText }}</div>
        <div class="lyric lyric--played" :style="{ width: playedWidth + 'px' }">{{ displayText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

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

// Lyric data from mediaDetail
let lyricLines: any[] = [];
let currentLineIndex = -1;
let rafId = 0;

function parseLyricData() {
  lyricLines = [];
  if (!props.mediaDetail?.lyricInfo?.lyricData) return;
  const data = props.mediaDetail.lyricInfo.lyricData;
  // The data should have lines with time + words for word-level timing
  if (data.lines && Array.isArray(data.lines)) {
    lyricLines = data.lines;
  }
}

function getCurrentLine(timeSec: number): { line: any; index: number } | null {
  if (!lyricLines.length) return null;
  // Find the last line whose time <= current time
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
    // No word data, use line duration
    const lineEnd = line.time + (line.duration || 3);
    const total = lineEnd - line.time;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (timeSec - line.time) / total));
  }
  // Word-level precision: count words that have started
  let playedWords = 0;
  for (const w of line.words) {
    if (timeSec >= w.startTime) playedWords++;
  }
  return playedWords / line.words.length;
}

function updateDisplay(timeSec: number) {
  const lineInfo = getCurrentLine(timeSec);
  if (!lineInfo) {
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
  
  // Measure text width for the played portion
  if (baseRef.value) {
    const totalWidth = baseRef.value.scrollWidth;
    playedWidth.value = totalWidth * progress;
  }
}

function tick() {
  if (!isPlaying.value) {
    rafId = requestAnimationFrame(tick);
    return;
  }
  // Get current time from the playback state - we'll update from parent
  rafId = requestAnimationFrame(tick);
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
  transition: width 0.05s linear;
  
}
</style>

