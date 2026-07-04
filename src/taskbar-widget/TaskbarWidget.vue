<template>
  <div
    ref="wrapperRef"
    class="wrapper"
    :data-theme="isDark ? 'dark' : 'light'"
    :data-widget-state="widgetState"
    :data-hover="isHovering ? '' : undefined"
    :data-in-drag-region="inDragRegion ? '' : undefined"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <div class="container">
      <!-- Drag handler (left bar, -webkit-app-region:drag is handled by C++) -->
      <div class="drag-handler-wrapper" @mousedown.prevent="onDragHandlerMouseDown">
        <div class="drag-handler" :class="{ highlighted: inDragRegion }"></div>
      </div>

      <!-- Cover -->
      <div class="cover-wrapper">
        <div class="cover" v-if="coverUrl">
          <img :src="coverUrl" alt="" draggable="false" class="visible" />
        <button class="cover-fullscreen-btn" @click.stop="openExpanded" title="\u4E0D\u559C\u6B22\u5E76\u5207\u6362\u4E0B\u4E00\u9996"><svg width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor" transform="scale(-1,1)"><path d="M256 170.666667a128 128 0 0 0-128 128v213.333333a42.666667 42.666667 0 1 0 85.333333 0V298.666667a42.666667 42.666667 0 0 1 42.666667-42.666667h213.333333a42.666667 42.666667 0 1 0 0-85.333333H256z m512 682.666666a128 128 0 0 0 128-128v-170.666666a42.666667 42.666667 0 1 0-85.333333 0v170.666666a42.666667 42.666667 0 0 1-42.666667 42.666667h-192a42.666667 42.666667 0 1 0 0 85.333333H768z"/></svg></button>
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
          <button v-if="!isFm" class="action-btn" @click.stop="sendCmd({ type: 'prev' })">
            <svg width="18" height="18" viewBox="0 0 24 24" ><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
          <button v-else class="action-btn action-btn--dislike" @click.stop="sendCmd({ type: 'dislike' })" title="\u4E0D\u559C\u6B22\u5E76\u5207\u6362\u4E0B\u4E00\u9996">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8 5.5H6.9c-.93 0-1.74.64-1.95 1.54l-1.14 4.9a2 2 0 0 0 1.95 2.46h3.38l-.53 3.92a1.85 1.85 0 0 0 3.4 1.18l4.3-6.14c.2-.28.3-.62.3-.97V7.4a1.9 1.9 0 0 0-1.9-1.9h-3.9Zm7.15 0h1.65A1.4 1.4 0 0 1 21 6.9v6.95a1.4 1.4 0 0 1-1.4 1.4h-1.65V5.5Z"/></svg>
          </button>
          <button class="action-btn action-btn--playback" @click.stop="sendCmd({ type: 'togglePlay' })">
            <svg v-if="isPlaying" width="20" height="20" viewBox="0 0 24 24" ><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" ><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="action-btn" @click.stop="sendCmd({ type: 'next' })">
            <svg width="18" height="18" viewBox="0 0 24 24" ><path d="M6 18 14.5 12 6 6zM16 6h2v12h-2z"/></svg>
          </button>
        </div>
      </div>

      <!-- Collect button -->
      <div class="side-wrapper">
        <span :class="['heart-icon', isLiked ? 'heart--filled' : 'heart--outline']" @click.stop="toggleCollect">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-icon lucide-heart">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import LyricDisplay from './LyricDisplay.vue';

const isHovering = ref(false);
const inDragRegion = ref(false);
const inDragRegionIPC = ref<boolean | null>(null);
const widgetState = ref<'docked' | 'free'>('docked');
const isDark = ref(false);
const isPlaying = ref(false);
const isLiked = ref(false);
const isFm = ref(false);
const likePending = ref(false);
const prevLiked = ref(false);
let lastUserToggleTime = 0;
const currentTrack = ref<any>(null);
const mediaDetail = ref<any>(null);
const coverUrl = ref('');
const trackTitle = ref('');
const currentTime = ref(0);
const duration = ref(0);

const widgetApi = (window as any).widgetEnv?.widget;
const playbackApi = (window as any).widgetEnv?.playback;
const wrapperRef = ref<HTMLElement | null>(null);
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
  const oldTrackId = currentTrack.value?.id;
  currentTrack.value = snap.track || null;
  mediaDetail.value = snap.mediaDetail || null;
  isPlaying.value = snap.playing || false;
  // Track changed or initial load: set isLiked from snapshot
  if (lastUserToggleTime === 0 || (oldTrackId && oldTrackId !== snap.track?.id)) { isLiked.value = snap.liked || false;
isFm.value = snap.isFm || false; lastUserToggleTime = 0; }
console.log('[widget] applySnapshot isLiked:', { liked: snap.liked, isLiked: snap.isLiked, track_liked: snap.track?.liked });
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

  // Subscribe to hover state from IPC (native HoverDetector)
  if (widgetApi?.onHoverChanged) {
    cleanupFns.push(widgetApi.onHoverChanged((hovering: boolean) => {
      isHovering.value = hovering;
    }));
  }

  // Subscribe to drag region state
  if (widgetApi?.onDragRegionChanged) {
    cleanupFns.push(widgetApi.onDragRegionChanged((inDrag: boolean) => {
      inDragRegionIPC.value = inDrag;
      inDragRegion.value = inDrag;
    }));
  }

  // Subscribe to like status changes (dedicated IPC, bypasses snapshot guard)
  if (widgetApi?.onLikeStatusChanged) {
    cleanupFns.push(widgetApi.onLikeStatusChanged((liked: boolean) => {
      isLiked.value = liked; console.log('[widget] liked from IPC:', { liked, track: currentTrack.value?.name });
      lastUserToggleTime = 0;
      likePending.value = false;
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
function openExpanded() { widgetApi?.sendCommand?.({ type: "openExpanded" }); }
function onDragHandlerMouseDown() { widgetApi?.startDrag?.(); }
async function toggleCollect() {
    if (likePending.value) return;
    if (!currentTrack.value) return;

    // 未登录时不翻红，仅发 IPC 触发登录框
    var isLoggedIn = await widgetApi?.checkLogin?.() ?? false;
    if (!isLoggedIn) {
      widgetApi?.sendCommand?.({ type: 'toggleLike' });
      widgetApi?.sendCommand?.({ type: 'openExpanded' });
      return;
    }

    prevLiked.value = isLiked.value;
    likePending.value = true;
    isLiked.value = !isLiked.value;
    lastUserToggleTime = Date.now();
    widgetApi?.sendCommand?.({ type: 'toggleLike' });
    // Safety watchdog: release lock if IPC never responds (e.g. crash)
    setTimeout(() => {
      if (likePending.value) {
        isLiked.value = prevLiked.value;
        likePending.value = false;
        lastUserToggleTime = 0;
      }
    }, 10000);
  }
// JS mouse-event fallback (only when C++ IPC is inactive).
// -webkit-app-region:drag blocks CSS :hover on left 30px.
// C++ IPC via ThreadSafeFunction polls at 60fps.
// JS fallback only sets isHovering; inDragRegion is C++-driven.
let _hoverEnterTime = 0;
function onMouseMove(event: MouseEvent) {
  if (inDragRegionIPC.value !== null) return; // C++ is authoritative
  isHovering.value = true;
}
function onMouseLeave() {
  if (inDragRegionIPC.value !== null) return; // C++ is authoritative
  isHovering.value = false;
  inDragRegion.value = false;
}
</script>



















