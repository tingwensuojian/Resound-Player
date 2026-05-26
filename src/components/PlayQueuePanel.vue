<template>
  <Teleport to="body">
    <Transition name="play-queue-fade">
      <div
        v-if="uiStore.state.showPlayQueue"
        class="play-queue-backdrop"
        @click.self="close"
        @wheel.passive
        @touchmove.passive
      />
    </Transition>

    <Transition name="play-queue-slide">
      <div v-if="uiStore.state.showPlayQueue" class="play-queue-panel">
        <AnimatedAppear tag="div" variant="content" rhythm="overlay" class-name="play-queue-inner">
          <!-- Header -->
          <div class="play-queue-header">
            <span class="play-queue-title">播放列表</span>
            <span class="play-queue-count">{{ playerStore.state.playlist.length }} 首</span>
            <button
              v-if="playerStore.state.playlist.length"
              class="play-queue-clear"
              @click="clearAll"
            >清空</button>
          </div>

          <!-- List -->
          <VirtualTrackList
            v-if="queueItems.length"
            ref="trackListRef"
            scroll-mode="self"
            :items="queueItems"
            :row-height="54"
            :item-key="(t: any) => t.id"
            container-class="play-queue-list"
          >
            <template #default="{ item: track, index: idx }">
              <div
                class="song-item"
                :class="{ 'song-item--playing': idx === playerStore.state.currentIndex }"
              >
                <PlayPauseButton
                  :song-id="Number(track.id || 0)"
                  :index-label="idx + 1"
                  @play="playTrack(idx)"
                />
                <img
                  v-if="track.al?.picUrl"
                  class="song-cover play-queue-cover"
                  :src="track.al.picUrl"
                  :alt="track.name"
                  loading="lazy"
                />
                <LocalCoverPlaceholder
                  v-else-if="track.source === 'local'"
                  class="play-queue-cover play-queue-cover--placeholder"
                  :size="40"
                  :icon-size="16"
                  :rounded="8"
                />
                <div v-else class="play-queue-cover play-queue-cover--placeholder">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="play-queue-song-info">
                  <p class="play-queue-song-name">{{ track.name }}</p>
                  <p class="play-queue-artist">
                    <span v-if="track.source === 'podcast'" class="play-queue-source-badge">播客</span>
                    <span v-if="track.podcast?.feeBadge" :class="['play-queue-fee-badge', `play-queue-fee-badge--${track.podcast.feeTone}`]">{{ track.podcast.feeBadge }}</span>
                    {{ formatArtists(track.ar) }}
                  </p>
                </div>
                <button
                  class="play-queue-remove-btn"
                  @click="removeTrack(idx)"
                  aria-label="从播放列表移除"
                  title="移除"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </template>
          </VirtualTrackList>

          <!-- Empty -->
          <div v-else class="play-queue-empty">
            <ListMusic :size="28" />
            <p class="play-queue-empty-text">播放列表为空</p>
            <p class="play-queue-empty-sub">从歌单或排行榜选择歌曲开始播放</p>
          </div>

          <!-- 当前播放信息 -->
          <div v-if="playerStore.state.currentTrack" class="play-queue-footer">
            <span class="play-queue-footer-label">正在播放</span>
            <span class="play-queue-footer-track">{{ playerStore.state.currentTrack.name }}</span>
          </div>
        </AnimatedAppear>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ListMusic } from 'lucide-vue-next';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import AnimatedAppear from './AnimatedAppear.vue';
import PlayPauseButton from './ui/PlayPauseButton.vue';
import LocalCoverPlaceholder from './ui/LocalCoverPlaceholder.vue';
import VirtualTrackList from './VirtualTrackList.vue';

const queueItems = computed(() => playerStore.state.playlist);
const trackListRef = ref<InstanceType<typeof VirtualTrackList> | null>(null);

function close() {
  uiStore.state.showPlayQueue = false;
}

function clearAll() {
  playerStore.clearPlaylist();
}

function removeTrack(index: number) {
  playerStore.removeFromPlaylist(index);
}

function playTrack(index: number) {
  playerStore.playByIndex(index);
}

function formatArtists(ar?: { name: string }[]): string {
  if (!ar || !ar.length) return '未知歌手';
  return ar.map((a) => a.name).join(' / ');
}
</script>

<style scoped>
/* ── Backdrop ── */
.play-queue-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.25);
}

/* ── Panel ── */
.play-queue-panel {
  position: fixed;
  right: calc(var(--layout-left, 8px));
  top: var(--layout-top, 8px);
  bottom: calc(var(--player-bar-height, 84px) + var(--layout-top, 8px));
  width: 330px;
  z-index: 80;
  background:
    radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 100%),
    radial-gradient(ellipse 60% 30% at 50% 100%, rgba(0,0,0,0.05) 0%, transparent 100%),
    color-mix(in srgb, var(--expanded-panel-bg, var(--bg-solid)) 80%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--expanded-line-muted, var(--border));
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.play-queue-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.play-queue-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-4) 0;
  flex-shrink: 0;
}

.play-queue-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--expanded-text-main, var(--text-main));
}

.play-queue-count {
  font-size: var(--text-label-xs);
  color: var(--expanded-text-soft, var(--text-soft));
  margin-right: auto;
}

.play-queue-clear {
  height: 28px;
  padding: 0 var(--space-2);
  border: 1px solid color-mix(in srgb, var(--expanded-line-muted, var(--border)) 80%, transparent);
  border-radius: 8px;
  background: transparent;
  color: var(--expanded-text-sub, var(--text-sub));
  font-size: var(--text-label-xs);
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.play-queue-clear:hover {
  background: color-mix(in srgb, var(--danger, #ef4444) 8%, var(--expanded-panel-bg, var(--bg-solid)));
  border-color: color-mix(in srgb, var(--danger, #ef4444) 36%, var(--expanded-line-muted, var(--border)));
  color: var(--danger, #ef4444);
}

/* ── List ── */
.play-queue-list {
  /* 视觉样式保留，overflow 和 flex 由 .vtl-self 接管 */
  padding: var(--space-2);
  margin: var(--space-2) 0 var(--space-1);
  border-top: 1px solid color-mix(in srgb, var(--expanded-line-muted, var(--border)) 60%, transparent);
  border-radius: 0;
  background: transparent;
  gap: 1px;
}

/* VirtualTrackList self-scroll 模式适配置换面板 */
.play-queue-list.vtl-self {
  flex: 1;
  min-height: 0;
}

.play-queue-list .song-item {
  display: grid;
  grid-template-columns: 40px 40px 1fr auto;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 10px;
  border-bottom: none;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition:
    background 0.15s ease,
    opacity 0.15s ease;
}

.play-queue-list .song-item:hover {
  background: color-mix(in srgb, var(--expanded-accent, var(--accent)) 8%, var(--expanded-panel-bg, var(--bg-solid)));
}

.play-queue-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.play-queue-cover--placeholder {
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--expanded-panel-bg, var(--bg-muted)) 80%, transparent);
  color: var(--expanded-text-soft, var(--text-soft));
}

.play-queue-song-info {
  min-width: 0;
  overflow: hidden;
}

.play-queue-song-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--expanded-text-main, var(--text-main));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-queue-source-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: var(--theme-primary-strong, #6366f1);
}

.play-queue-fee-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
.play-queue-fee-badge--paid {
  color: #fff;
  background: rgba(245,158,11,.85);
}
.play-queue-fee-badge--vip {
  color: #fff;
  background: var(--theme-primary-strong, #6366f1);
}
.play-queue-fee-badge--purchased {
  color: #fff;
  background: rgba(20,184,166,.85);
}

.play-queue-artist {
  margin: 2px 0 0;
  font-size: var(--text-label-xs);
  color: var(--expanded-text-soft, var(--text-soft));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Remove button - visible on hover */
.play-queue-remove-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--expanded-text-soft, var(--text-soft));
  cursor: pointer;
  display: grid;
  place-items: center;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
  flex-shrink: 0;
}

.play-queue-list .song-item:hover .play-queue-remove-btn {
  opacity: 0.6;
}

.play-queue-remove-btn:hover {
  opacity: 1 !important;
  background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
  color: var(--danger, #ef4444);
}

/* Playing indicator override for smaller grid */
.play-queue-list .song-item.song-item--playing {
  box-shadow: 0 6px 16px color-mix(in srgb, var(--expanded-accent, var(--accent)) 12%, rgba(15, 23, 42, 0.10));
}

.play-queue-list .song-item.song-item--playing .play-queue-remove-btn {
  opacity: 0.6;
}

/* ── Empty ── */
.play-queue-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8);
  color: var(--expanded-text-soft, var(--text-soft));
  text-align: center;
}

.play-queue-empty-text {
  margin: 0;
  font-size: var(--text-label-md);
  font-weight: 600;
}

.play-queue-empty-sub {
  margin: 0;
  font-size: var(--text-label-sm);
  opacity: 0.7;
  line-height: 1.4;
}

/* ── Footer ── */
.play-queue-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid color-mix(in srgb, var(--expanded-line-muted, var(--border)) 60%, transparent);
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
}

.play-queue-footer-label {
  font-size: var(--text-label-xs);
  color: var(--expanded-text-soft, var(--text-soft));
  flex-shrink: 0;
  font-weight: 500;
}

.play-queue-footer-track {
  font-size: var(--text-label-xs);
  color: var(--expanded-text-sub, var(--text-sub));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

/* ── Transitions ── */
.play-queue-fade-enter-active,
.play-queue-fade-leave-active {
  transition: opacity 0.22s ease;
}

.play-queue-fade-enter-from,
.play-queue-fade-leave-to {
  opacity: 0;
}

.play-queue-slide-enter-active {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
}

.play-queue-slide-leave-active {
  transition: transform 0.2s ease-in, opacity 0.18s ease;
}

.play-queue-slide-enter-from {
  transform: translateX(20px);
  opacity: 0;
}

.play-queue-slide-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

/* scrollbar */
.play-queue-list::-webkit-scrollbar {
  width: 4px;
}

.play-queue-list::-webkit-scrollbar-track {
  background: transparent;
}

.play-queue-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--expanded-line-muted, var(--border)) 60%, transparent);
  border-radius: 4px;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .play-queue-fade-enter-active,
  .play-queue-fade-leave-active,
  .play-queue-slide-enter-active,
  .play-queue-slide-leave-active {
    transition: none;
  }

  .play-queue-slide-enter-from,
  .play-queue-slide-leave-to {
    transform: none;
    opacity: 1;
  }

  .play-queue-list .song-item {
    animation: none !important;
  }
}
</style>
