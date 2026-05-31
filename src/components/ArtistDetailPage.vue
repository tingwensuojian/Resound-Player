<template>
  <DetailShrinkShell
    :list-scrolling="listScrolling"
    :cover-url="coverUrl || ''"
  >
    <template #media>
      <HeroCoverMedia :src="coverUrl || ''" :alt="artist?.name || '歌手封面'" image-class="artist-cover" />
    </template>
    <template #title>
      <h2 class="title">{{ artist?.name || '未命名歌手' }}</h2>
    </template>
    <template #meta>
      <div class="sub-row artist-meta-row">
        <span class="meta-pill">{{ artistAreaText }}</span>
        <span class="meta-pill">热门歌曲：{{ topSongs.length }}</span>
        <span class="meta-pill">专辑：{{ albums.length }}</span>
        <span class="meta-pill">MV：{{ mvs.length }}</span>
      </div>
      <div class="desc-wrap">
        <p
          class="desc"
          :class="{ 'desc--collapsed': !isDescriptionExpanded && shouldShowDescriptionToggle }"
        >
          {{ artistDescriptionPreview }}
        </p>
        <button
          v-if="shouldShowDescriptionToggle"
          type="button"
          class="desc-toggle"
          @click="isDescriptionExpanded = !isDescriptionExpanded"
        >
          {{ isDescriptionExpanded ? '收起' : '展开' }}
        </button>
      </div>
    </template>
    <template #actions>
      <EntitySubscribeButton
        v-if="artist?.id"
        type="artist"
        :subscribed="subscribeState.isSubscribed.value"
        :loading="subscribeState.isLoading.value"
        @toggle="subscribeState.toggle"
      />
      <button class="btn-play-all" @click="playTopSongs">播放热门</button>
    </template>
    <template #tabs>
      <DetailTabBar
        v-model="activeTab"
        :tabs="tabs"
        aria-label="歌手详情标签"
        :show-search="false"
      />
    </template>
    <template #content>
      <div class="page-content-scroll" @scroll="handleListScroll">
      <AnimatedAppear v-if="loading && !artist" tag="div" variant="text" rhythm="body" class-name="state">歌手详情加载中…</AnimatedAppear>
      <AnimatedAppear v-else-if="error" tag="div" variant="text" rhythm="body" class-name="state error">{{ error }}</AnimatedAppear>

      <template v-else-if="artist">
        <VirtualTrackList
          v-if="activeTab === 'songs'"
          ref="trackListRef"
          scroll-mode="parent"
          :scroll-host-selector="scrollHostSelector"
          :items="topSongs"
          :row-height="68"
          :item-key="(s: any) => s.id || s"
          container-class="song-list"
        >
          <template #default="{ item: song, index: idx }">
            <div
              class="song-item"
              :class="{ 'song-item--playing': isCurrentTrack(song) }"
              @dblclick="onSongItemDblClick($event, idx)"
            >
              <PlayPauseButton :song-id="Number(song?.id || 0)" :index-label="idx + 1" @play="playSong(idx)" />
              <img class="song-cover" :src="resolveSongCover(song) || coverUrl" :alt="song.name || '歌曲封面'" loading="lazy" />
              <div class="song-meta">
                <p class="song-name">{{ song.name }}</p>
                <p class="song-artist">
                  <button
                    v-for="artistItem in getSongArtists(song)"
                    :key="`${song.id}-${artistItem.id || artistItem.name}`"
                    type="button"
                    class="artist-link"
                    @click.stop="openArtistDetail(artistItem)"
                  >
                    {{ artistItem.name || '未知歌手' }}
                  </button>
                  <span v-if="!getSongArtists(song).length">{{ resolveSongSubtitle(song) }}</span>
                </p>
              </div>
              <SongActions :song="song" @play-next="playNext" @add-to-playlist="showAddToPlaylist" @open-comment="openComment" @open-album="(albumId) => emit('open-album-detail', albumId)" @open-artist="openArtistDetail" @open-language="openLanguageDetail" @open-mv-player="(mv) => emit('open-mv-player', mv)" />
            </div>
          </template>
        </VirtualTrackList>

        <!-- 全部歌曲标签 -->
        <template v-if="activeTab === 'all-songs'">
          <VirtualTrackList
            ref="allSongsListRef"
            scroll-mode="parent"
            :scroll-host-selector="scrollHostSelector"
            :items="allSongs"
            :row-height="68"
            :item-key="(s: any) => s.id || s"
            container-class="song-list"
          >
            <template #default="{ item: song, index: idx }">
              <div
                class="song-item"
                :class="{ 'song-item--playing': isAllSongsCurrentTrack(song) }"
                @dblclick="onAllSongsItemDblClick($event, idx)"
              >
                <PlayPauseButton :song-id="Number(song?.id || 0)" :index-label="idx + 1" @play="playAllSong(idx)" />
                <img class="song-cover" :src="resolveSongCover(song) || coverUrl" :alt="song.name || '歌曲封面'" loading="lazy" />
                <div class="song-meta">
                  <p class="song-name">{{ song.name }}</p>
                  <p class="song-artist">
                    <button
                      v-for="artistItem in getSongArtists(song)"
                      :key="`${song.id}-${artistItem.id || artistItem.name}`"
                      type="button"
                      class="artist-link"
                      @click.stop="openArtistDetail(artistItem)"
                    >
                      {{ artistItem.name || '未知歌手' }}
                    </button>
                    <span v-if="!getSongArtists(song).length">{{ resolveSongSubtitle(song) }}</span>
                  </p>
                </div>
                <SongActions :song="song" @play-next="playNext" @add-to-playlist="showAddToPlaylist" @open-comment="openComment" @open-album="(albumId) => emit('open-album-detail', albumId)" @open-artist="openArtistDetail" @open-language="openLanguageDetail" @open-mv-player="(mv) => emit('open-mv-player', mv)" />
              </div>
            </template>
            <template #sentinel>
              <div v-if="allSongsHasMore && allSongs.length > 0" class="load-more-sentinel">
                <button v-if="!allSongsLoading" type="button" class="load-more-btn" @click="fetchAllSongs()">加载更多</button>
                <span v-else class="load-more-tip">加载中…</span>
              </div>
            </template>
          </VirtualTrackList>
        </template>

        <AnimatedAppear v-show="activeTab === 'albums'" tag="div" variant="content" rhythm="list" class-name="album-grid">
          <AnimatedAppear v-for="(album, idx) in albums" :key="album.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card album-card" type="button" @click="emit('open-album-detail', Number(album.id || 0), activeTab)">
            <img v-if="resolveAlbumCover(album)" class="entity-cover cover-image" :src="resolveAlbumCover(album)" :alt="album.name || '专辑封面'" loading="lazy" />
            <div v-else class="entity-cover album-fallback">AL</div>
            <div class="entity-main">
              <div class="entity-name">{{ album.name || '未命名专辑' }}</div>
              <div class="entity-sub">
                <button
                  v-for="artistItem in getAlbumArtists(album)"
                  :key="`${album.id || idx}-${artistItem.id || artistItem.name}`"
                  type="button"
                  class="artist-link"
                  @click.stop="openArtistDetail(artistItem)"
                >
                  {{ artistItem.name || '未知歌手' }}
                </button>
                <span v-if="!getAlbumArtists(album).length">{{ resolveAlbumSubtitle(album) }}</span>
              </div>
              <div class="entity-sub entity-date">{{ formatAlbumReleaseDate(album) }}</div>
            </div>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-show="activeTab === 'mvs'" tag="div" variant="content" rhythm="list" class-name="mv-grid">
          <AnimatedAppear v-for="(mv, idx) in mvs" :key="mv.id || mv.vid || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="mv-card" type="button" @click="emit('open-mv-player', mv)">
            <MvHoverPoster
              :src="resolveMvCover(mv)"
              :alt="mv.name || 'MV 封面'"
              :count="mv.playCount || mv.playTime || 0"
              fallback-class="mv-cover-fallback"
            />
            <div class="mv-info">
              <div class="entity-name">{{ mv.name || '未命名 MV' }}</div>
              <div class="entity-sub">
                <button
                  v-for="artistItem in getMvArtists(mv)"
                  :key="`${mv.id || mv.vid || idx}-${artistItem.id || artistItem.name}`"
                  type="button"
                  class="artist-link"
                  @click.stop="openArtistDetail(artistItem)"
                >
                  {{ artistItem.name || '未知歌手' }}
                </button>
                <span v-if="!getMvArtists(mv).length">{{ mv.publishTime || mv.artistName || artist?.name || 'MV' }}</span>
              </div>
            </div>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-show="activeTab === 'bio'" tag="div" variant="content" rhythm="body" class-name="bio-panel">
          <AnimatedAppear v-for="(block, idx) in bioBlocks" :key="`${block.title}-${idx}`" tag="section" variant="content" rhythm="list" :index="idx" class-name="bio-block">
            <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="bio-title">{{ block.title }}</AnimatedAppear>
            <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="bio-text">{{ block.text }}</AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>
      </template>
    </div>
    </template>
  </DetailShrinkShell>
  <!-- 收藏至歌单选择器 -->
  <PlaylistPickerModal
    :visible="showPlaylistPicker"
    :playlists="playlistPickerList"
    :selected-id="selectedPlaylistId"
    @update:visible="showPlaylistPicker = $event"
    @select="selectedPlaylistId = $event"
    @confirm="confirmAddToPlaylist()"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance, onBeforeUnmount } from 'vue';
import DetailShrinkShell from './DetailShrinkShell.vue';
import DetailTabBar from './ui/DetailTabBar.vue';
import HeroCoverMedia from './HeroCoverMedia.vue';
import AnimatedAppear from './AnimatedAppear.vue';
import PlayPauseButton from './ui/PlayPauseButton.vue';
import { useListScroll } from '../composables/useScrollShrink';
import { useApiData } from '../composables/useApiData';
import { CACHE_TTL } from '../stores/apiCache';
import { useDominantColor } from '../composables/useDominantColor';
import MvHoverPoster from './MvHoverPoster.vue';
import SongActions from './ui/SongActions.vue';
import EntitySubscribeButton from './ui/EntitySubscribeButton.vue';
import PlaylistPickerModal from './common/PlaylistPickerModal.vue';
import { useEntitySubscribe } from '../composables/useEntitySubscribe';
import { useSongRowConfig } from '../composables/useSongRowConfig';
import { getSongArtists } from '../utils/trackHelpers';
import { getArtistAlbums, getArtistDescription, getArtistDetail, getArtistMvs, getArtistSongs, getArtistTopSongs, getUserPlaylist, addTrackToPlaylist } from '../api/music';
import { resolveArtistImageUrl, normalizeImageUrl } from '../utils/image';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { useAuthAction } from '../composables/useAuthAction';
import VirtualTrackList from './VirtualTrackList.vue';

const DESC_COLLAPSE_THRESHOLD = 60;
const detailPageRef = ref<ComponentPublicInstance | null>(null);

const scrollHostSelector = '.page-content-scroll';
const { listScrolling, handleListScroll, resetScroll } = useListScroll();

const props = withDefaults(
  defineProps<{
    artistId: number;
    backLabel?: string;
    initialTab?: string;
  }>(),
  {
    backLabel: '返回搜索结果',
    initialTab: 'songs',
  },
);

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-album-detail', albumId: number, activeTab?: string): void;
  (e: 'open-artist', artist: any): void;
  (e: 'open-mv-player', item: any): void;
  (e: 'open-comment', songId: number): void;
  (e: 'update:active-tab', tab: string): void;
  (e: 'open-language', language: string): void;
}>();

const isDescriptionExpanded = ref(false);

// 歌手详情：useApiData 统一管理 5 个并行 API 的缓存
const { data: artistFull, loading, error } = useApiData(
  () => props.artistId ? `artist:full:${props.artistId}` : '',
  async () => {
    const [detailRes, topSongsRes, albumsRes, mvsRes, descRes] = await Promise.all([
      getArtistDetail(props.artistId),
      getArtistTopSongs(props.artistId),
      getArtistAlbums(props.artistId),
      getArtistMvs(props.artistId),
      getArtistDescription(props.artistId),
    ]);
    return { detailRes, topSongsRes, albumsRes, mvsRes, descRes };
  },
  { ttl: CACHE_TTL.LIST }
);

const artist = computed<any>(() => {
  const data = artistFull.value?.detailRes?.data || artistFull.value?.detailRes;
  return data?.data?.artist || data?.artist || data?.data || null;
});
const topSongs = computed<any[]>(() => {
  const data = artistFull.value?.topSongsRes?.data || artistFull.value?.topSongsRes;
  return Array.isArray(data?.songs) ? data.songs : Array.isArray(data?.hotSongs) ? data.hotSongs : [];
});
const albums = computed<any[]>(() => {
  const data = artistFull.value?.albumsRes?.data || artistFull.value?.albumsRes;
  return Array.isArray(data?.hotAlbums) ? data.hotAlbums : Array.isArray(data?.artist?.album) ? data.artist.album : Array.isArray(data?.albums) ? data.albums : [];
});
const mvs = computed<any[]>(() => {
  const data = artistFull.value?.mvsRes?.data || artistFull.value?.mvsRes;
  return Array.isArray(data?.mvs) ? data.mvs : [];
});
const bio = computed<any>(() => {
  const data = artistFull.value?.descRes?.data || artistFull.value?.descRes;
  return data || null;
});

const artistIdRef = computed(() => artist.value?.id || undefined);
const subscribeState = useEntitySubscribe({
  type: 'artist',
  id: artistIdRef,
  initialSubscribed: computed(() => artist.value?.subscribed ?? false),
});
const activeTab = ref<'songs' | 'all-songs' | 'albums' | 'mvs' | 'bio'>(
  (props.initialTab || 'songs') as 'songs' | 'all-songs' | 'albums' | 'mvs' | 'bio'
);
watch(() => props.initialTab, (val) => {
  if (val) activeTab.value = val as any;
});
watch(activeTab, (val) => {
  emit('update:active-tab', val);
});
const tabs = [
  { key: 'songs', label: '热门歌曲' },
  { key: 'all-songs', label: '全部歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'mvs', label: 'MV' },
  { key: 'bio', label: '简介' },
] as const;

// 全部歌曲标签状态
const allSongs = ref<any[]>([]);
const allSongsLoading = ref(false);
const allSongsOffset = ref(0);
const allSongsHasMore = ref(true);
const allSongsPageSize = 50;

async function fetchAllSongs(reset = false) {
  if (allSongsLoading.value) return;
  if (reset) {
    allSongsOffset.value = 0;
    allSongs.value = [];
    allSongsHasMore.value = true;
  }
  if (!allSongsHasMore.value) return;

  allSongsLoading.value = true;
  try {
    const res = await getArtistSongs(props.artistId, {
      order: 'time',
      limit: allSongsPageSize,
      offset: allSongsOffset.value,
    });
    const newSongs = res?.data?.songs || res?.data?.data?.songs || [];
    if (reset) {
      allSongs.value = newSongs;
    } else {
      allSongs.value = [...allSongs.value, ...newSongs];
    }
    allSongsOffset.value += newSongs.length;
    allSongsHasMore.value = newSongs.length >= allSongsPageSize;
  } catch {
    // 静默失败
  } finally {
    allSongsLoading.value = false;
  }
}

watch(() => activeTab.value, (tab) => {
  if (tab === 'all-songs' && allSongs.value.length === 0 && !allSongsLoading.value) {
    fetchAllSongs(true);
  }
});

const coverUrl = computed(() => resolveArtistImageUrl(artist.value));
useDominantColor(coverUrl);
const artistAreaText = computed(() => artist.value?.area ? `地区：${artist.value.area}` : '歌手详情');
const artistDescriptionPreview = computed(() => {
  const brief = bio.value?.briefDesc || artist.value?.briefDesc || '';
  const firstBlock = Array.isArray(bio.value?.introduction) ? bio.value.introduction[0]?.txt || '' : '';
  return (brief || firstBlock || '这里将展示歌手简介、代表作品与创作风格。').trim();
});
const shouldShowDescriptionToggle = computed(() => artistDescriptionPreview.value.length > DESC_COLLAPSE_THRESHOLD);
const bioBlocks = computed(() => {
  const introList = Array.isArray(bio.value?.introduction) ? bio.value.introduction : [];
  const normalized = introList
    .map((item: any) => ({ title: item?.ti || '简介', text: item?.txt || '' }))
    .filter((item: any) => item.text);

  if (normalized.length) return normalized;
  return [{ title: '简介', text: artistDescriptionPreview.value }];
});

function resolveSongCover(song: any) {
  return normalizeImageUrl(song?.al?.picUrl || song?.album?.picUrl || song?.album?.blurPicUrl || song?.picUrl || '');
}

function resolveSongSubtitle(song: any) {
  return song?.ar?.map((item: any) => item.name).join('/') || song?.artists?.map((item: any) => item.name).join('/') || song?.al?.name || '未知歌曲';
}

function getAlbumArtists(album: any) {
  const artists = Array.isArray(album?.artists)
    ? album.artists
    : album?.artist
      ? [album.artist]
      : [];
  return artists.filter((artistItem: any) => artistItem?.id || artistItem?.name);
}

function resolveAlbumCover(album: any) {
  return normalizeImageUrl(album?.picUrl || album?.blurPicUrl || album?.coverImgUrl || album?.artist?.img1v1Url || '');
}

function resolveAlbumSubtitle(album: any) {
  return album?.publishTime || album?.artist?.name || album?.size ? `${album?.artist?.name || artist.value?.name || '歌手'} · ${album?.size || 0} 首` : artist.value?.name || '专辑';
}

function formatAlbumReleaseDate(album: any) {
  const rawValue = album?.publishTime ?? album?.publishDate ?? album?.publish_date ?? album?.releaseDate;
  if (rawValue === undefined || rawValue === null || rawValue === '') return '发行日期：未知';

  if (typeof rawValue === 'string') {
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(rawValue)) {
      return `发行日期：${rawValue.replace(/\//g, '-').replace(/\./g, '-')}`;
    }
    if (/^\d{8}$/.test(rawValue)) {
      return `发行日期：${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
    }
  }

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '发行日期：未知';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '发行日期：未知';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `发行日期：${year}-${month}-${day}`;
}

function getMvArtists(item: any) {
  const artists = Array.isArray(item?.artists)
    ? item.artists
    : item?.artist
      ? [item.artist]
      : item?.artistName
        ? [{ id: item.artistId || 0, name: item.artistName }]
        : artist.value
          ? [{ id: artist.value.id || 0, name: artist.value.name || '' }]
          : [];
  return artists.filter((artistItem: any) => artistItem?.id || artistItem?.name);
}

function resolveMvCover(item: any) {
  return normalizeImageUrl(item?.imgurl16v9 || item?.cover || item?.picUrl || item?.coverImgUrl || '');
}

function openArtistDetail(artistItem: any) {
  const artistId = Number(artistItem?.id || artistItem?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artistItem);
}

function openLanguageDetail(language: string) {
  if (!language) return;
  emit('open-language', language);
}


async function playTopSongs() {
  if (!topSongs.value.length) return;
  playerStore.setPlaylist(topSongs.value, 0);
  await playerStore.playByIndex(0);
}



async function playSong(index: number) {
  if (!topSongs.value.length) return;
  playerStore.setPlaylist(topSongs.value, index);
  await playerStore.playByIndex(index);
}

async function playAllSong(index: number) {
  if (!allSongs.value.length) return;
  playerStore.setPlaylist(allSongs.value, index);
  await playerStore.playByIndex(index);
}

const { isCurrentTrack, onSongItemDblClick } = useSongRowConfig(playSong);
const { isCurrentTrack: isAllSongsCurrentTrack, onSongItemDblClick: onAllSongsItemDblClick } = useSongRowConfig(playAllSong);

const trackListRef = ref<InstanceType<typeof VirtualTrackList> | null>(null);
const allSongsListRef = ref<InstanceType<typeof VirtualTrackList> | null>(null);

/* 操作按钮 */
const { checkAuth, showToast } = useAuthAction(
  '搜索用户方式登录不支持收藏功能，请使用扫码或 Cookie 登录',
  'playlist',
);
const showPlaylistPicker = ref(false);
const playlistPickerList = ref<any[]>([]);
const pickerTargetSong = ref<any>(null);
const selectedPlaylistId = ref<number | null>(null);
function playNext(song: any) {
  playerStore.insertNext({ ...song });
  showToast('已添加至播放列表', 'success', 3000);
}
async function showAddToPlaylist(song: any) {
  if (!checkAuth()) return;
  pickerTargetSong.value = song;
  try {
    const res = await getUserPlaylist(userStore.state.profile?.userId || 0, userStore.state.loginCookie || undefined);
    playlistPickerList.value = (res.data?.playlist || []).filter((p: any) => !p.subscribed);
  } catch { playlistPickerList.value = []; showToast('加载歌单列表失败', 'error', 3000); }
  selectedPlaylistId.value = null;
  showPlaylistPicker.value = true;
}
async function confirmAddToPlaylist() {
  const pid = selectedPlaylistId.value;
  const song = pickerTargetSong.value;
  if (!pid || !song) return;
  try {
    await addTrackToPlaylist(pid, [Number(song.id || 0)], userStore.state.loginCookie || undefined);
    showToast('已添加至歌单', 'success', 3000);
  } catch {
    showToast('添加失败，请重试', 'error', 3000);
  }
  showPlaylistPicker.value = false;
}
function openComment(songId: number) {
  emit('open-comment', songId);
}

</script>

<style>@import '../styles/detail-page.css';</style>
<style scoped>


.artist-detail-back {
  display: block;
}

.artist-cover {
  background: linear-gradient(135deg, #fb923c, #f97316 42%, #7c3aed 100%);
}

.artist-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artist-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}

.artist-tab {
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

.artist-tab:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
}

.artist-tab.active {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 90%, #fff), color-mix(in srgb, var(--accent) 68%, #000));
  color: #fff;
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

.artist-detail-body {
  flex: 1;
  min-height: 0;
}

.album-grid,
.mv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.entity-card,
.mv-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  background: color-mix(in srgb, var(--bg-surface) 90%, transparent);
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}

.entity-card:hover,
.mv-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.1);
}

.entity-cover,
.album-fallback {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  object-fit: cover;
  display: block;
  background: var(--bg-muted);
}

.album-fallback {
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  background: linear-gradient(135deg, #f97316, #ef4444);
}

.entity-main,
.mv-info {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.entity-name {
  color: var(--text-main);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-sub,
.bio-text {
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.6;
}

.song-artist,
.entity-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
}

.entity-date {
  font-size: var(--text-label-sm);
  opacity: 0.88;
}

.mv-cover-fallback {
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.bio-panel {
  display: grid;
  gap: 16px;
}

.bio-block {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
}

.bio-title {
  margin: 0 0 10px;
  font-size: var(--text-body-lg);
  color: var(--text-main);
}

.bio-text {
  margin: 0;
  white-space: pre-wrap;
}

/* 加载更多 */
.load-more-sentinel {
  display: flex;
  justify-content: center;
  padding: var(--space-3) 0;
}

.load-more-btn {
  height: 36px;
  padding: 0 24px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  cursor: pointer;
  transition: background .18s, border-color .18s, transform .18s;
}

.load-more-btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
}

.load-more-tip {
  color: var(--text-soft);
  font-size: var(--text-label-sm);
}

@media (max-width: 767px) {
  .artist-tabs {
    gap: 10px;
  }

  .artist-tab {
    min-width: auto;
    padding: 0 14px;
    height: 36px;
  }

  .album-grid,
  .mv-grid {
    grid-template-columns: 1fr;
  }
}


.state {
  padding: 24px 0;
  text-align: center;
  color: var(--text-soft);
  font-size: var(--text-label-md);
}
.state.error {
  color: var(--danger);
}

</style>
