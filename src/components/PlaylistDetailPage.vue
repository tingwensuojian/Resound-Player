<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="playlist-detail-page" :class="[detailPageClassName, embedded && 'playlist-detail-page--embedded']">
    <div v-if="!isUserDetail" class="playlist-detail-back">
      <button class="back-btn" @click="emit('back')">← {{ props.backLabel }}</button>
    </div>

    <DetailStickyHeroHeader
      :embedded="embedded"
      :loading="detailLoading"
      :ready="!!playlist"
      :error="error"
      loading-text="歌单加载中…"
    >
      <template #media>
        <HeroCoverMedia :src="playlist.coverImgUrl" :alt="playlist.name" />
      </template>
      <template #title>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">{{ playlist.name }}</AnimatedAppear>
      </template>
      <template #meta>
        <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="sub-row">
          <AnimatedAppear
            v-if="playlist.creator?.avatarUrl"
            tag="img"
            variant="media"
            rhythm="body"
            class-name="creator-avatar"
            :src="playlist.creator.avatarUrl"
            :alt="playlist.creator?.nickname || '用户头像'"
          />
          <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="sub">
            {{ playlist.creator?.nickname || '未知用户' }}
            <span class="sub-dot">·</span>
            歌曲总数：{{ playlist.trackCount || tracks.length }}
          </AnimatedAppear>
        </AnimatedAppear>
        <AnimatedAppear
          v-if="playlistDescription"
          tag="div"
          variant="content"
          rhythm="body"
          class-name="desc-wrap"
        >
          <AnimatedAppear
            tag="p"
            variant="text"
            rhythm="body"
            class-name="desc"
            :class="{ 'desc--collapsed': !isDescriptionExpanded && shouldShowDescriptionToggle }"
          >
            {{ playlistDescription }}
          </AnimatedAppear>
          <button
            v-if="shouldShowDescriptionToggle"
            type="button"
            class="desc-toggle"
            @click="isDescriptionExpanded = !isDescriptionExpanded"
          >
            {{ isDescriptionExpanded ? '收起' : '展开' }}
          </button>
        </AnimatedAppear>
      </template>
      <template #actions>
        <DropdownSelect
          v-if="showDailyHistoryDropdown"
          class="history-dropdown"
          :model-value="historySelectedLabel"
          :options="historySelectOptions"
          :placeholder="historyButtonLabel"
          :option-colors="{}"
          @update:modelValue="onHistorySelect"
        />
        <EntitySubscribeButton
          v-if="playlist?.id"
          type="playlist"
          text
          :subscribed="subscribeState.isSubscribed.value"
          :loading="subscribeState.isLoading.value"
          @toggle="subscribeState.toggle"
        />
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="add-to-queue" @click="addAllToQueue">添加到播放列表</AnimatedAppear>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="play-all" @click="playAll">播放全部</AnimatedAppear>
        <AnimatedAppear v-if="infiniteState.loading" tag="span" variant="text" rhythm="actions" class-name="track-loading-tip">歌曲列表加载中 {{ infiniteState.loaded }}/{{ infiniteState.total }}…</AnimatedAppear>
        <AnimatedAppear v-else-if="infiniteState.hasMore" tag="span" variant="text" rhythm="actions" class-name="track-loading-tip">共 {{ infiniteState.total }} 首，滑动加载更多</AnimatedAppear>
      </template>
      <template #tabs>
        <DetailTabBar
          v-model="activeTab"
          :tabs="tabs"
          aria-label="歌单详情标签"
          v-model:search-query="searchQuery"
          :show-search="activeTab === 'songs'"
        />
      </template>
    </DetailStickyHeroHeader>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="playlist-detail-body">
      <AnimatedAppear v-if="detailLoading && !playlist" tag="div" variant="text" rhythm="body" class-name="state">歌单加载中…</AnimatedAppear>
      <AnimatedAppear v-else-if="error" tag="div" variant="text" rhythm="body" class-name="state error">{{ error }}</AnimatedAppear>
      <AnimatedAppear v-else-if="playlist" tag="div" variant="content" rhythm="body" class-name="playlist-detail-body">
        <template v-if="activeTab === 'songs'">
          <div ref="songListRef" class="song-list song-list--virtual">
            <div :style="{ height: `${totalListHeight}px`, position: 'relative' }">
              <div
                v-for="vi in visibleTracks"
                :key="vi.track?.id || vi.index"
                class="song-item"
                :class="{ 'song-item--playing': isCurrentTrack(vi.track) }"
                :style="{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${vi.index * ROW_HEIGHT}px)`,
                }"
                @dblclick="onSongItemDblClick($event, vi.index)"
              >
                <PlayPauseButton :song-id="Number(vi.track?.id || 0)" :index-label="vi.index + 1" @play="playOne(vi.index)" />
                <img v-if="vi.track?.al?.picUrl" :src="vi.track.al.picUrl" class="song-cover" alt="" loading="lazy" />
                <span v-else-if="playlist?.coverImgUrl" class="song-cover-placeholder" />
                <div class="song-meta">
                  <p class="song-name">{{ vi.track?.name || '' }}</p>
                  <p class="song-artist">
                    <button
                      v-for="artist in getSongArtists(vi.track)"
                      :key="`${vi.track?.id}-${artist.id || artist.name}`"
                      type="button"
                      class="artist-link"
                      @click="openArtistDetail(artist)"
                    >
                      {{ artist.name || '未知歌手' }}
                    </button>
                    <span v-if="!getSongArtists(vi.track).length">未知歌手</span>
                  </p>
                </div>
                <SongActions
                  :song="vi.track"
                  @play-next="playNext"
                  @add-to-playlist="showAddToPlaylist"
                  @open-comment="openComment"
                  @open-album="openAlbum"
                  @open-artist="openArtistDetail"
                  @open-language="openLanguageDetail"
                  @open-mv-player="(mv) => emit('open-mv-player', mv)"
                />
              </div>
            </div>
            <div
              v-if="infiniteState.hasMore"
              ref="sentinelRef"
              class="infinite-sentinel"
            >
              <span v-if="infiniteState.loading" class="infinite-loading">加载中…</span>
              <span v-else class="infinite-tip">向下滑动加载更多</span>
            </div>
          </div>
        </template>
        <template v-else-if="activeTab === 'comments'">
          <div :key="`${tabContentKey}:comments`" class="playlist-comment-section">
          <CommentPanel
            :resource-id="Number(playlist.id || props.playlistId || 0)"
            :resource-type="2"
            :fetcher="commentApi.getPlaylistComments"
            :sender="(params) => commentApi.sendComment({ ...params, type: 2 })"
            :liker="(params) => commentApi.likeComment({ ...params, type: 2 })"
            :deleter="commentApi.deletePlaylistComment"
            @open-user="(uid) => emit('open-user', uid)"
          />
          </div>
        </template>
      </AnimatedAppear>
    </AnimatedAppear>
    <!-- 收藏至歌单选择器 -->
    <PlaylistPickerModal
      :visible="showPlaylistPicker"
      :playlists="playlistPickerList"
      :selected-id="selectedPlaylistId"
      @update:visible="showPlaylistPicker = $event"
      @select="selectedPlaylistId = $event"
      @confirm="confirmAddToPlaylist()"
    />
  </AnimatedAppear>
</template>

<script setup lang="ts">
import HeroCoverMedia from './HeroCoverMedia.vue';
import DetailStickyHeroHeader from './DetailStickyHeroHeader.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useDetailStickyState } from '../composables/useDetailStickyState';
import { getHistoryRecommendSongDates, getHistoryRecommendSongDetail, getPlaylistDetail, getPlaylistTrackAll, getSongDetailBatch, getRecommendSongs, getUserPlaylist, addTrackToPlaylist } from '../api/music';
import { playerStore } from '../stores/player';
import { userStore } from '../stores/user';
import { apiCache, CACHE_TTL } from '../stores/apiCache';
import { recordLocalHistoryEntry } from '../utils/localHistory';
import { useAuthAction } from '../composables/useAuthAction';
import AnimatedAppear from './AnimatedAppear.vue';
import PlayPauseButton from './ui/PlayPauseButton.vue';
import DropdownSelect from './ui/DropdownSelect.vue';
import SongActions from './ui/SongActions.vue';
import EntitySubscribeButton from './ui/EntitySubscribeButton.vue';
import CommentPanel from './CommentPanel.vue';
import DetailTabBar from './ui/DetailTabBar.vue';
import PlaylistPickerModal from './common/PlaylistPickerModal.vue';
import { useEntitySubscribe } from '../composables/useEntitySubscribe';
import { useSongRowConfig } from '../composables/useSongRowConfig';
import { getSongArtists } from '../utils/trackHelpers';
import * as commentApi from '../api/music';

const DESC_COLLAPSE_THRESHOLD = 60;

const props = withDefaults(
  defineProps<{
    playlistId: number;
    backLabel?: string;
    embedded?: boolean;
    injectedPlaylist?: {
      name?: string;
      coverImgUrl?: string;
      description?: string;
      creator?: { nickname?: string; avatarUrl?: string };
      trackCount?: number;
      tracks?: any[];
    } | null;
  }>(),
  {
    backLabel: '返回歌单分类',
    embedded: false,
    injectedPlaylist: null,
  },
);

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-artist', artist: any): void;
  (e: 'open-comment', songId: number): void;
  (e: 'open-album', albumId: number): void;
  (e: 'open-language', language: string): void;
  (e: 'open-mv-player', mv: any): void;
  (e: 'open-user', userId: number): void;
}>();

const detailLoading = ref(false);
const infiniteState = ref({ loading: false, hasMore: false, loaded: 0, total: 0 });
const sentinelRef = ref<HTMLElement | null>(null);
let scrollObserver: IntersectionObserver | null = null;
const error = ref('');
const playlist = ref<any>(null);
const isDescriptionExpanded = ref(false);
const historyDates = ref<Array<{ value: string; label: string }>>([]);
const selectedHistoryDate = ref('');
const historyLoading = ref(false);

const activeTab = ref<'songs' | 'comments'>('songs');
const tabs = [
  { key: 'songs', label: '歌曲' },
  { key: 'comments', label: '评论' },
] as const;
const searchQuery = ref('');

const playlistIdRef = computed(() => playlist.value?.id || undefined);
const tabContentKey = computed(() => `${playlist.value?.id || props.playlistId || 'pending'}:${activeTab.value}`);
const subscribeState = useEntitySubscribe({
  type: 'playlist',
  id: playlistIdRef,
  initialSubscribed: computed(() => playlist.value?.subscribed ?? false),
});

const tracks = computed<any[]>(() => playlist.value?.tracks || []);

const filteredTracks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tracks.value;
  return tracks.value.filter(song => {
    const name = (song.name || '').toLowerCase();
    const artists = getSongArtists(song).map(a => (a.name || '').toLowerCase());
    return name.includes(q) || artists.some(a => a.includes(q));
  });
});

const playlistDescription = computed(() => playlist.value?.description?.trim() || '');
const shouldShowDescriptionToggle = computed(() => playlistDescription.value.length > DESC_COLLAPSE_THRESHOLD);
const injectedPlaylist = computed(() => props.injectedPlaylist || null);
const isInjectedDailyRecommend = computed(() => injectedPlaylist.value?.name === '每日推荐');
const isUserDetail = computed(() => props.backLabel === '返回用户中心');
const historyButtonLabel = computed(() => (historyLoading.value ? '历史日推加载中…' : '历史日推'));
const historySelectOptions = computed(() => ['返回今日推荐', ...historyDates.value.map((item) => item.label)]);
const historySelectedLabel = computed(() => {
  if (!selectedHistoryDate.value) return historyButtonLabel.value;
  return historyDates.value.find((item) => item.value === selectedHistoryDate.value)?.label || historyButtonLabel.value;
});
const showDailyHistoryDropdown = computed(() => isInjectedDailyRecommend.value && userStore.isLogin && historyDates.value.length > 0);
const detailPageClassName = computed(() => {  
  const classNames: string[] = [];
  if (props.backLabel === '返回排行榜') classNames.push('rank-detail-panel');
  if (isUserDetail.value) classNames.push('user-detail-panel');
  if (props.embedded) classNames.push('playlist-detail-page--embedded');
  return classNames.join(' ');
});

/* ---- 虚拟滚动 ---- */
const songListRef = ref<HTMLElement | null>(null);
const ROW_HEIGHT = 68;
const OVERSCAN = 15;
const songListScrollTop = ref(0);
const songListHeight = ref(600);

const visibleRange = computed(() => {
  const total = filteredTracks.value.length;
  if (!total) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(songListScrollTop.value / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(total, Math.ceil((songListScrollTop.value + songListHeight.value) / ROW_HEIGHT) + OVERSCAN);
  return { start, end };
});

const visibleTracks = computed(() => {
  const r = visibleRange.value;
  const items: { track: any; index: number }[] = [];
  for (let i = r.start; i < r.end; i++) {
    const track = filteredTracks.value[i];
    if (track) items.push({ track, index: i });
  }
  return items;
});

const totalListHeight = computed(() => filteredTracks.value.length * ROW_HEIGHT);

/* 缓存滚动宿主引用，避免每帧 document.querySelector */
let cachedPageEl: HTMLElement | null = null;

function onSongListScroll(): void {
  const list = songListRef.value;
  if (cachedPageEl && list) {
    songListScrollTop.value = Math.max(0, cachedPageEl.scrollTop - list.offsetTop);
  }
}

let songListResizeObserver: ResizeObserver | null = null;
let pageScrollListener: (() => void) | null = null;

onMounted(() => {
  if (songListRef.value) {
    songListHeight.value = songListRef.value.clientHeight;
    songListResizeObserver = new ResizeObserver(() => {
      if (songListRef.value) {
        songListHeight.value = songListRef.value.clientHeight;
      }
    });
    songListResizeObserver.observe(songListRef.value);
  }
  // 根据模式选择正确的滚动容器：独立模式 .playlist-detail-page / 嵌入模式 .detail-panel
  const scrollHostSelector = props.embedded ? '.detail-panel' : '.playlist-detail-page';
  const page = document.querySelector(scrollHostSelector);
  if (page) {
    cachedPageEl = page as HTMLElement;
    pageScrollListener = () => onSongListScroll();
    page.addEventListener('scroll', pageScrollListener, { passive: true });
  }
});

// 合并的清理逻辑（替代之前分散的两个 onBeforeUnmount）
onBeforeUnmount(() => {
  songListResizeObserver?.disconnect();
  if (pageScrollListener) {
    if (cachedPageEl) {
      cachedPageEl.removeEventListener('scroll', pageScrollListener);
    }
    pageScrollListener = null;
  }
  scrollObserver?.disconnect();
  scrollObserver = null;
});

function resolvePlaylistCover(playlistLike: any) {
  const firstTrack = Array.isArray(playlistLike?.tracks) ? playlistLike.tracks[0] : null;
  const firstTrackCover = firstTrack?.al?.picUrl || firstTrack?.album?.picUrl || '';

  if (playlistLike?.name === '私人雷达') {
    return firstTrackCover || '';
  }

  return playlistLike?.coverImgUrl || playlistLike?.coverUrl || firstTrackCover || '';
}

const { refresh } = useDetailStickyState(
  computed(() => playlist.value?.coverImgUrl?.trim() || ''),
  !!props.embedded,
);

let fetchToken = 0;
let currentToken = 0;

async function fetchDetail(id: number) {
  if (injectedPlaylist.value) {
    playlist.value = {
      name: injectedPlaylist.value.name || '每日推荐',
      coverImgUrl: injectedPlaylist.value.coverImgUrl || '',
      description: injectedPlaylist.value.description || '根据你的音乐口味生成，每天更新',
      creator: injectedPlaylist.value.creator || { nickname: '每日推荐' },
      trackCount: injectedPlaylist.value.trackCount || injectedPlaylist.value.tracks?.length || 0,
      tracks: Array.isArray(injectedPlaylist.value.tracks) ? injectedPlaylist.value.tracks : [],
    };
    detailLoading.value = false;
    error.value = '';
    return;
  }

  if (!id) return;

  currentToken = ++fetchToken;
  detailLoading.value = true;
  error.value = '';

  // 检查缓存：命中时先展示缓存数据，后台继续刷新
  const cached = apiCache.get(`playlist:${id}`);
  if (cached?.data?.playlist) {
    const detail = cached.data.playlist;
    playlist.value = {
      ...detail,
      coverImgUrl: resolvePlaylistCover(detail),
      tracks: Array.isArray(detail.tracks) ? detail.tracks : [],
    };
    detailLoading.value = false;
  }

  try {
    const { data } = await getPlaylistDetail(id, 1000, userStore.loginCookie || undefined);
    if (currentToken !== fetchToken) return;

    const detail = data?.playlist || null;
    if (!detail) {
      playlist.value = null;
      return;
    }

    const rawTracks = Array.isArray(detail.tracks) ? detail.tracks : [];
    const trackIds = Array.isArray(detail.trackIds) ? detail.trackIds.map((x: any) => Number(x?.id)).filter(Boolean) : [];
    const trackCount = detail.trackCount || 0;

    // 先把已有数据渲染出来，避免用户长时间看到空白
    playlist.value = {
      ...detail,
      coverImgUrl: resolvePlaylistCover(detail),
      tracks: rawTracks,
    };
    detailLoading.value = false;
    apiCache.set(`playlist:${id}`, { playlist: detail }, CACHE_TTL.LIST);

    // 如果一开始就没歌曲则跳过补全
    if (!rawTracks.length) return;

    // 用 trackCount 兜底（雷达歌单不返回 trackIds 但返回 trackCount）
    const max = trackIds.length || trackCount;
    if (max > rawTracks.length) {
      infiniteState.value = {
        loading: false,
        hasMore: true,
        loaded: rawTracks.length,
        total: max,
      };
    }
  } catch (e: any) {
    if (currentToken !== fetchToken) return;
    error.value = e?.message || '歌单详情加载失败';
    playlist.value = null;
    detailLoading.value = false;
  }
}

// 模块级会话缓存（内存 Map，不持久化到 localStorage）
const sessionTrackCache = new Map<number, { tracks: any[]; total: number }>();

async function loadMoreSongs(id: number) {
  if (infiniteState.value.loading || !infiniteState.value.hasMore) return;
  if (currentToken !== fetchToken) return;

  const st = infiniteState.value;
  infiniteState.value = { ...st, loading: true };

  try {
    const { data: chunkRes } = await getPlaylistTrackAll({ id, limit: 100, offset: st.loaded });
    if (currentToken !== fetchToken) return;

    const newSongs = Array.isArray(chunkRes?.songs) ? chunkRes.songs : [];
    if (!newSongs.length) {
      infiniteState.value = { ...infiniteState.value, loading: false, hasMore: false };
      return;
    }

    const existingIds = new Set(playlist.value.tracks.map((s: any) => Number(s.id)));
    const uniqueNew = newSongs.filter((s: any) => !existingIds.has(Number(s.id)));
    if (!uniqueNew.length) {
      infiniteState.value = { ...infiniteState.value, loading: false, hasMore: false };
      return;
    }

    playlist.value = {
      ...playlist.value,
      tracks: [...playlist.value.tracks, ...uniqueNew],
    };

    const newLoaded = st.loaded + uniqueNew.length;
    infiniteState.value = {
      loading: false,
      hasMore: newLoaded < st.total,
      loaded: newLoaded,
      total: st.total,
    };
  } catch {
    infiniteState.value = { ...infiniteState.value, loading: false };
  }
}

function setupInfiniteScroll() {
  scrollObserver?.disconnect();
  scrollObserver = null;

  // 等 DOM 更新后再挂载 observer
  requestAnimationFrame(() => {
    const sentinel = sentinelRef.value;
    if (!sentinel) return;

    // 嵌入模式下 scroll root 是 .detail-panel，独立模式是 .playlist-detail-page
    const scrollRoot = props.embedded
      ? document.querySelector('.detail-panel')
      : document.querySelector('.playlist-detail-page');

    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && infiniteState.value.hasMore && playlist.value?.id) {
          loadMoreSongs(Number(playlist.value.id));
        }
      },
      { root: scrollRoot, rootMargin: '400px' },
    );
    scrollObserver.observe(sentinel);
  });
}

// 当 infiniteState.hasMore 变为 true 时挂载哨兵（首次渲染也会触发）
watch(
  () => infiniteState.value.hasMore,
  (hasMore) => {
    if (hasMore) {
      requestAnimationFrame(() => setupInfiniteScroll());
    }
  },
  { immediate: true },
);

function normalizeRecommendSong(song: any) {
  return {
    ...song,
    al: song?.al || song?.album || {},
    ar: Array.isArray(song?.ar) ? song.ar : Array.isArray(song?.artists) ? song.artists : [],
  };
}

function normalizeHistoryDateLabel(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadHistoryDates() {
  if (!isInjectedDailyRecommend.value || !userStore.isLogin) {
    historyDates.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    const { data } = await getHistoryRecommendSongDates(userStore.loginCookie || undefined);
    const list = Array.isArray(data?.data?.dates)
      ? data.data.dates
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.dates)
          ? data.dates
          : Array.isArray(data?.list)
            ? data.list
            : [];
    historyDates.value = list
      .map((item: any) => {
        const rawValue = String(item?.date || item?.day || item);
        const normalizedValue = normalizeHistoryDateLabel(rawValue);
        return normalizedValue ? { value: normalizedValue, label: normalizedValue } : null;
      })
      .filter(Boolean) as Array<{ value: string; label: string }>;
  } catch {
    historyDates.value = [];
  } finally {
    historyLoading.value = false;
  }
}

async function loadTodayRecommendTracks() {
  if (!isInjectedDailyRecommend.value || !userStore.isLogin || !playlist.value) return;
  historyLoading.value = true;
  selectedHistoryDate.value = '';
  try {
    const { data } = await getRecommendSongs(userStore.loginCookie || undefined);
    const list = Array.isArray(data?.recommend)
      ? data.recommend
      : Array.isArray(data?.songs)
        ? data.songs
        : Array.isArray(data?.data)
          ? data.data
          : [];
    const normalized = list.map((song: any) => normalizeRecommendSong(song)).filter(Boolean);
    const nextTracks = normalized.length ? normalized : Array.isArray(injectedPlaylist.value?.tracks) ? injectedPlaylist.value?.tracks : [];
    playlist.value = {
      ...playlist.value,
      coverImgUrl: resolvePlaylistCover({
        ...playlist.value,
        tracks: nextTracks,
      }),
      trackCount: normalized.length || injectedPlaylist.value?.trackCount || 0,
      tracks: nextTracks,
    };
  } catch {
    error.value = '历史日推加载失败';
    playlist.value = {
      ...playlist.value,
      tracks: Array.isArray(injectedPlaylist.value?.tracks) ? injectedPlaylist.value?.tracks : playlist.value?.tracks || [],
    };
  } finally {
    historyLoading.value = false;
  }
}

async function loadHistoryByDate(date: string) {
  if (!date || !isInjectedDailyRecommend.value || !playlist.value) return;
  historyLoading.value = true;
  selectedHistoryDate.value = date;
  error.value = '';
  try {
    const { data } = await getHistoryRecommendSongDetail(date, userStore.loginCookie || undefined);
    const list = Array.isArray(data?.data?.songs)
      ? data.data.songs
      : Array.isArray(data?.data?.dailySongs)
        ? data.data.dailySongs
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.songs)
            ? data.songs
            : Array.isArray(data?.dailySongs)
              ? data.dailySongs
              : Array.isArray(data?.list)
                ? data.list
                : [];
    const normalized = list.map((song: any) => normalizeRecommendSong(song)).filter(Boolean);
    playlist.value = {
      ...playlist.value,
      trackCount: normalized.length || playlist.value?.trackCount || 0,
      tracks: normalized.length ? normalized : Array.isArray(injectedPlaylist.value?.tracks) ? injectedPlaylist.value?.tracks : [],
    };
  } catch {
    playlist.value = {
      ...playlist.value,
      tracks: Array.isArray(injectedPlaylist.value?.tracks) ? injectedPlaylist.value?.tracks : playlist.value?.tracks || [],
    };
  } finally {
    historyLoading.value = false;
  }
}

function onHistorySelect(value: string) {
  if (value === '返回今日推荐' || value === historyButtonLabel.value) {
    void loadTodayRecommendTracks();
    return;
  }
  const hit = historyDates.value.find((item) => item.label === value);
  if (hit) void loadHistoryByDate(hit.value);
}

function openArtistDetail(artist: any) {
  const artistId = Number(artist?.id || artist?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}

function openLanguageDetail(language: string) {
  if (!language) return;
  emit('open-language', language);
}


function buildLocalPlaylistHistoryEntry() {
  const current = playlist.value;
  const playlistId = Number(props.playlistId || current?.id || 0);
  return {
    key: `playlist-${playlistId || current?.name || 'current'}`,
    title: current?.name || '未命名歌单',
    subtitle: `${current?.trackCount || tracks.value.length || 0} 首 · ${current?.creator?.nickname || '歌单'}`,
    source: 'local_play_history',
    sourceTip: '当前设备本地播放记录',
    summary: current?.description || '当前设备播放过的歌单。',
    typeLabel: '歌单历史',
    countLabel: '0',
    updatedAt: String(Date.now()),
    playableLabel: '歌单播放',
    playActionTip: '从本地历史恢复歌单详情。',
    coverUrl: current?.coverImgUrl || '',
    playableItem: { ...current, id: playlistId || current?.id },
    manageType: 'playlist' as const,
    canUnlike: false,
    canOpenDetail: Boolean(playlistId),
    sortKey: Date.now(),
  };
}

function recordPlaylistLocalHistory() {
  if (!playlist.value) return;
  recordLocalHistoryEntry(buildLocalPlaylistHistoryEntry());
}

async function playAll() {
  if (!tracks.value.length) return;
  try { recordPlaylistLocalHistory(); } catch { /* localStorage may be full */ }
  playerStore.setPlaylist(tracks.value, 0, props.playlistId);
  await playerStore.playByIndex(0);
}

function addAllToQueue() {
  const list = tracks.value;
  if (!list.length) return;
  const added = playerStore.appendToQueue(list);
  if (added > 0) {
    showToast(`已添加 ${added} 首至播放列表`, 'success', 3000);
  }
}


async function playOne(index: number) {
  if (!tracks.value.length) return;
  try { recordPlaylistLocalHistory(); } catch { /* localStorage may be full */ }
  playerStore.setPlaylist(tracks.value, index, props.playlistId);
  await playerStore.playByIndex(index);
}

const { isCurrentTrack, onSongItemDblClick } = useSongRowConfig(playOne);

onMounted(() => {
  fetchDetail(props.playlistId);
  void loadHistoryDates();
});

watch(
  () => [props.playlistId, props.injectedPlaylist],
  ([id]) => {
    isDescriptionExpanded.value = false;
    selectedHistoryDate.value = '';
    fetchDetail(Number(id));
    void loadHistoryDates();
    requestAnimationFrame(() => refresh());
  },
  { deep: true },
);

/* 操作按钮 */
const { checkAuth, showToast } = useAuthAction(
  '搜索用户方式登录不支持收藏功能，请使用扫码或 Cookie 登录',
  'like',
);
function playNext(song: any) {
  const idx = playerStore.currentIndex + 1;
  playerStore.playlist.splice(idx, 0, { ...song });
  showToast('已添加至播放列表', 'success', 3000);
}
const showPlaylistPicker = ref(false);
const playlistPickerList = ref<any[]>([]);
const pickerTargetSong = ref<any>(null);
const selectedPlaylistId = ref<number | null>(null);
async function showAddToPlaylist(song: any) {
  if (!checkAuth()) return;
  pickerTargetSong.value = song;
  try {
    const res = await getUserPlaylist(userStore.profile?.userId || 0, userStore.loginCookie || undefined);
    playlistPickerList.value = (res.data?.playlist || []).filter((p: any) => !p.subscribed);
  } catch { playlistPickerList.value = []; }
  selectedPlaylistId.value = null;
  showPlaylistPicker.value = true;
}
async function confirmAddToPlaylist() {
  const pid = selectedPlaylistId.value;
  const song = pickerTargetSong.value;
  if (!pid || !song) return;
  try {
    await addTrackToPlaylist(pid, [Number(song.id || 0)], userStore.loginCookie || undefined);
  } catch {}
  showPlaylistPicker.value = false;
}
function openComment(songId: number) {
  emit('open-comment', songId);
}
function openAlbum(albumId: number) {
  emit('open-album', albumId);
}
</script>

<style scoped>
@import '../styles/detail-page.css';

.playlist-detail-body { }

.history-dropdown {
  width: 120px;
  flex: 0 0 120px;
  order: 0;
}

.history-dropdown :deep(.dd) {
  width: 120px;
}

.history-dropdown :deep(.dd-trigger) {
  width: 100%;
}

.play-all {
  order: 1;
  flex: 0 0 auto;
}

/* 虚拟滚动容器 */
.playlist-detail-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.song-list--virtual {
  flex: 1;
  min-height: 400px;
}

.song-list--virtual .song-item {
  display: grid;
  grid-template-columns: 40px 52px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: 10px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 16px;
}
.song-list--virtual .song-item:last-child {
  border-bottom: 0;
}
.song-list--virtual .song-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
}
.song-list--virtual .song-cover-placeholder {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--bg-muted);
}
.song-list--virtual .song-meta {
  min-width: 0;
}
.song-list--virtual .song-name {
  margin: 0;
  color: var(--text-main);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-body-sm);
}
.song-list--virtual .song-artist {
  margin: 2px 0 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-list--virtual .song-artist .artist-link {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font: inherit;
}
.song-list--virtual .song-artist .artist-link:hover {
  color: var(--accent);
}
.song-list--virtual .infinite-sentinel {
  text-align: center;
  padding: var(--space-3);
  color: var(--text-soft);
  font-size: var(--text-label-sm);
}

.playlist-detail-page--embedded .song-list {
  border-top: 0;
}

.playlist-detail-page--embedded .song-item {
  padding-left: 0;
  padding-right: 0;
  overflow: hidden;
}

.playlist-detail-page--embedded.user-detail-panel {
  background: transparent;
}

.playlist-detail-page--embedded.user-detail-panel .playlist-detail-header {
  grid-template-columns: 308px minmax(0, 1fr);
  justify-items: stretch;
  align-items: center;
  gap: var(--space-4);
}

.playlist-detail-page--embedded.user-detail-panel .meta {
  min-height: unset;
  display: grid;
  justify-items: start;
  align-content: center;
  gap: 12px;
  text-align: left;
  padding: 0;
  width: 100%;
}

.playlist-detail-page--embedded.user-detail-panel .sub-row {
  justify-content: flex-start;
}

.playlist-detail-page--embedded.user-detail-panel .cover,
.playlist-detail-page--embedded.user-detail-panel .creator-avatar,
.playlist-detail-page--embedded.user-detail-panel .play-all {
  box-shadow: none;
}



.cover {
  width: 308px;
  height: 308px;
  border-radius: 18px;
}

.user-detail-panel .playlist-detail-header {
  grid-template-columns: 1fr;
  justify-items: center;
  align-items: start;
  gap: 16px;
}

.user-detail-panel .cover {
  width: 308px;
  height: 308px;
}

.user-detail-panel .meta {
  min-height: unset;
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-top: 0;
  width: 100%;
  text-align: center;
}

.user-detail-panel .title {
  margin: 0;
  font-size: 34px;
  line-height: 1.1;
  letter-spacing: 0.2px;
}

.user-detail-panel .sub-row {
  margin-top: 2px;
  justify-content: center;
}



.sub-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.creator-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 2px 6px rgba(2, 6, 23, 0.18);
}

.sub-dot {
  opacity: 0.6;
}

.track-loading-tip {
  font-size: var(--text-label-sm);
  color: #6b7280;
}

.song-artist {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
}

@media (max-width: 767px) {
  .detail-hero .header {
    grid-template-columns: 1fr;
  }

  .detail-hero .cover {
    width: 140px;
    height: 140px;
  }

  .detail-hero .title {
    font-size: 30px;
  }

  .detail-hero .desc {
    font-size: var(--text-label-md);
  }
}

/* 歌单标签栏 */
.playlist-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}

.playlist-tab {
  min-width: 96px;
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  color: var(--text-sub);
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
}

.playlist-tab:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  box-shadow: 0 12px 22px color-mix(in srgb, var(--accent) 10%, transparent);
}

.playlist-tab.active {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 90%, #fff), color-mix(in srgb, var(--accent) 68%, #000));
  color: #fff;
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

/* 评论面板容器 */
.playlist-comment-section {
  padding: var(--space-2) 0;
}

</style>
