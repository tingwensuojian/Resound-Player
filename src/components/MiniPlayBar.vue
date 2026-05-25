<template>
  <div class="mini-play-bar">
    <div class="mini-bar-container">
      <!-- 专辑封面 -->
      <div
        class="cover-wrap"
        :class="{ 'fade-in-bg': !!playerStore.state.currentTrack, 'bg-loaded': coverLoaded }"
        :style="coverStyle"
        @click="onFullscreen"
      />

      <!-- 歌曲信息 -->
      <div class="song-info" @click="onFullscreen">
        <div class="song-title">{{ playerStore.state.currentTrack?.name || '未在播放' }}</div>
        <div class="song-artist">{{ artistText }}</div>
      </div>

      <!-- 播放控制按钮 -->
      <div class="control-buttons">
        <button class="ctrl-btn" @click="playerStore.prev()" aria-label="上一首">
          <SkipBack :size="14" />
        </button>
        <button class="ctrl-btn main" @click="playerStore.togglePlay()" aria-label="播放或暂停">
          <Pause v-if="playerStore.state.isPlaying" :size="16" />
          <Play v-else :size="16" />
        </button>
        <button class="ctrl-btn" @click="playerStore.next()" aria-label="下一首">
          <SkipForward :size="14" />
        </button>
      </div>

      <!-- 右侧功能按钮 -->
      <div class="function-buttons">
        <button
          class="fn-btn"
          :class="{ 'like-active': isCurrentLiked }"
          :disabled="likeLoading"
          @click="toggleCurrentLike"
          aria-label="收藏"
        >
          <Heart :size="14" :fill="isCurrentLiked ? 'currentColor' : 'none'" />
        </button>

        <!-- 音量 -->
        <button class="fn-btn" @click="playerStore.toggleMute()" aria-label="静音切换">
          <VolumeX v-if="playerStore.state.muted || playerStore.state.volume === 0" :size="14" />
          <Volume v-else-if="playerStore.state.volume < 0.33" :size="14" />
          <Volume1 v-else-if="playerStore.state.volume < 0.66" :size="14" />
          <Volume2 v-else :size="14" />
        </button>

        <!-- 播放列表 -->
        <button class="fn-btn" :class="{ 'fn-active': showPlaylist }" @click="togglePlaylist()" aria-label="播放列表" title="播放列表">
          <ListMusic :size="14" />
        </button>

        <!-- 关闭按钮 -->
        <button class="fn-btn close-btn" @click="uiStore.exitMiniMode()" aria-label="退出迷你模式">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- 进度条 -->
    <div
      class="progress-bar"
      @click="onSeek($event)"
      @mousemove="onProgressHover($event)"
      @mouseleave="hoverProgress = false"
    >
      <div class="progress-track" />
      <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
    </div>

    <!-- 下拉播放列表 -->
    <div class="playlist-dropdown" :class="{ open: showPlaylist }">
        <div class="mini-playlist-list">
          <button
            v-for="(track, idx) in playerStore.state.playlist"
            :key="`${track.playlistTrackId || track.id}-${idx}`"
            class="mini-pl-item"
            :class="{ 'mini-pl-item--current': idx === playerStore.state.currentIndex }"
            @dblclick="playByIndex(idx)"
            @mouseenter="hoveredIdx = idx"
            @mouseleave="hoveredIdx = null"
          >
            <span v-if="showIdx(track, idx)" class="mini-pl-idx">{{ idx + 1 }}</span>
            <svg v-else-if="showPlay(track, idx)" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="mini-pl-pp__icon"><path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/></svg>
            <svg v-else-if="showPause(track, idx)" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="mini-pl-pp__icon"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>
            <span v-else class="mini-pl-pp__wave" aria-hidden="true"><i></i><i></i><i></i></span>
            <div
              class="mini-pl-cover"
              :style="track.al?.picUrl ? { backgroundImage: `url(${track.al.picUrl})` } : {}"
            />
            <div class="mini-pl-meta">
              <div class="mini-pl-title">{{ track.name }}</div>
              <div class="mini-pl-artist">{{ (track.ar || []).map((a: any) => a.name).join(' / ') || '-' }}</div>
            </div>
            <button class="mini-pl-remove" @click.stop="playerStore.removeFromPlaylist(idx)" aria-label="移除">
              <X :size="12" />
            </button>
          </button>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  Heart,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { useCurrentTrackLike } from '../composables/useCurrentTrackLike';
import { useBgLoaded } from '../composables/useBgLoaded';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

// 收藏逻辑
const { isCurrentLiked, likeLoading, toggleCurrentLike } = useCurrentTrackLike();

// 下拉播放列表
const showPlaylist = ref(false);
const hoveredIdx = ref<number | null>(null);

const MINI_BAR_HEIGHT = 70;
const MINI_PLAYLIST_HEIGHT = 360;

function resizeMiniWindow(height: number) {
  window.appEnv?.miniMode?.resize?.(height);
}

function syncMiniPlaylistWindow() {
  resizeMiniWindow(showPlaylist.value ? MINI_PLAYLIST_HEIGHT : MINI_BAR_HEIGHT);
}

// ── 序号 / 播放 / 暂停 / 音浪 ──
function isTrackPlaying(track: any) {
  return playerStore.state.currentTrack?.id === track.id;
}

function isPaused() {
  return !!playerStore.state.currentTrack && !playerStore.state.isPlaying;
}

function showIdx(track: any, idx: number) {
  return !isTrackPlaying(track) && hoveredIdx.value !== idx;
}

function showPlay(track: any, idx: number) {
  return (!isTrackPlaying(track) && hoveredIdx.value === idx) ||
         (isPaused() && isTrackPlaying(track) && hoveredIdx.value === idx);
}

function showPause(track: any, idx: number) {
  return isTrackPlaying(track) && !isPaused() && hoveredIdx.value === idx;
}

function togglePlaylist() {
  showPlaylist.value = !showPlaylist.value;
  syncMiniPlaylistWindow();
}

onBeforeUnmount(() => {
  resizeMiniWindow(MINI_BAR_HEIGHT);
});

function playByIndex(idx: number) {
  playerStore.playByIndex(idx);
}

// 封面
const currentPicUrl = computed(() => playerStore.state.currentTrack?.al?.picUrl || '');
const coverStyle = computed(() => {
  if (!currentPicUrl.value) return {};
  return { backgroundImage: `url(${currentPicUrl.value})` };
});
const coverLoaded = useBgLoaded(currentPicUrl);

// 艺术家文本
const artistText = computed(() => {
  const ar = playerStore.state.currentTrack?.ar;
  if (!ar || !ar.length) return '';
  return ar.map((a: { name: string }) => a.name).join(' / ');
});

// 进度条
const progressPercent = computed(() => {
  const duration = playerStore.state.duration || 1;
  return Math.min(100, (playerStore.state.currentTime / duration) * 100);
});

const hoverProgress = ref(false);

function onSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const time = percent * (playerStore.state.duration || 0);
  playerStore.state.audio.currentTime = time;
  playerStore.state.currentTime = time;
}

function onProgressHover(e: MouseEvent) {
  hoverProgress.value = true;
}
// 点击封面 / 歌名区域 → 退出 mini 并打开全屏播放
function onFullscreen() {
  uiStore.exitMiniMode();
  setTimeout(() => {
    playerStore.openExpanded();
  }, 200);
}
</script>

<style scoped>
.mini-play-bar {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-radius: 8px;
  overflow: hidden;
  -webkit-app-region: drag;
}

.mini-bar-container {
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 8px;
  gap: 8px;
}

/* ── 封面 ── */
.cover-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--bg-raised);
  background-size: cover;
  background-position: center;
  border: none;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

/* ── 歌名 / 歌手 ── */
.song-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.song-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main);
}

.song-artist {
  font-size: 11px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-sub);
  margin-top: 1px;
}

/* ── 播放控制 ── */
.control-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  transition: background 0.15s ease;
}

.ctrl-btn:hover {
  background: var(--bg-hover);
}

.ctrl-btn.main {
  background: var(--accent);
  color: #fff;
}

.ctrl-btn.main:hover {
  opacity: 0.9;
}

/* ── 右侧功能按钮 ── */
.function-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.fn-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.fn-btn:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.fn-btn.like-active {
  color: #ef4444;
}

.fn-btn.like-active:hover {
  color: #dc2626;
}

.fn-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.fn-btn.fn-active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

/* ── 下拉播放列表 ── */

.playlist-dropdown {
  position: absolute;
  top: 67px;
  right: 0;
  bottom: 0;
  left: 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
  -webkit-app-region: no-drag;
  height: 0;
  overflow: hidden;
  opacity: 0;
  transition: height 0.28s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.2s ease;
  pointer-events: none;
}

.playlist-dropdown.open {
  height: calc(100% - 67px);
  opacity: 1;
  pointer-events: auto;
}

.mini-playlist-list {
  height: 100%;
  overflow-y: auto;
  padding: 4px 0 0;
}

.mini-playlist-list::-webkit-scrollbar {
  width: 4px;
}

.mini-playlist-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 999px;
}

.mini-pl-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 40px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.mini-pl-item:hover {
  background: var(--bg-hover);
}

.mini-pl-item--current {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.mini-pl-item--current .mini-pl-idx {
  color: var(--accent);
  font-weight: 600;
}

.mini-pl-idx {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--text-soft);
}

/* ── 序号列：播放/暂停图标 ── */
.mini-pl-pp__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: block;
  color: var(--accent);
}

/* ── 序号列：音浪动画 ── */
.mini-pl-pp__wave {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  color: var(--accent);
}

.mini-pl-pp__wave i {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  transform-origin: center bottom;
  animation: mini-pl-wave 0.9s ease-in-out infinite;
  will-change: transform, opacity;
}

.mini-pl-pp__wave i:nth-child(1) { height: 14px; animation-delay: 0s; }
.mini-pl-pp__wave i:nth-child(2) { height: 18px; animation-delay: 0.15s; }
.mini-pl-pp__wave i:nth-child(3) { height: 11px; animation-delay: 0.3s; }

@keyframes mini-pl-wave {
  0%, 100% { transform: scaleY(0.4); opacity: 0.55; }
  50% { transform: scaleY(1); opacity: 1; }
}

.mini-pl-cover {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: var(--bg-muted);
  background-size: cover;
  background-position: center;
}

.mini-pl-meta {
  flex: 1;
  min-width: 0;
}

.mini-pl-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-pl-artist {
  font-size: 10px;
  color: var(--text-sub);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-pl-remove {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, color 0.12s ease;
}

.mini-pl-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* ── 进度条 ── */
.progress-bar {
  position: relative;
  width: 100%;
  height: 3px;
  cursor: pointer;
  transform: scaleY(0.67);
  transform-origin: bottom center;
  transition: transform 0.15s ease;
  -webkit-app-region: no-drag;
}

.progress-bar:hover {
  transform: scaleY(1);
}

.progress-track {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.08);
}

[data-theme='dark'] .progress-track {
  background: rgba(255, 255, 255, 0.1);
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.1s linear;
}
</style>