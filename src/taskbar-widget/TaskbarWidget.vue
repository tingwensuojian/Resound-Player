<template>
  <div
    class="wrapper"
    :data-theme="isDark ? 'dark' : 'light'"
    :data-widget-state="widgetState"
    :data-hover="isHovering ? '' : undefined"
    :data-in-drag-region="inDragRegion ? '' : undefined"
  >
    <div class="container">
      <!-- Drag handler (left bar, -webkit-app-region:drag is handled by C++) -->
      <div class="drag-handler-wrapper">
        <div class="drag-handler" :class="{ highlighted: inDragRegion }" @mousedown.prevent="onDragHandlerMouseDown"></div>
      </div>

      <!-- Cover -->
      <div class="cover-wrapper">
        <div class="cover" v-if="coverUrl">
          <img :src="coverUrl" alt="" draggable="false" class="visible" />
        </div>
        <div class="cover cover-placeholder" v-else>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
      </div>

      <!-- Main info area -->
      <div class="main-wrapper">
        <div class="info-wrapper">
          <div class="title-wrapper">
            <span class="title">{{ trackTitle || 'Resound-Player' }}</span>
          </div>
          <LyricDisplay ref="lyricRef" :playable="currentTrack" :mediaDetail="mediaDetail" />
        </div>
        <div class="action-wrapper">
          <button class="action-btn" @click.stop="sendCmd({ type: 'prev' })">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
          <button class="action-btn action-btn--playback" @click.stop="sendCmd({ type: 'togglePlay' })">
            <svg v-if="isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="action-btn" @click.stop="sendCmd({ type: 'next' })">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6zM16 6h2v12h-2z"/></svg>
          </button>
        </div>
      </div>

      <!-- Collect button -->
      <div class="side-wrapper">
        <span :class="['heart-icon', isLiked ? 'heart--filled' : 'heart--outline']" @click.stop="toggleCollect">&#x2665;</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import LyricDisplay from './LyricDisplay.vue';

const isHovering = ref(false);
const inDragRegion = ref(false);
const widgetState = ref<'docked' | 'free'>('docked');
const isDark = ref(false);
const isPlaying = ref(false);
const isLiked = ref(false);
const currentTrack = ref<any>(null);
const mediaDetail = ref<any>(null);
const coverUrl = ref('');
const trackTitle = ref('');
const currentTime = ref(0);
const duration = ref(0);

const widgetApi = (window as any).widgetEnv?.widget;
const playbackApi = (window as any).widgetEnv?.playback;
const lyricRef = ref<InstanceType<typeof LyricDisplay> | null>(null);

let cleanupFns: (() => void)[] = [];
let rafId = 0;
let lastSnapshotTime = 0;
let snapshotTimestamp = 0;

function startTimeAnimation() {
  if (rafId) return;
  function tick() {
    if (isPlaying.value && lyricRef.value) {
      // Advance time since last snapshot
      const elapsed = (Date.now() - snapshotTimestamp) / 1000;
      const actualTime = lastSnapshotTime + elapsed;
      if (actualTime <= duration.value || duration.value <= 0) {
        lyricRef.value.setTime(actualTime);
      }
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

function stopTimeAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
}

function applySnapshot(snap: any) {
  if (!snap) return;
  currentTrack.value = snap.track || null;
  mediaDetail.value = snap.mediaDetail || null;
  isPlaying.value = snap.playing || false;
  isLiked.value = snap.liked || false;
  coverUrl.value = snap.track?.cover_url || '';
  trackTitle.value = snap.track?.name || '';
  currentTime.value = snap.currentTime || 0;
  duration.value = snap.duration || 0;
  lastSnapshotTime = snap.currentTime || 0;
  snapshotTimestamp = Date.now();
  if (lyricRef.value) {
    lyricRef.value.setTime(snap.currentTime || 0);
    lyricRef.value.setPlaying(snap.playing || false);
  }
  if (snap.playing) {
    startTimeAnimation();
  } else {
    stopTimeAnimation();
  }
}

onMounted(async () => {
  widgetApi?.rendererReady?.();

  // Subscribe to hover state from IPC (native HoverHelper)
  if (widgetApi?.onHoverChanged) {
    cleanupFns.push(widgetApi.onHoverChanged((hovering: boolean) => {
      isHovering.value = hovering;
    }));
  }

  // Subscribe to drag region state
  if (widgetApi?.onDragRegionChanged) {
    cleanupFns.push(widgetApi.onDragRegionChanged((inDrag: boolean) => {
      inDragRegion.value = inDrag;
    }));
  }

  // Subscribe to theme changes
  if (widgetApi?.onThemeChanged) {
    cleanupFns.push(widgetApi.onThemeChanged((dark: boolean) => {
      isDark.value = dark;
    }));
  }

  // Subscribe to config changes
  if (widgetApi?.onConfigChanged) {
    cleanupFns.push(widgetApi.onConfigChanged((cfg: any) => {
      if (cfg.widgetState) widgetState.value = cfg.widgetState;
      if (cfg.theme === 'dark') isDark.value = true;
      else if (cfg.theme === 'light') isDark.value = false;
    }));
  }

  // Get initial config
  try {
    if (widgetApi?.getConfig) {
      const cfg = await widgetApi.getConfig();
      if (cfg.widgetState) widgetState.value = cfg.widgetState;
    }
  } catch (e) { widgetApi?.debugLog?.('getConfig error', e); }

  // Subscribe to playback state
  if (playbackApi?.onState) {
    cleanupFns.push(playbackApi.onState((snap: any) => {
      applySnapshot(snap);
    }));
  }

  // Get initial snapshot
  try {
    if (playbackApi?.getInitialSnapshot) {
      const snap = await playbackApi.getInitialSnapshot();
      applySnapshot(snap);
    }
  } catch (e) { widgetApi?.debugLog?.('initialSnapshot error', e); }
});

onUnmounted(() => {
  stopTimeAnimation();
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
});
function sendCmd(cmd: any) { widgetApi?.sendCommand?.(cmd); }
function onDragHandlerMouseDown() { widgetApi?.startDrag?.(); }
function toggleCollect() { isLiked.value = !isLiked.value; }
</script>






