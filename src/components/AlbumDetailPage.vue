<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="playlist-detail-page" :class="[detailPageClassName, embedded && 'playlist-detail-page--embedded']">
    <div v-if="!embedded" class="playlist-detail-back">
      <button class="back-btn" @click="emit('back')">← {{ props.backLabel }}</button>
    </div>

    <DetailStickyHeroHeader
      :embedded="embedded"
      :loading="loading"
      :ready="!!album"
      :error="error"
      loading-text="专辑加载中…"
    >
      <template #media>
        <HeroCoverMedia :src="album.picUrl" :alt="album.name" />
      </template>
      <template #title>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">{{ album.name }}</AnimatedAppear>
      </template>
      <template #meta>
        <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="sub">
          <button v-if="album.artist?.id || album.artist?.name" type="button" class="artist-link artist-link--inline" @click="openAlbumArtistDetail">
            {{ album.artist?.name || '未知歌手' }}
          </button>
          <span v-else>未知歌手</span>
          <span class="sub-dot">·</span>
          歌曲总数：{{ songs.length }}
        </AnimatedAppear>
        <AnimatedAppear
          v-if="albumDescription"
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
            {{ albumDescription }}
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
        <EntitySubscribeButton
          v-if="album?.id"
          type="album"
          text
          :subscribed="subscribeState.isSubscribed.value"
          :loading="subscribeState.isLoading.value"
          @toggle="subscribeState.toggle"
        />
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="play-all" @click="playAll">播放全部</AnimatedAppear>
      </template>
      <template #tabs>
        <DetailTabBar
          v-model="activeTab"
          :tabs="tabs"
          aria-label="专辑详情标签"
          v-model:search-query="searchQuery"
          :show-search="activeTab === 'songs'"
        />
      </template>
    </DetailStickyHeroHeader>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="playlist-detail-body">
      <AnimatedAppear v-if="loading && !album" tag="div" variant="text" rhythm="body" class-name="state">专辑加载中…</AnimatedAppear>
      <AnimatedAppear v-else-if="error" tag="div" variant="text" rhythm="body" class-name="state error">{{ error }}</AnimatedAppear>
      <AnimatedAppear v-else-if="album" tag="div" variant="content" rhythm="body" class-name="playlist-detail-body">
        <template v-if="activeTab === 'songs'">
          <VirtualTrackList
            ref="trackListRef"
            scroll-mode="parent"
            :scroll-host-selector="scrollHostSelector"
            :items="filteredSongs"
            :row-height="68"
            :item-key="(s: any) => s.id"
            container-class="song-list"
          >
            <template #default="{ item: song, index: idx }">
              <div
                class="song-item"
                :class="{ 'song-item--playing': isCurrentTrack(song) }"
                @dblclick="onSongItemDblClick($event, idx)"
              >
                <PlayPauseButton :song-id="Number(song.id || 0)" :index-label="idx + 1" @play="playOne(idx)" />
                <img class="song-cover" :src="song.al?.picUrl || album.picUrl" :alt="song.name" loading="lazy" />
                <div class="song-meta">
                  <p class="song-name">{{ song.name }}</p>
                  <p class="song-artist">
                    <button
                      v-for="artist in getSongArtists(song)"
                      :key="`${song.id}-${artist.id || artist.name}`"
                      type="button"
                      class="artist-link"
                      @click="openArtistDetail(artist)"
                    >
                      {{ artist.name || '未知歌手' }}
                    </button>
                    <span v-if="!getSongArtists(song).length">未知歌手</span>
                  </p>
                </div>
                <SongActions :song="song" @play-next="playNext" @add-to-playlist="showAddToPlaylist" @open-comment="openComment" @open-album="openAlbum" @open-artist="openArtistDetail" @open-language="openLanguageDetail" @open-mv-player="(mv) => emit('open-mv-player', mv)" />
              </div>
            </template>
          </VirtualTrackList>
        </template>
        <template v-else-if="activeTab === 'comments'">
          <div :key="`${tabContentKey}:comments`" class="playlist-comment-section">
            <CommentPanel
              :resource-id="Number(album.id || props.albumId || 0)"
              :resource-type="3"
              :fetcher="commentApi.getAlbumComments"
              :sender="(params) => commentApi.sendComment({ ...params, type: 3 })"
              :liker="(params) => commentApi.likeComment({ ...params, type: 3 })"
              :deleter="commentApi.deleteAlbumComment"
              @open-user="(uid) => emit('open-user', uid)"
            />
          </div>
        </template>
      </AnimatedAppear>
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
</template>

<script setup lang="ts">
import HeroCoverMedia from './HeroCoverMedia.vue';
import DetailStickyHeroHeader from './DetailStickyHeroHeader.vue';
import { computed, ref, watch } from 'vue';
import { useDetailStickyState } from '../composables/useDetailStickyState';
import { useDominantColor } from '../composables/useDominantColor';
import { useApiData } from '../composables/useApiData';
import { CACHE_TTL } from '../stores/apiCache';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { recordLocalHistoryEntry } from '../utils/localHistory';
import { getSongArtists } from '../utils/trackHelpers';
import AnimatedAppear from './AnimatedAppear.vue';
import PlayPauseButton from './ui/PlayPauseButton.vue';
import SongActions from './ui/SongActions.vue';
import EntitySubscribeButton from './ui/EntitySubscribeButton.vue';
import CommentPanel from './CommentPanel.vue';
import DetailTabBar from './ui/DetailTabBar.vue';
import PlaylistPickerModal from './common/PlaylistPickerModal.vue';
import { useEntitySubscribe } from '../composables/useEntitySubscribe';
import { useSongRowConfig } from '../composables/useSongRowConfig';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { useAuthAction } from '../composables/useAuthAction';
import * as commentApi from '../api/music';
import { getAlbumDetail, addTrackToPlaylist, getUserPlaylist } from '../api/music';
import VirtualTrackList from './VirtualTrackList.vue';

const DESC_COLLAPSE_THRESHOLD = 60;

const props = withDefaults(
  defineProps<{
    albumId: number;
    backLabel?: string;
    embedded?: boolean;
  }>(),
  {
    backLabel: '返回首页',
    embedded: false,
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

const isDescriptionExpanded = ref(false);
const activeTab = ref<'songs' | 'comments'>('songs');
const tabs = [
  { key: 'songs', label: '歌曲' },
  { key: 'comments', label: '评论' },
] as const;
const searchQuery = ref('');

// 使用 useApiData 获取专辑详情
const { data: albumData, loading, error } = useApiData(
  () => props.albumId ? `album:${props.albumId}` : '',
  () => getAlbumDetail(props.albumId).then(r => {
    const detail = r?.data?.album;
    const list = r?.data?.songs || [];
    if (!detail) throw new Error('专辑详情为空');
    return { ...detail, songs: list };
  }),
  { ttl: CACHE_TTL.ENTITY }
);

const album = computed<any>(() => albumData.value);
const songs = computed<any[]>(() => album.value?.songs || []);

const filteredSongs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return songs.value;
  return songs.value.filter(song => {
    const name = (song.name || '').toLowerCase();
    const artists = getSongArtists(song).map(a => (a.name || '').toLowerCase());
    return name.includes(q) || artists.some(a => a.includes(q));
  });
});

const coverUrl = computed(() => album.value?.picUrl || '');
useDominantColor(coverUrl);

const albumIdRef = computed(() => album.value?.id || undefined);
const tabContentKey = computed(() => `${album.value?.id || props.albumId || 'pending'}:${activeTab.value}`);
const subscribeState = useEntitySubscribe({
  type: 'album',
  id: albumIdRef,
  initialSubscribed: computed(() => album.value?.subscribed ?? false),
});
const albumDescription = computed(() => album.value?.description?.trim() || '');
const shouldShowDescriptionToggle = computed(() => albumDescription.value.length > DESC_COLLAPSE_THRESHOLD);
const isUserDetail = computed(() => props.backLabel === '返回用户中心');
const detailPageClassName = computed(() => {
  const classNames: string[] = [];
  if (isUserDetail.value) classNames.push('user-detail-panel');
  if (props.embedded) classNames.push('playlist-detail-page--embedded');
  return classNames.join(' ');
});
const { refresh } = useDetailStickyState(
  computed(() => album.value?.picUrl?.trim() || ''),
  !!props.embedded,
);

const scrollHostSelector = computed(() =>
  props.embedded ? '.detail-panel' : '.playlist-detail-page',
);

const trackListRef = ref<InstanceType<typeof VirtualTrackList> | null>(null);

// 专辑切换时重置滚动位置
watch(() => album.value?.id, () => {
  requestAnimationFrame(() => refresh());
});

function openArtistDetail(artist: any) {
  const artistId = Number(artist?.id || artist?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}

function openLanguageDetail(language: string) {
  if (!language) return;
  emit('open-language', language);
}

function openAlbumArtistDetail() {
  const artist = album.value?.artist;
  const artistId = Number(artist?.id || artist?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}


function buildLocalAlbumHistoryEntry() {
  const current = album.value;
  const albumId = Number(props.albumId || current?.id || 0);
  return {
    key: `album-${albumId || current?.name || 'current'}`,
    title: current?.name || '未命名专辑',
    subtitle: `${songs.value.length || current?.size || 0} 首 · ${current?.artist?.name || '未知歌手'}`,
    source: 'local_play_history',
    sourceTip: '当前设备本地播放记录',
    summary: current?.description || '当前设备播放过的专辑。',
    typeLabel: '专辑历史',
    countLabel: '0',
    updatedAt: String(Date.now()),
    playableLabel: '专辑播放',
    playActionTip: '从本地历史恢复专辑详情。',
    coverUrl: current?.picUrl || current?.blurPicUrl || '',
    playableItem: { ...current, id: albumId || current?.id },
    manageType: 'album' as const,
    canUnlike: false,
    canOpenDetail: Boolean(albumId),
    sortKey: Date.now(),
  };
}

function recordAlbumLocalHistory() {
  if (!album.value) return;
  recordLocalHistoryEntry(buildLocalAlbumHistoryEntry());
}

async function playAll() {
  if (!songs.value.length) return;
  recordAlbumLocalHistory();
  playerStore.setPlaylist(songs.value, 0);
  await playerStore.playByIndex(0);
}


async function playOne(index: number) {
  if (!songs.value.length) return;
  recordAlbumLocalHistory();
  playerStore.setPlaylist(songs.value, index);
  await playerStore.playByIndex(index);
}

const { isCurrentTrack, onSongItemDblClick } = useSongRowConfig(playOne);

const { checkAuth, showToast } = useAuthAction(
  '搜索用户方式登录不支持收藏功能，请使用扫码或 Cookie 登录',
  'playlist',
);
const showPlaylistPicker = ref(false);
const playlistPickerList = ref<any[]>([]);
const pickerTargetSong = ref<any>(null);
const selectedPlaylistId = ref<number | null>(null);

function playNext(song: any) {
  const idx = playerStore.state.currentIndex + 1;
  playerStore.state.playlist.splice(idx, 0, { ...song });
  showToast('已添加至播放列表', 'success', 3000);
}
async function showAddToPlaylist(song: any) {
  if (!checkAuth()) return;
  pickerTargetSong.value = song;
  try {
    const res = await getUserPlaylist(userStore.profile?.userId || 0, userStore.state.loginCookie || undefined);
    playlistPickerList.value = (res.data?.playlist || []).filter((p: any) => !p.subscribed);
  } catch {
    playlistPickerList.value = [];
  }
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
function openAlbum(albumId: number) {
  emit('open-album', albumId);
}
</script>

<style scoped>
@import '../styles/detail-page.css';

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

.playlist-detail-page--embedded .song-list {
  border-top: 0;
}

.playlist-detail-page--embedded .song-item {
  padding-left: 0;
  padding-right: 0;
}

.playlist-detail-body { }



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

.sub-dot { opacity: 0.6; }

.song-artist {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
}

@media (max-width: 767px) { .playlist-detail-header__content .title { font-size: 30px; } }

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

.playlist-comment-section {
  padding: var(--space-2) 0;
}


</style>
