<template>
  <AnimatedAppear tag="footer" variant="content" rhythm="overlay" class-name="bar">
    <AnimatedAppear tag="div" variant="text" rhythm="body" class-name="left">
      <AnimatedAppear tag="div" variant="media" rhythm="list" class-name="cover-wrap">
        <button class="cover" :class="{ 'fade-in-bg': !!playerStore.state.currentTrack && !isLocalCurrentTrackWithoutCover, 'bg-loaded': coverLoaded, 'cover--placeholder': isLocalCurrentTrackWithoutCover }" :style="coverStyle" @click="playerStore.openExpanded()">
          <LocalCoverPlaceholder v-if="isLocalCurrentTrackWithoutCover" class="cover-placeholder" :size="52" :icon-size="20" :rounded="12" />
          <svg v-else class="cover-logo" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 140 140" width="100%" height="100%">
            <defs>
              <linearGradient id="logoGradBar" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#22c55e;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
              </linearGradient>
            </defs>
            <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradBar)" stroke-width="16" stroke-linecap="round" />
            <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradBar)" />
            <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradBar)" />
            <circle cx="145" cy="122.5" r="5" fill="currentColor" opacity="0.3" />
          </svg>
        </button>
        <button class="cover-fullscreen-btn" title="全屏" @click="playerStore.openExpanded()"><svg width="24" height="24" viewBox="0 0 1024 1024" fill="currentColor" transform="scale(-1,1)"><path d="M256 170.666667a128 128 0 0 0-128 128v213.333333a42.666667 42.666667 0 1 0 85.333333 0V298.666667a42.666667 42.666667 0 0 1 42.666667-42.666667h213.333333a42.666667 42.666667 0 1 0 0-85.333333H256z m512 682.666666a128 128 0 0 0 128-128v-170.666666a42.666667 42.666667 0 1 0-85.333333 0v170.666666a42.666667 42.666667 0 0 1-42.666667 42.666667h-192a42.666667 42.666667 0 1 0 0 85.333333H768z"/></svg></button>
      </AnimatedAppear>
      <div class="meta">
        <div class="title-row">
          <AnimatedAppear tag="div" variant="text" rhythm="body" class-name="title">{{ playerStore.state.currentTrack?.name || '未在播放' }}</AnimatedAppear>
        </div>
        <AnimatedAppear tag="div" variant="text" rhythm="body" :index="1" class-name="artist"><template v-if="playerStore.state.isPlaying && currentLyricText && lyricsSettings.state.showBarLyric"><span class="lyric-text" :title="currentLyricText">{{ currentLyricText }}</span></template><template v-else>{{ artistText }}<span v-if="uiStore.state.unblockEnabled && playerStore.state.currentTrack" class="source-badge">{{ sourceLabel }}</span></template></AnimatedAppear>
        <LocalMetadataStatusBadge
          v-if="isLocalCurrentTrack && localMetadataStatus"
          class="player-local-status"
          :result="localMetadataStatus"
          compact
        />
      </div>
    </AnimatedAppear>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="center">
      <div class="controls-row">
        <AnimatedAppear v-if="isPersonalFmCurrentTrack" tag="button" variant="control" rhythm="actions" class-name="ctrl ctrl-dislike" @click="dislikeFmTrack" aria-label="不喜欢并切换下一首">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8 5.5H6.9c-.93 0-1.74.64-1.95 1.54l-1.14 4.9a2 2 0 0 0 1.95 2.46h3.38l-.53 3.92a1.85 1.85 0 0 0 3.4 1.18l4.3-6.14c.2-.28.3-.62.3-.97V7.4a1.9 1.9 0 0 0-1.9-1.9h-3.9Zm7.15 0h1.65A1.4 1.4 0 0 1 21 6.9v6.95a1.4 1.4 0 0 1-1.4 1.4h-1.65V5.5Z"/></svg>
        </AnimatedAppear>
        <AnimatedAppear v-else tag="button" variant="control" rhythm="actions" class-name="ctrl" @click="playerStore.prev()" aria-label="上一首">
          <SkipBack :size="16" />
        </AnimatedAppear>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="1" class-name="ctrl main" @click="playerStore.togglePlay()" aria-label="播放或暂停">
          <Pause v-if="playerStore.state.isPlaying" :size="18" />
          <Play v-else :size="18" />
        </AnimatedAppear>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="2" class-name="ctrl" @click="playerStore.next()" aria-label="下一首">
          <SkipForward :size="16" />
        </AnimatedAppear>
      </div>
      <div class="progress-row">
        <span class="time">{{ formatTime(playerStore.state.currentTime) }}</span>
        <input
          class="progress"
          type="range"
          min="0"
          :max="Math.max(1, Math.floor(playerStore.state.duration || 0))"
          :value="Math.floor(playerStore.state.currentTime || 0)"
          @input="onSeek"
        />
        <span class="time">{{ formatTime(playerStore.state.duration) }}</span>
      </div>
    </AnimatedAppear>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="right">
      <AnimatedAppear tag="div" variant="control" rhythm="actions" class-name="vol">
        <button class="vol-icon-btn" type="button" :aria-label="playerStore.state.muted ? '取消静音' : '静音'" @click="playerStore.toggleMute()">
          <VolumeX v-if="playerStore.state.muted || playerStore.state.volume === 0" :size="16" />
          <Volume v-else-if="playerStore.state.volume < 0.33" :size="16" />
          <Volume1 v-else-if="playerStore.state.volume < 0.66" :size="16" />
          <Volume2 v-else :size="16" />
        </button>
        <input type="range" min="0" max="100" :value="Math.round((playerStore.state.muted ? 0 : playerStore.state.volume) * 100)" @input="onVolume" />
      </AnimatedAppear>
      <AnimatedAppear v-if="playerStore.state.isIntelligenceActive &amp;&amp; uiStore.state.showIntelligenceIndicator" tag="button" variant="control" rhythm="actions" class-name="icon intel-icon" aria-label="心动模式"><Sparkles :size="10" /></AnimatedAppear>
      <div class="quality-wrap tablet-collapse" ref="qualityWrapRef">
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="1" class-name="icon quality-icon" :class="{ active: showQualityPopup }" data-tooltip="音质选择" aria-label="音质选择" @click.stop="toggleQualityPopup">
          <span class="quality-btn-label">{{ qualityLabel || playerStore.state.defaultQuality }}</span>
        </AnimatedAppear>
        <Teleport to="body">
          <transition name="quality-fade">
            <div v-if="showQualityPopup" class="quality-popup-backdrop" @click.self="showQualityPopup = false" @wheel.passive @touchmove.passive>
              <div class="quality-popup" :style="popupStyle">
                <div class="quality-popup__header">音质切换</div>
              <div class="quality-popup__sub">以账号具体权限为准</div>
                <div class="quality-popup__list">
                  <button
                    v-for="q in qualityOptions"
                    :key="q.label"
                    type="button"
                    class="quality-popup__item"
                    :class="{ active: playerStore.state.defaultQuality === q.label, disabled: !isQualityAvailable(q.level) }"
                    :disabled="!isQualityAvailable(q.level)"
                    @click.stop="selectQuality(q.label)"
                  >
                    <span class="quality-popup__item-label">{{ q.label }}</span>
                    <span v-if="q.vip" class="quality-popup__item-vip">{{ q.vip }}</span>
                    <span class="quality-popup__item-size">{{ qualitySizes[q.label] || '' }}</span>
                    <Check v-if="playerStore.state.defaultQuality === q.label" :size="14" class="quality-popup__check" />
                  </button>
                </div>
              </div>
            </div>
          </transition>
        </Teleport>
      </div>
      <div class="eq-wrap tablet-collapse" ref="eqWrapRef">
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="icon" :class="{ active: showEqPanel }" data-tooltip="均衡器" aria-label="均衡器" @click.stop="showEqPanel = !showEqPanel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>
        </AnimatedAppear>
        <EqPanel :visible="showEqPanel" @close="showEqPanel = false" />
      </div>
      <div class="lyric-wrap tablet-collapse" ref="lyricWrapRef">
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="2" class-name="icon" :class="{ active: isAnyLyricActive }" data-tooltip="歌词" aria-label="歌词" @click.stop="handleLyricClick"><Captions :size="14" /></AnimatedAppear>
        <Teleport to="body">
          <transition name="quality-fade">
            <div v-if="showLyricPopover" class="lyric-popover-backdrop" @click.self="showLyricPopover = false" @wheel.passive @touchmove.passive>
              <div class="lyric-popover" :style="lyricPopoverStyle">
                <div class="lyric-popover__header">歌词显示</div>
                <div class="lyric-popover__list">
                  <button v-if="platform.isDesktop" type="button" class="lyric-popover__item" :class="{ active: desktopControlEnabled }" @click="toggleDesktopControl">
                    <span class="lyric-popover__item-label">状态栏控件</span>
                    <span class="lyric-popover__item-check" :class="{ on: desktopControlEnabled }"><span class="dot"></span></span>
                  </button>
                  <button type="button" class="lyric-popover__item" :class="{ active: desktopLyricEnabled }" @click="toggleDesktopLyric">
                    <span class="lyric-popover__item-label">桌面歌词</span>
                    <span class="lyric-popover__item-check" :class="{ on: desktopLyricEnabled }"><span class="dot"></span></span>
                  </button>
                  <button type="button" class="lyric-popover__item" :class="{ active: lyricsSettings.state.showBarLyric }" @click="toggleBarLyric">
                    <span class="lyric-popover__item-label">底部栏歌词</span>
                    <span class="lyric-popover__item-check" :class="{ on: lyricsSettings.state.showBarLyric }"><span class="dot"></span></span>
                  </button>
                </div>
              </div>
            </div>
          </transition>
        </Teleport>
      </div>
      <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="3" class-name="icon" :class="{ saved: isCurrentLiked, loading: likeLoading }" :aria-pressed="isCurrentLiked" :data-tooltip="isCurrentLiked ? '取消收藏' : '收藏'" :aria-label="isCurrentLiked ? '取消收藏' : '收藏'" :disabled="likeLoading || !canToggleCurrentLike" @click="toggleCurrentLike"><Heart :size="14" /></AnimatedAppear>
      <div class="settings-wrap tablet-collapse" ref="settingsWrapRef">
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="4" class-name="icon" :class="{ active: showSettings }" data-tooltip="设置" aria-label="设置" @click.stop="toggleSettings"><Settings :size="14" /></AnimatedAppear>
        <Teleport to="body">
          <transition name="quality-fade">
            <div v-if="showSettings" class="quality-popup-backdrop" @click.self="showSettings = false" @wheel.passive @touchmove.passive>
              <div class="quality-popup speed-popup" :style="settingsPopupStyle">
                <div class="quality-popup__header">播放速度</div>
                <div class="quality-popup__list">
                  <button
                    v-for="rate in speedOptions"
                    :key="rate"
                    type="button"
                    class="quality-popup__item"
                    :class="{ active: playerStore.state.playbackRate === rate }"
                    @click.stop="selectSpeed(rate)"
                  >
                    <span class="quality-popup__item-label">{{ rate.toFixed(2).replace(/\.?0+$/, '') }}x</span>
                    <Check v-if="playerStore.state.playbackRate === rate" :size="14" class="quality-popup__check" />
                  </button>
                </div>
              </div>
            </div>
          </transition>
        </Teleport>
      </div>
      <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="5" class-name="icon tablet-collapse-btn" :data-tooltip="playModeTooltip" aria-label="切换播放模式" @click="playerStore.cyclePlayMode()">
        <Repeat v-if="playerStore.state.playMode === 'loop'" :size="14" />
        <Repeat1 v-else-if="playerStore.state.playMode === 'single'" :size="14" />
        <Shuffle v-else :size="14" />
      </AnimatedAppear>
      <template v-if="isPersonalFmCurrentTrack">
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="6" class-name="icon icon-fm" data-tooltip="当前为私人 FM" aria-label="当前为私人 FM" disabled>FM</AnimatedAppear>
      </template>
      <template v-else>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="6" class-name="icon" :class="{ active: uiStore.state.showPlayQueue }" data-tooltip="播放列表" aria-label="播放列表" @click="uiStore.togglePlayQueue()"><ListMusic :size="14" /></AnimatedAppear>
      </template>

      <!-- 平板端：更多按钮（触发上拉栏） -->
      <button class="icon tablet-more-btn" type="button" aria-label="更多控制" @click="showMoreSheet = true">
        <MoreHorizontal :size="16" />
      </button>
    </AnimatedAppear>

    <!-- 平板端：上拉栏 -->
    <Teleport to="body">
      <transition name="sheet-fade">
        <div v-if="showMoreSheet" class="sheet-backdrop" @click.self="showMoreSheet = false" @touchstart.passive.self="onSheetTouchStart" @touchmove.passive.self="onSheetTouchMove" @touchend.passive="onSheetTouchEnd">
          <div class="sheet-panel" @click.stop>
            <div class="sheet-handle" />
            <div class="sheet-header">更多控制</div>
            <div class="sheet-list">
              <button class="sheet-item" type="button" @click="toggleQualityPopup(); showMoreSheet = false">
                <Settings :size="16" />
                <span class="sheet-item-label">音质选择</span>
                <span class="sheet-item-value">{{ qualityLabel || playerStore.state.defaultQuality }}</span>
              </button>
              <button class="sheet-item" type="button" @click="showEqPanel = !showEqPanel; showMoreSheet = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>
                <span class="sheet-item-label">均衡器</span>
                <span class="sheet-item-value">{{ showEqPanel ? '已开启' : '' }}</span>
              </button>
              <button class="sheet-item" type="button" @click="handleLyricClick(); showMoreSheet = false">
                <Captions :size="16" />
                <span class="sheet-item-label">歌词显示</span>
                <span class="sheet-item-value">{{ isAnyLyricActive ? '已开启' : '' }}</span>
              </button>
              <button class="sheet-item" type="button" @click="toggleSettings(); showMoreSheet = false">
                <Settings :size="16" />
                <span class="sheet-item-label">播放速度</span>
                <span class="sheet-item-value">{{ playerStore.state.playbackRate === 1 ? '' : playerStore.state.playbackRate + 'x' }}</span>
              </button>
              <button class="sheet-item" type="button" @click="playerStore.cyclePlayMode()">
                <Repeat v-if="playerStore.state.playMode === 'loop'" :size="16" />
                <Repeat1 v-else-if="playerStore.state.playMode === 'single'" :size="16" />
                <Shuffle v-else :size="16" />
                <span class="sheet-item-label">播放模式</span>
                <span class="sheet-item-value">{{ playModeLabel }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted, Teleport } from 'vue';
import {
  Captions,
  Check,
  Heart,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-vue-next';
import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
import { getTrackPlaybackKey, usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { getSongUrlV1, trashPersonalFm } from '../api/music';
import { useCurrentTrackLike } from '../composables/useCurrentTrackLike';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { clearCacheEntry } from '../stores/unblock-cache';
import AnimatedAppear from './AnimatedAppear.vue';
import EqPanel from './EqPanel.vue';
import LocalCoverPlaceholder from './ui/LocalCoverPlaceholder.vue';
import LocalMetadataStatusBadge from './ui/LocalMetadataStatusBadge.vue';
import { useLocalMusicStore } from '../stores/localMusic'
import { useLyrics } from '../composables/useLyrics';
import { useLoginModalStore } from '../stores/loginModal';
const loginModalStore = useLoginModalStore();
const localMusicStore = useLocalMusicStore()
import { useLyricsSelectionStore } from '../stores/lyricsSelection';
import { useBgLoaded } from '../composables/useBgLoaded';
import { formatTime } from '../utils/formatTime';
import { platform } from '../utils/platform';
import { QUALITY_OPTIONS as qualityOptions, isQualityAvailable as isQualityAvailableRaw } from '../config/qualityOptions';

const isRealLogin = computed(() => userStore.state.loginMode === 'cookie' || userStore.state.loginMode === 'qr');

function isQualityAvailable(level: string): boolean {
  return isQualityAvailableRaw(level, isRealLogin.value, userStore.state.isVip);
}

const showQualityPopup = ref(false);
const qualitySizes = ref<Record<string, string>>({});

const isPersonalFmCurrentTrack = computed(() => playerStore.isPersonalFmTrack(playerStore.state.currentTrack));
async function dislikeFmTrack() {
  const track = playerStore.state.currentTrack;
  const id = Number(track?.id || 0);
  if (!id) return;
  try { await trashPersonalFm(id, userStore.state.loginCookie || undefined); } catch { /* ignore */ }
  playerStore.next();
}

const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

const showSettings = ref(false);
const showEqPanel = ref(false);
const showMoreSheet = ref(false);
const settingsWrapRef = ref<HTMLElement | null>(null);
const settingsPopupStyle = ref<Record<string, string>>({});

function toggleSettings() {
  showSettings.value = !showSettings.value;
  if (showSettings.value) {
    nextTick(() => {
      if (!settingsWrapRef.value) return;
      const rect = settingsWrapRef.value.getBoundingClientRect();

      // 按钮被隐藏时（平板端折叠模式），居中显示弹窗
      if (rect.width === 0 && rect.height === 0) {
        settingsPopupStyle.value = {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(320px, calc(100vw - 32px))',
          maxHeight: 'min(380px, 60vh)',
        };
        return;
      }

      const estimatedHeight = Math.min(speedOptions.length * 38 + 16, 380);
      const gap = 8;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const fitsAbove = spaceAbove >= estimatedHeight + gap;
      const fitsBelow = spaceBelow >= estimatedHeight + gap;

      if (fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow)) {
        settingsPopupStyle.value = {
          position: 'fixed',
          top: `${rect.top - gap}px`,
          right: `${window.innerWidth - rect.right}px`,
          transform: 'translateY(-100%)',
        };
      } else {
        settingsPopupStyle.value = {
          position: 'fixed',
          top: `${rect.bottom + gap}px`,
          right: `${window.innerWidth - rect.right}px`,
        };
      }
    });
  }
}

function selectSpeed(rate: number) {
  playerStore.setPlaybackRate(rate);
  showSettings.value = false;
}

async function fetchQualitySizes() {
  const trackId = playerStore.state.currentTrack?.id;
  if (!trackId) return;
  const cookie = userStore.state.loginCookie || undefined;
  const sizes: Record<string, string> = {};
  for (const q of qualityOptions) {
    try {
      const { data: body } = await getSongUrlV1(Number(trackId), q.level, cookie);
      const item = Array.isArray(body?.data) ? body.data[0] : null;
      if (item?.size > 0) {
        const mb = item.size / 1048576;
        sizes[q.label] = mb >= 1 ? mb.toFixed(1) + 'M' : Math.round(item.size / 1024) + 'K';
      }
    } catch {
      // skip if this quality level is unavailable
    }
  }
  qualitySizes.value = sizes;
}

const qualityWrapRef = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({});

function updatePopupPosition() {
  if (!qualityWrapRef.value) return;
  const rect = qualityWrapRef.value.getBoundingClientRect();

  // 按钮被隐藏时（平板端折叠模式），居中显示弹窗
  if (rect.width === 0 && rect.height === 0) {
    popupStyle.value = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(320px, calc(100vw - 32px))',
      maxHeight: 'min(380px, 60vh)',
    };
    return;
  }

  const estimatedHeight = Math.min(qualityOptions.length * 38 + 16, 380);
  const gap = 8;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const fitsAbove = spaceAbove >= estimatedHeight + gap;
  const fitsBelow = spaceBelow >= estimatedHeight + gap;

  if (fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow)) {
    popupStyle.value = {
      position: 'fixed',
      bottom: `${window.innerHeight - rect.top + gap}px`,
      right: `${window.innerWidth - rect.right}px`,
      width: '200px',
      maxHeight: '380px',
    };
  } else {
    popupStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + gap}px`,
      right: `${window.innerWidth - rect.right}px`,
      width: '200px',
      maxHeight: '380px',
    };
  }
}

function toggleQualityPopup() {
  showQualityPopup.value = !showQualityPopup.value;
  if (showQualityPopup.value) {
    updatePopupPosition();
    void fetchQualitySizes();
  }
}

function selectQuality(quality: string) {
  // 免费用户不可选择 VIP 音质
  const qOpt = qualityOptions.find(function (q) { return q.label === quality; });
  if (qOpt && !isQualityAvailable(qOpt.level)) {
    loginModalStore.showGlobalToast(quality + ' 需要 VIP，已自动切换为 极高(HQ)', 'warning');
    playerStore.setDefaultQuality('极高(HQ)');
    showQualityPopup.value = false;
    return;
  }

  const prevQuality = playerStore.state.defaultQuality;
  playerStore.setDefaultQuality(quality);
  showQualityPopup.value = false;
  console.log(
    '[quality-switch] ★ 用户切换音质 ★\n' +
    `  ${prevQuality} → ${quality}  |  歌曲: ${playerStore.state.currentTrack?.name || '(无)'}`
  );
  // 如果正在播放，立即以新音质重新拉取播放地址，并保持当前进度
  if (playerStore.state.currentTrack && playerStore.state.isPlaying) {
    const currentTime = playerStore.state.currentTime;
    const trackId = playerStore.state.currentTrack.id;
    if (trackId) {
      clearCacheEntry(trackId);
      console.log('[quality-switch] 已清除歌曲缓存 (id=' + trackId + ')');
    }
    console.log('[quality-switch] 调用 playTrack 重新拉取 (seekTo=' + Math.floor(currentTime) + 's)...');
    playerStore.playTrack(playerStore.state.currentTrack, currentTime).then((ok) => {
      const di = playerStore.state.qualityDowngradeInfo;
      if (!ok) {
        console.log('[quality-switch] ❌ 切换失败，当前歌曲暂无可用音源');
        loginModalStore.showGlobalToast('当前歌曲暂无可用音源，已保持当前播放', 'warning');
      } else if (di) {
        console.log(`[quality-switch] ⚠️ ${di.from} 不可用，已自动切换为 ${di.to}`);
        loginModalStore.showGlobalToast(di.from + ' 不可用，已自动切换为 ' + di.to, 'warning');
        playerStore.state.qualityDowngradeInfo = null;
      } else {
        const actualQuality = playerStore.state.currentQualityLabel || quality;
        console.log('[quality-switch] ✅ 切换成功，当前音质:', actualQuality);
        loginModalStore.showGlobalToast('已切换为 ' + actualQuality + ' 音质', 'success', 2200);
      }
    });
  } else {
    console.log('[quality-switch] 未在播放中，仅保存设置，下次播放时生效');
    loginModalStore.showGlobalToast('默认音质已设为 ' + quality, 'success', 2200);
  }
}

function onResize() {
  if (showQualityPopup.value) updatePopupPosition();
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onResize, true);
});

const {
  currentTrackId,
  currentPodcastRid,
  isCurrentPodcast,
  canToggleCurrentLike,
  isCurrentLiked,
  likeLoading,
  toggleCurrentLike,
} = useCurrentTrackLike();

// 同步收藏状态到托盘菜单
watch(isCurrentLiked, (liked) => {
  if (platform.isDesktop && window.appEnv?.trayLyric) {
    window.appEnv.trayLyric.notifyLikeStatus(liked);
  }
}, { immediate: true });

// ── 桌面端歌词控制上拉栏 ──
const lyricWrapRef = ref<HTMLElement | null>(null);
const showLyricPopover = ref(false);
const lyricPopoverStyle = ref<Record<string, string>>({});
const desktopControlEnabled = ref(false);
const desktopLyricEnabled = ref(false);
let _lyricCleanupFns: (() => void)[] = [];

const isAnyLyricActive = computed(() =>
  lyricsSettings.state.showBarLyric || desktopControlEnabled.value || desktopLyricEnabled.value
);

function updateLyricPopoverPosition() {
  if (!lyricWrapRef.value) return;
  const rect = lyricWrapRef.value.getBoundingClientRect();
  const gap = 8;

  // 按钮被隐藏时（平板端折叠模式），居中显示弹窗
  if (rect.width === 0 && rect.height === 0) {
    lyricPopoverStyle.value = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(260px, calc(100vw - 32px))',
    };
    return;
  }

  lyricPopoverStyle.value = {
    position: 'fixed',
    bottom: `${window.innerHeight - rect.top + gap}px`,
    right: `${window.innerWidth - rect.right}px`,
    width: '200px',
  };
}

function handleLyricClick() {
  if (platform.isDesktop) {
    showLyricPopover.value = !showLyricPopover.value;
    if (showLyricPopover.value) {
      updateLyricPopoverPosition();
      initLyricStates();
    }
  } else {
    lyricsSettings.state.showBarLyric = !lyricsSettings.state.showBarLyric;
    lyricsSettings.save();
  }
}

async function initLyricStates() {
  if (platform.isDesktop) {
    let merged = false;
    if (window.appEnv?.trayLyric) {
      try {
        const cfg = await window.appEnv.trayLyric.getConfig();
        merged = merged || cfg.enabled;
      } catch { /* ignore */ }
    }
    if (platform.isWindows && window.appEnv?.taskbarWidget) {
      try {
        const cfg = await window.appEnv.taskbarWidget.getConfig();
        merged = merged || cfg.enabled;
      } catch { /* ignore */ }
    }
    desktopControlEnabled.value = merged;
  }
  if (platform.isDesktop && window.appEnv?.desktopLyric) {
    try {
      const cfg = await window.appEnv.desktopLyric.getConfig();
      desktopLyricEnabled.value = cfg.enabled;
    } catch { /* ignore */ }
  }
}

function toggleDesktopControl() {
  if (!platform.isDesktop) return;
  const next = !desktopControlEnabled.value;
  desktopControlEnabled.value = next;
  if (window.appEnv?.trayLyric) {
    window.appEnv.trayLyric.setConfig({ enabled: next });
  }
  if (platform.isWindows && window.appEnv?.taskbarWidget) {
    window.appEnv.taskbarWidget.setEnabled(next);
  }
  showLyricPopover.value = false;
}

function toggleDesktopLyric() {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  const next = !desktopLyricEnabled.value;
  desktopLyricEnabled.value = next;
  window.appEnv.desktopLyric.setConfig({ enabled: next });
  showLyricPopover.value = false;
}

function toggleBarLyric() {
  lyricsSettings.state.showBarLyric = !lyricsSettings.state.showBarLyric;
  lyricsSettings.save();
  showLyricPopover.value = false;
}

onMounted(() => {
  if (platform.isDesktop) {
    initLyricStates();
    if (window.appEnv?.trayLyric) {
      _lyricCleanupFns.push(
        window.appEnv.trayLyric.onConfigChanged((cfg) => {
          desktopControlEnabled.value = cfg.enabled;
        }),
      );
    }
    if (platform.isWindows && window.appEnv?.taskbarWidget) {
      _lyricCleanupFns.push(
        window.appEnv.taskbarWidget.onConfigChanged((cfg) => {
          desktopControlEnabled.value = cfg.enabled;
        }),
      );
    }
    if (window.appEnv?.desktopLyric) {
      _lyricCleanupFns.push(
        window.appEnv.desktopLyric.onConfigChanged((cfg) => {
          desktopLyricEnabled.value = cfg.enabled;
        }),
      );
    }
  }
});

onUnmounted(() => {
  _lyricCleanupFns.forEach((fn) => fn());
  _lyricCleanupFns = [];
});

/* 播放时显示当前歌词行 */
const { lyricLines, currentLyricIndex, effectiveTime, startTick, isLoading, loadLyrics } = useLyrics();

const currentPlaybackKey = computed(() => getTrackPlaybackKey(playerStore.state.currentTrack));

/* 加载歌词 — watch 必须在 loadLyrics 之后声明，避免 TDZ */
watch(currentPlaybackKey, async (key) => {
  if (!key) return;
  await loadLyrics(playerStore.state.currentTrack);
}, { immediate: true });

startTick();

const currentLyricText = computed(() => {
  const idx = currentLyricIndex.value;
  if (idx < 0 || idx >= lyricLines.value.length) return '';
  const line = lyricLines.value[idx];
  if (!line || !line.text) return '';
  if (line.translation) return `${line.text} · ${line.translation}`;
  return line.text;
});

const miniLyricText = computed(() => {
  if (!playerStore.state.currentTrack) return '';
  const idx = currentLyricIndex.value;
  if (idx < 0 || idx >= lyricLines.value.length) return '';
  const line = lyricLines.value[idx];
  const mainText = line?.text?.trim() || '';
  if (!mainText) return '';
  const subText = lyricsSettings.state.showTranslation
    ? line.translation?.trim()
    : lyricsSettings.state.showRomalrc
      ? line.romalrc?.trim()
      : '';
  return subText ? `${mainText} · ${subText}` : mainText;
});

watch(miniLyricText, (text) => {
  playerStore.setMiniLyricText(text);
}, { immediate: true });

// Sync full lyrics to store for taskbar widget
watch(lyricLines, (lines) => {
  playerStore.setFullLyrics(lines.map(l => ({
    time: l.time,
    text: l.text || '',
    words: (l.words || []).map(w => ({ text: w.text || '', startTime: w.startTime, duration: w.duration, space: w.space })),
  })));
}, { immediate: true });

const artistText = computed(() => {
  const ar = playerStore.state.currentTrack?.ar || [];
  if (!ar.length) return 'Unknown Artist';
  return ar.map((a) => a.name).join('/');
});

const sourceLabel = computed(() => {
  const s = playerStore.state.currentSource;
  if (s === 'official' || !s) return '官方';
  return s;
});

const qualityLabel = computed(() => {
  if (playerStore.state.currentQualityLabel) {
    return playerStore.state.currentQualityLabel;
  }
  const br = playerStore.state.currentQualityBr;
  if (br >= 1920000) return 'Hi-Res';
  if (br >= 999000) return '无损(SQ)';
  if (br >= 320000) return '极高(HQ)';
  if (br >= 192000) return '较高';
  if (br >= 128000) return '标准';
  return '';
});

const coverStyle = computed(() => {
  const url = playerStore.state.currentTrack?.al?.picUrl;
  if (!url) return {};
  return { backgroundImage: `url(${url})` };
});
const isLocalCurrentTrackWithoutCover = computed(() => playerStore.state.currentTrack?.source === 'local' && !playerStore.state.currentTrack?.al?.picUrl);
const isLocalCurrentTrack = computed(() => playerStore.state.currentTrack?.source === 'local');
const localMetadataStatus = computed(() => {
  if (!isLocalCurrentTrack.value || !playerStore.state.currentTrack) return null
  return localMusicStore.metadataStatusOf(playerStore.state.currentTrack)
})
const coverLoaded = useBgLoaded(() => playerStore.state.currentTrack?.al?.picUrl || '');

const playModeTooltip = computed(() => {
  if (playerStore.state.playMode === 'loop') return '列表循环';

const playModeLabel = computed(() => {
  const mode = playerStore.state.playMode;
  if (mode === 'single') return '单曲循环';
  if (mode === 'random') return '随机播放';
  return '列表循环';
});

/* ── 上拉栏滑动手势关闭 ── */
let _sheetTouchStartY = 0;
function onSheetTouchStart(e: TouchEvent) {
  _sheetTouchStartY = e.touches[0]?.clientY ?? 0;
}
function onSheetTouchMove(_e: TouchEvent) { /* passive */ }
function onSheetTouchEnd(e: TouchEvent) {
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - _sheetTouchStartY > 60) {
    showMoreSheet.value = false;
  }
}
  if (playerStore.state.playMode === 'single') return '单曲循环';
  return '随机播放';
});

// ── 系统托盘歌词：发送歌词和播放状态到主进程 ──

// ── 状态栏歌词：升级数据契约（完整歌词数组 + 精确进度） ──
import { throttle } from '../utils/throttle';

let trayLastTrackKey = '';
let trayLastSentLines = '';

// 切歌时立即通知主进程清空旧歌词状态，即使新歌词尚未加载
watch(currentPlaybackKey, (key, oldKey) => {
  if (!platform.isDesktop || !window.appEnv?.trayLyric) return;
  const track = playerStore.state.currentTrack;
  if (!track || !key || key === oldKey) return;
  trayLastTrackKey = key;
  trayLastSentLines = '';
  const artist = track.ar?.map((a: { name: string }) => a.name).join('/') || '';
  window.appEnv.trayLyric.syncState({
    type: 'track-change',
    data: { title: track.name || '', artist, cover: '' },
  });
});

// 歌词加载后推送完整数组（必须在 track-change 之后发送，避免被清空）
watch(() => lyricLines.value, (lines) => {
  if (!platform.isDesktop || !window.appEnv?.trayLyric) return;
  const track = playerStore.state.currentTrack;
  if (!track || !lines.length) return;
  if (getTrackPlaybackKey(track) !== trayLastTrackKey) return; // wait for track-change to fire first
  const linesJson = JSON.stringify(lines.map(l => ({ time: l.time, text: l.text })));
  if (linesJson === trayLastSentLines) return;
  trayLastSentLines = linesJson;
  window.appEnv.trayLyric.syncState({
    type: 'lyrics-loaded',
    data: { lines: lines.map(l => ({ time: l.time, text: l.text })), type: 'line' },
  });
});

// 高频推送精确进度（~200ms throttle）
const sendTrayTick = throttle(() => {
  if (!platform.isDesktop || !window.appEnv?.trayLyric) return;
  if (!playerStore.state.isPlaying) return;
  const currentTimeMs = Math.round(playerStore.state.currentTime * 1000);
  const durationMs = Math.round(playerStore.state.duration * 1000);
  const offset = 0;
  window.appEnv.trayLyric.syncTick([currentTimeMs, durationMs, offset]);
}, 200);

watch(() => playerStore.state.currentTime, () => {
  sendTrayTick();
});

// 播放状态变化时通知
watch(() => playerStore.state.isPlaying, (playing) => {
  if (!platform.isDesktop || !window.appEnv?.trayLyric) return;
  window.appEnv.trayLyric.syncState({
    type: 'playback-state',
    data: { isPlaying: !!playing },
  });
});

// ── 桌面歌词：发送完整 LRC 时间轴 + 播放进度 ──
let desktopLastTrackKey = '';
watch([() => lyricLines.value, currentPlaybackKey, () => playerStore.state.isPlaying, () => playerStore.state.currentTime], () => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  const track = playerStore.state.currentTrack;
  if (!track) {
    window.appEnv.desktopLyric.updateData({
      lrcArray: [], currentTime: 0, trackName: '', artist: '', isPlaying: false,
      showTranslation: lyricsSettings.state.showTranslation, showRomalrc: lyricsSettings.state.showRomalrc,
    });
    return;
  }
  const lines = lyricLines.value;
  const key = getTrackPlaybackKey(track);
  if (!lines.length && key === desktopLastTrackKey) return;
  desktopLastTrackKey = key;
  const lrcArray = lines.length ? lines.map((l) => ({ t: l.time, text: l.text, translation: l.translation, romalrc: l.romalrc })) : [];
  window.appEnv.desktopLyric.updateData({
    lrcArray,
    currentTime: playerStore.state.currentTime,
    trackName: track.name || '',
    artist: track.ar?.map((a: { name: string }) => a.name).join('/') || '',
    isPlaying: playerStore.state.isPlaying,
    showTranslation: lyricsSettings.state.showTranslation,
    showRomalrc: lyricsSettings.state.showRomalrc,
  });
});

// ── 桌面歌词：独立监听歌词加载完成，确保数据必达 ──
watch(() => lyricLines.value, (lines) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  if (!lines.length) return;
  const track = playerStore.state.currentTrack;
  if (!track) {
    window.appEnv.desktopLyric.updateData({
      lrcArray: [], currentTime: 0, trackName: '', artist: '', isPlaying: false,
      showTranslation: lyricsSettings.state.showTranslation, showRomalrc: lyricsSettings.state.showRomalrc,
    });
    return;
  }
  const lrcArray = lines.map((l) => ({ t: l.time, text: l.text, translation: l.translation, romalrc: l.romalrc }));
  window.appEnv.desktopLyric.updateData({
    lrcArray,
    currentTime: playerStore.state.currentTime,
    trackName: track.name || '',
    artist: track.ar?.map((a: { name: string }) => a.name).join('/') || '',
    isPlaying: playerStore.state.isPlaying,
    showTranslation: lyricsSettings.state.showTranslation,
    showRomalrc: lyricsSettings.state.showRomalrc,
  });
});

// ── 系统托盘动作：处理来自 tray 菜单/弹窗的播放控制 ──
function handleTrayAction(e: CustomEvent) {
  const action = e.detail;
  if (action === 'togglePlay') playerStore.togglePlay();
  else if (action === 'next') playerStore.next();
  else if (action === 'prev') playerStore.prev();
  else if (action === 'toggleDesktopLyric') {
    if (platform.isDesktop && window.appEnv?.desktopLyric) {
      window.appEnv.desktopLyric.getConfig().then((cfg) => {
        const newEnabled = !cfg.enabled;
        window.appEnv.desktopLyric.setConfig({ enabled: newEnabled });
        // Notify main process so tray menu checkbox updates
        if (window.appEnv?.trayLyric) {
          // The main process already listens for desktop-lyric:set-config changes
        }
      }).catch(() => {});
    }
  }
  else if (action === 'cycleMode') playerStore.setPlayMode('loop');
  else if (action === 'singleMode') playerStore.setPlayMode('single');
  else if (action === 'shuffleMode') playerStore.setPlayMode('shuffle');
  else if (action === 'toggleLike') toggleCurrentLike();
  else if (action === 'openSettings') {
    window.dispatchEvent(new CustomEvent('open-tray-settings'));
  }
}
onMounted(() => {
  document.addEventListener('tray-action', handleTrayAction as EventListener);
});
onUnmounted(() => {
  document.removeEventListener('tray-action', handleTrayAction as EventListener);
});

function onVolume(e: Event) {
  const value = Number((e.target as HTMLInputElement).value) / 100;
  playerStore.setVolume(value);
}

function onSeek(e: Event) {
  const t = Number((e.target as HTMLInputElement).value);
  playerStore.seek(t);
}


</script>

<style scoped>
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 84px;
  background: var(--bg-solid) !important;
  background-image: none !important;
  opacity: 1 !important;
  filter: none !important;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  animation: none !important;
.ctrl-dislike { color: var(--text-main) !important; }
.ctrl-dislike:hover { color: var(--text-main) !important; opacity: 0.7; }
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  padding: 0 var(--space-5);
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom, 0px));
  z-index: 20;
  min-width: 0;
}
.left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; overflow: hidden; }
.cover-wrap { position: relative; flex-shrink: 0; display: inline-flex; border-radius: 12px; overflow: hidden; }
.cover-wrap:hover .cover-fullscreen-btn { opacity: 1; pointer-events: auto; }
.cover {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #e5e7eb center/cover no-repeat;
  cursor: pointer;
  position: relative;
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
}
.cover:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 36%, var(--border)); }
.cover--placeholder {
  background: transparent;
}
.cover-placeholder {
  position: absolute;
  inset: 0;
}
.cover-logo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.cover.bg-loaded .cover-logo { display: none; }
.cover-fullscreen-btn {
  position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 12px;
  border: none; background: rgba(0,0,0,0.45); color: #fff; cursor: pointer;
  display: grid; place-items: center; opacity: 0; pointer-events: none;
  transition: opacity 0.18s ease;
}
.meta { min-width: 0; max-width: 100%; overflow: hidden; flex: 1; }
.title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title { color: #111827; font-weight: 600; font-size: var(--text-label-md); margin: 0; line-height: normal; }
.artist { color: #6b7280; font-size: var(--text-label-sm); display: flex; align-items: center; gap: 4px; overflow: hidden; height: 18px; line-height: 18px; max-width: 100%; }
.lyric-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b7280; font-size: var(--text-label-sm); height: 18px; line-height: 18px; max-width: 100%; }
.source-badge { display: inline-flex; align-items: center; flex-shrink: 0; height: 16px; padding: 0 5px; border-radius: 3px; background: color-mix(in srgb, #6366f1 18%, transparent); color: #6366f1; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; margin-left: 4px; }
.center { display: grid; justify-items: center; gap: var(--space-1); min-width: 0; }
.controls-row { height: 42px; display: flex; align-items: center; gap: var(--space-2); }
.progress-row { width: min(420px, 100%); display: grid; grid-template-columns: 44px 1fr 44px; gap: var(--space-2); align-items: center; }
.progress { width: 100%; }
.time { color: var(--text-sub); font-size: var(--text-label-xs); text-align: center; }
.ctrl { width: 36px; height: 36px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--border) 78%, transparent); background: color-mix(in srgb, var(--bg-surface) 92%, #fff 8%); color: var(--text-main); cursor: pointer; display: grid; place-items: center; line-height: 1; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.35); transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease; }
.ctrl:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4); }
.ctrl:active { transform: translateY(0); box-shadow: 0 3px 8px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.28); }
.ctrl.main { width: 42px; height: 42px; border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); background: color-mix(in srgb, var(--accent) 22%, var(--bg-surface)); color: var(--text-main); box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 20%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.35); }
.ctrl:focus-visible, .icon:focus-visible, .cover:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.right { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-2); min-width: 0; }
.vol { display: flex; align-items: center; gap: var(--space-1); color: var(--text-sub); }
.vol input { width: 88px; }
.vol-icon-btn { width: 24px; height: 24px; border: none; background: transparent; color: inherit; cursor: pointer; display: inline-grid; place-items: center; border-radius: 5px; transition: color 0.16s ease, background 0.16s ease; flex-shrink: 0; }
.vol-icon-btn:hover { color: var(--text-main); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.vol-icon-btn:active { color: var(--text-soft); }
.quality-wrap { position: relative; flex-shrink: 0; }
.icon.quality-icon { width: auto; min-width: 32px; padding: 0 8px; }
.quality-btn-label { font-size: 10px; font-weight: 700; line-height: 1; white-space: nowrap; }
.settings-wrap { position: relative; flex-shrink: 0; }
.icon { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; display: grid; place-items: center; transition: transform 0.16s ease, border-color 0.16s ease, color 0.16s ease, background 0.16s ease; }
.icon:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); color: var(--accent); }
.icon.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-surface)); }
.icon.saved { border-color: color-mix(in srgb, var(--accent) 48%, var(--border)); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-surface)); }
.icon.loading { opacity: 0.72; cursor: progress; }
.icon.icon-fm { font-size: 10px; font-weight: 800; letter-spacing: 0.04em; cursor: default; opacity: 0.55; }
.icon.icon-fm:hover { transform: none; border-color: var(--border); color: inherit; opacity: 0.55; }
.icon.icon-fm::after { left: auto; right: 0; transform: translateY(4px); }
.icon.icon-fm:hover::after { transform: translateY(0); }
.icon.icon-fm::before { left: auto; right: 10px; transform: translateY(4px); }
.icon.icon-fm:hover::before { transform: translateY(0); }

.quality-popup-backdrop { position: fixed; inset: 0; z-index: 9999; }
.quality-popup { position: fixed; background: var(--bg-solid); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18); overflow: hidden; display: flex; flex-direction: column; z-index: 10000; }
.quality-popup__header { padding: 12px 16px 4px; font-size: var(--text-label-xs); font-weight: 700; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.06em; }
.quality-popup__sub { padding: 0 16px 8px; font-size: var(--text-label-xs); color: var(--text-soft); }
.quality-popup__list { overflow-y: auto; max-height: 340px; padding: 0 6px 6px; display: grid; gap: 2px; }
.quality-popup__item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 12px; border: none; border-radius: 10px; background: transparent; color: var(--text-main); font-size: 13px; cursor: pointer; transition: background 0.12s ease; text-align: left; }
.quality-popup__item-size { margin-left: auto; font-size: 10px; color: var(--text-soft); white-space: nowrap; letter-spacing: 0.03em; }
.quality-popup__item-vip { display: inline-flex; align-items: center; flex-shrink: 0; height: 16px; padding: 0 5px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.quality-popup__item:hover { background: color-mix(in srgb, var(--accent) 6%, var(--bg-solid)); }
.quality-popup__item.active { background: color-mix(in srgb, var(--accent) 12%, var(--bg-solid)); color: var(--accent); font-weight: 600; }
.quality-popup__item.disabled { opacity: 0.35; cursor: not-allowed; }
.quality-popup__check { color: var(--accent); flex-shrink: 0; }

.quality-fade-enter-active, .quality-fade-leave-active { transition: opacity 0.18s ease; }
.quality-fade-enter-from, .quality-fade-leave-to { opacity: 0; }
.quality-fade-enter-active .quality-popup { transition: transform 0.18s ease, opacity 0.18s ease; }
.quality-fade-enter-from .quality-popup { transform: translateY(8px); opacity: 0; }
.quality-fade-leave-active .quality-popup { transition: transform 0.18s ease, opacity 0.18s ease; }
.quality-fade-leave-to .quality-popup { transform: translateY(8px); opacity: 0; }

.intel-icon svg {
  animation: an-spin 5s linear infinite;
  color: var(--accent);
}

/* ── 歌词控制上拉栏 ── */
.lyric-popover-backdrop { position: fixed; inset: 0; z-index: 9999; }
.lyric-popover { position: fixed; background: var(--bg-solid); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18); overflow: hidden; display: flex; flex-direction: column; z-index: 10000; }
.lyric-popover__header { padding: 12px 16px 4px; font-size: var(--text-label-xs); font-weight: 700; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.06em; }
.lyric-popover__list { padding: 0 6px 6px; display: grid; gap: 2px; }
.lyric-popover__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 10px 12px; border: none; border-radius: 10px; background: transparent; color: var(--text-main); font-size: 13px; cursor: pointer; transition: background 0.12s ease; text-align: left; }
.lyric-popover__item:hover { background: color-mix(in srgb, var(--accent) 6%, var(--bg-solid)); }
.lyric-popover__item.active { color: var(--accent); font-weight: 600; background: color-mix(in srgb, var(--accent) 10%, var(--bg-solid)); }
.lyric-popover__item-label { line-height: 1.3; }
.lyric-popover__item-check { width: 18px; height: 18px; border-radius: 999px; border: 2px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: border-color 0.18s ease, background 0.18s ease; }
.lyric-popover__item-check.on { border-color: var(--accent); background: var(--accent); }
.lyric-popover__item-check .dot { width: 6px; height: 6px; border-radius: 999px; background: transparent; transition: background 0.18s ease; }
.lyric-popover__item-check.on .dot { background: #fff; }


/* ── 平板端播放栏适配 ── */
@media (max-width: 1023px) and (min-width: 768px) {
  .bar {
    padding: 0 var(--space-3);
    gap: var(--space-3);
    height: 76px;
  }
  .cover { width: 48px; height: 48px; border-radius: 10px; }
  .meta { max-width: 160px; }
  .title { font-size: 13px; }
  .artist { font-size: 11px; }
}

/* ── 触摸设备：进度条增大触摸区域 ── */
@media (pointer: coarse) {
  .progress {
    height: 44px;
    margin: -18px 0;
    position: relative;
    z-index: 1;
  }
}

/* ── 平板端：折叠按钮组 + 更多按钮 ── */
.tablet-more-btn { display: none; }

@media (max-width: 1023px) and (min-width: 768px) {
  .tablet-collapse,
  .tablet-collapse-btn {
    display: none !important;
  }
  .tablet-more-btn {
    display: grid;
  }
}

/* ── 上拉栏样式 ── */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet-panel {
  width: 100%;
  max-width: 480px;
  max-height: 60vh;
  background: var(--bg-solid);
  border-radius: 18px 18px 0 0;
  padding: var(--space-2) var(--space-4) var(--space-6);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.sheet-panel::-webkit-scrollbar { display: none; }

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--text-soft) 40%, transparent);
  margin: var(--space-2) auto var(--space-3);
}

.sheet-header {
  font-size: var(--text-label-sm);
  font-weight: var(--text-label-sm-weight);
  color: var(--text-sub);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 var(--space-1) var(--space-2);
}

.sheet-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sheet-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 52px;
  padding: var(--space-3);
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--text-main);
  font-size: var(--text-body-md);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease;
}
.sheet-item:hover,
.sheet-item:active {
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-solid));
}
.sheet-item svg {
  flex-shrink: 0;
  color: var(--text-sub);
}
.sheet-item-label {
  flex: 1;
  min-width: 0;
}
.sheet-item-value {
  font-size: var(--text-label-md);
  color: var(--text-sub);
  flex-shrink: 0;
}

/* ── 上拉栏动画 ── */
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.24s ease;
}
.sheet-fade-enter-active .sheet-panel,
.sheet-fade-leave-active .sheet-panel {
  transition: transform 0.28s cubic-bezier(0.34, 1, 0.64, 1);
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
.sheet-fade-enter-from .sheet-panel {
  transform: translateY(100%);
}
.sheet-fade-leave-to .sheet-panel {
  transform: translateY(100%);
}

</style>
