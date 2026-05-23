<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="history-page history-page--userlike">
    <div class="collection-history-shell">
      <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="collection-panel collection-panel--favorites">
        <div class="collection-panel__header">
          <div>
            <h3>我的收藏</h3>
            <p>共 {{ favoriteSongs.length }} 首</p>
          </div>
        </div>

        <div class="collection-list collection-list--favorites">
          <AnimatedAppear
            v-for="(item, idx) in favoriteSongs"
            :key="item.key"
            tag="button"
            variant="text"
            rhythm="list"
            :index="idx"
            class-name="collection-row"
            @click="playListItem(item, favoriteSongs, idx)"
          >
            <span class="collection-cover" :style="item.coverUrl ? undefined : item.coverStyle">
              <img v-if="item.coverUrl" :src="item.coverUrl" :alt="item.title" loading="lazy" />
            </span>
            <span class="collection-row__main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.subtitle }}</span>
            </span>
            <PlayPauseIconButton
              :song-id="getListItemSongId(item)"
              @click.stop="recordLocalHistoryItem(item)"
              @play="playListItem(item, favoriteSongs, idx)"
            />
          </AnimatedAppear>
          <div v-if="!favoriteSongs.length" class="collection-empty">暂无收藏歌曲，登录后会自动读取喜欢列表。</div>
          <ScrollToTopFab scrollHostSelector=".collection-list--favorites" />
        </div>
      </AnimatedAppear>

      <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="collection-panel collection-panel--history">
        <div class="collection-panel__header collection-panel__header--history">
          <div>
            <h3>播放历史</h3>
          </div>
        </div>

        <div class="history-controls ui-safe-group">
          <div class="history-tabs ui-safe-group">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              class="history-chip button-surface"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              {{ tab.title }}
            </button>
          </div>
          <div class="history-source-switch ui-safe-group">
            <button type="button" class="source-chip button-surface" :class="{ active: historySource === 'local' }" @click="setHistorySource('local')">本地记录</button>
            <button type="button" class="source-chip button-surface" :class="{ active: historySource === 'cloud' }" @click="setHistorySource('cloud')">云端记录</button>
          </div>
        </div>

        <div class="collection-list collection-list--history">
          <AnimatedAppear
            v-for="(item, idx) in leftItems"
            :key="item.key"
            tag="button"
            variant="text"
            rhythm="list"
            :index="idx"
            class-name="collection-row history-row"
            :class="{ active: selectedGroup === item.key }"
            @click="selectItem(item)"
            @dblclick="playListItem(item, leftItems, idx)"
          >
            <span class="collection-cover" :style="item.coverUrl ? undefined : item.coverStyle">
              <img v-if="item.coverUrl" :src="item.coverUrl" :alt="item.title" loading="lazy" />
            </span>
            <span class="collection-row__main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.subtitle }}</span>
            </span>
            <span class="history-row__actions">
              <BookmarkIconButton v-if="item.manageType === 'song'" :song-id="getListItemSongId(item)" :liked="isListItemLiked(item)" />
              <PlayPauseIconButton
                :song-id="getListItemSongId(item)"
                :disabled="!getListItemSongId(item)"
                @click.stop="recordLocalHistoryItem(item)"
                @play="item.manageType === 'playlist' ? playPlaylistFirstTrack(item) : playListItem(item, leftItems, idx)"
              />
            </span>
            <span v-if="historySource === 'local'" class="history-count">{{ getHistoryCount(item) }}</span>
          </AnimatedAppear>
          <div v-if="!leftItems.length" class="collection-empty">暂无播放历史</div>
          <ScrollToTopFab scrollHostSelector=".collection-list--history" />
        </div>
      </AnimatedAppear>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AnimatedAppear from './AnimatedAppear.vue';
import BookmarkIconButton from './ui/BookmarkIconButton.vue';
import PlayPauseIconButton from './ui/PlayPauseIconButton.vue';
import ScrollToTopFab from './ui/ScrollToTopFab.vue';
import { getAlbumSublist, getPlaylistDetail, getPlaylistTrackAll, getRecentSongs, getRecentPlaylists, getRecentAlbums, getRecentVoices, getHistoryRecommendSongDates, getHistoryRecommendSongDetail, getSongDetailBatch, getVoiceDetail, toggleAlbumSubscribe, toggleDjSubscribe, togglePlaylistSubscribe, toggleSongLike } from '../api/music';
import { getUserCollectedPlaylist, getUserCreatedPlaylist, getUserLikeList, getUserPlaylist, getUserRecord } from '../api/auth';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { readLocalHistory, recordLocalHistoryEntry } from '../utils/localHistory';

const emit = defineEmits<{
  (e: 'open-podcast-list'): void;
  (e: 'open-podcast-detail', item: any): void;
  (e: 'open-playlist-detail', playlistId: number): void;
  (e: 'open-album-detail', albumId: number): void;
}>();

type TabKey = 'songs' | 'playlists' | 'albums' | 'podcasts';

type UserRecordItem = {
  playCount?: number;
  playTime?: number;
  time?: number;
  song?: any;
  songs?: any[];
  addTime?: number;
  resource?: any;
  data?: any;
};

type ListItem = {
  key: string;
  title: string;
  subtitle: string;
  source: string;
  sourceTip: string;
  summary: string;
  typeLabel: string;
  countLabel: string;
  updatedAt: string;
  playableLabel: string;
  playActionTip: string;
  coverUrl?: string;
  coverStyle?: Record<string, string>;
  playTracks?: Array<{ id: number; name: string; ar?: Array<{ name: string }>; al?: { name?: string; picUrl?: string } }>;
  playableItem?: any;
  manageType: 'song' | 'playlist' | 'album' | 'podcast';
  canUnlike?: boolean;
  canOpenDetail?: boolean;
  sortKey?: number;
};

const loading = ref(false);
const activeTab = ref<TabKey>('songs');
const selectedGroup = ref('songs-recent');
const songs = ref<ListItem[]>([]);
const playlists = ref<ListItem[]>([]);
const albums = ref<ListItem[]>([]);
const podcasts = ref<ListItem[]>([]);
const localSongs = ref<ListItem[]>([]);
const localPlaylists = ref<ListItem[]>([]);
const localAlbums = ref<ListItem[]>([]);
const localPodcasts = ref<ListItem[]>([]);
const selectedDetailCardKey = ref('source');
const manageFilter = ref<'all' | 'song' | 'playlist' | 'album' | 'podcast'>('all');
const sortBy = ref<'time-desc' | 'time-asc' | 'name-asc'>('time-desc');
const selectedKeys = ref<string[]>([]);
const favoriteSongs = ref<ListItem[]>([]);
const historySource = ref<'local' | 'cloud'>('local');
const lastRecordedTrackId = ref(0);

const fallbackCover = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="32" fill="#e2e8f0"/><circle cx="100" cy="84" r="40" fill="#cbd5e1"/><rect x="46" y="136" width="108" height="20" rx="10" fill="#cbd5e1"/></svg>`);

const tabs = computed(() => {
  const source = historySource.value === 'local'
    ? { songs: localSongs.value, playlists: localPlaylists.value, albums: localAlbums.value, podcasts: localPodcasts.value }
    : { songs: songs.value, playlists: playlists.value, albums: albums.value, podcasts: podcasts.value };
  return [
    { key: 'songs' as const, title: '歌曲', count: source.songs.length },
    { key: 'playlists' as const, title: '歌单', count: source.playlists.length },
    { key: 'albums' as const, title: '专辑', count: source.albums.length },
    { key: 'podcasts' as const, title: '播客', count: source.podcasts.length },
  ];
});

const leftItems = computed(() => {
  const source = historySource.value === 'local'
    ? { songs: localSongs.value, playlists: localPlaylists.value, albums: localAlbums.value, podcasts: localPodcasts.value }
    : { songs: songs.value, playlists: playlists.value, albums: albums.value, podcasts: podcasts.value };
  const base = activeTab.value === 'songs' ? source.songs : activeTab.value === 'playlists' ? source.playlists : activeTab.value === 'albums' ? source.albums : source.podcasts;
  const filtered = manageFilter.value === 'all' ? base : base.filter((item) => item.manageType === manageFilter.value);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy.value === 'name-asc') return a.title.localeCompare(b.title, 'zh-Hans-CN');
    const aKey = Number(a.sortKey || 0);
    const bKey = Number(b.sortKey || 0);
    return sortBy.value === 'time-asc' ? aKey - bKey : bKey - aKey;
  });
  return sorted;
});

const leftPanelTitle = computed(() => ({ songs: '歌曲', playlists: '歌单', albums: '专辑', podcasts: '播客' }[activeTab.value]));
const activeDetail = computed(() => leftItems.value.find((item) => item.key === selectedGroup.value) || leftItems.value[0]);
const detailActionTitle = computed(() => {
  const type = activeDetail.value?.manageType;
  if (type === 'playlist') return '打开歌单详情';
  if (type === 'album') return '打开专辑详情';
  if (type === 'podcast') return '打开播客详情';
  return '收藏记录';
});
const podcastPreviewItems = computed(() => podcasts.value.slice(0, 4));

const manageTabs = computed(() => [
  { key: 'all' as const, label: '全部' },
  { key: 'song' as const, label: '歌曲' },
  { key: 'playlist' as const, label: '歌单' },
  { key: 'album' as const, label: '专辑' },
  { key: 'podcast' as const, label: '播客' },
]);

const detailCards = computed(() => {
  const item = activeDetail.value;
  return [
    { title: '来源摘要', desc: item?.sourceTip || '当前内容来自网易云 API。', key: 'source' },
    { title: '播放动作', desc: item?.playActionTip || '可直接进入播放或先恢复上下文。', key: 'play' },
    { title: '收藏上下文', desc: item?.summary || '用于回溯历史与后续定制。', key: 'summary' },
  ];
});

function hydrateLocalHistory() {
  const payload = readLocalHistory();
  localSongs.value = payload.song as ListItem[];
  localPlaylists.value = payload.playlist as ListItem[];
  localAlbums.value = payload.album as ListItem[];
  localPodcasts.value = payload.podcast as ListItem[];
  if (import.meta.env.DEV) {
    console.debug('[history-local-debug] hydrate', {
      songs: localSongs.value.length,
      playlists: localPlaylists.value.length,
      albums: localAlbums.value.length,
      podcasts: localPodcasts.value.length,
    });
  }
}

async function hydratePlaylistTrackCount(items: ListItem[], cookie?: string): Promise<ListItem[]> {
  return Promise.all(items.map(async (item) => {
    const playlistId = getItemApiId(item);
    if (!playlistId) return item;
    if (item.key.endsWith('-empty')) return item;
    try {
      const detailRes = await getPlaylistDetail(playlistId, 1, cookie);
      if (import.meta.env.DEV) {
        console.debug('[playlist-detail-debug]', item.title, {
          playlistId,
          resKeys: Object.keys(detailRes || {}),
          dataKeys: Object.keys((detailRes as any)?.data || {}),
          playlist: (detailRes as any)?.data?.playlist || (detailRes as any)?.playlist,
        });
      }
      const playlist = (detailRes as any)?.data?.playlist || (detailRes as any)?.playlist || {};
      const trackCount = Number(playlist.trackCount || 0);
      if (trackCount > 0) {
        const creatorName = item.subtitle.split('·')[1]?.trim() || playlist.creator?.nickname || '歌单';
        return {
          ...item,
          subtitle: `${trackCount} 首 · ${creatorName}`,
          countLabel: `${trackCount} 首`,
        };
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.debug('[playlist-detail-error]', item.title, err);
      }
    }
    return item;
  }));
}

function getLocalBucket(type: ListItem['manageType']) {
  if (type === 'song') return localSongs;
  if (type === 'playlist') return localPlaylists;
  if (type === 'album') return localAlbums;
  return localPodcasts;
}

function recordLocalHistoryItem(item: ListItem) {
  const nextItem = recordLocalHistoryEntry(item) as ListItem;
  const bucket = getLocalBucket(item.manageType);
  const id = getItemApiId(nextItem) || getListItemSongId(nextItem);
  const identity = id ? String(id) : nextItem.key;
  bucket.value = [nextItem, ...bucket.value.filter((entry) => String(getItemApiId(entry) || getListItemSongId(entry) || entry.key) !== identity)].slice(0, 120);
  if (import.meta.env.DEV) console.debug('[history-local-debug] record item', item.manageType, identity, nextItem.countLabel);
}

function recordCurrentTrackFromPlayer() {
  const track = playerStore.state.currentTrack;
  const trackId = Number(track?.id || playerStore.state.currentSongId || 0);
  if (!track || !trackId || track.source === 'podcast' || track.podcast?.rid || lastRecordedTrackId.value === trackId) return;
  lastRecordedTrackId.value = trackId;
  recordLocalHistoryItem(buildSongItem(track, 0));
}

async function setHistorySource(source: 'local' | 'cloud') {
  if (source === 'local') {
    hydrateLocalHistory();
    localPlaylists.value = await hydratePlaylistTrackCount(localPlaylists.value, userStore.state.loginCookie || undefined);
  }
  historySource.value = source;
  selectedGroup.value = '';
  selectedKeys.value = [];
}

function safeText(value: any, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function buildGradient(index: number) {
  return { background: `linear-gradient(135deg, hsl(${(index * 71) % 360} 80% 58%), hsl(${(index * 71 + 38) % 360} 72% 42%))` };
}

function extractApiList(payload: any): any[] {
  const candidates = [
    payload?.data?.data?.dates,
    payload?.data?.data?.songs,
    payload?.data?.data?.list,
    payload?.data?.data?.records,
    payload?.data?.data,
    payload?.data?.dates,
    payload?.data?.songs,
    payload?.data?.list,
    payload?.data?.records,
    payload?.data?.playlist,
    payload?.data?.albums,
    payload?.data,
    payload?.list,
    payload?.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function settleList(request: Promise<any>) {
  try {
    return extractApiList(await request);
  } catch {
    return [];
  }
}

function deepFindString(value: any, keys: string[], options?: { urlOnly?: boolean; skip?: string[] }) {
  const seen = new WeakSet<object>();
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const skipSet = new Set((options?.skip || []).map((item) => item.toLowerCase()));

  function visit(node: any): string {
    if (!node || typeof node !== 'object') return '';
    if (seen.has(node)) return '';
    seen.add(node);

    for (const [rawKey, rawValue] of Object.entries(node)) {
      const key = rawKey.toLowerCase();
      if (!keySet.has(key) || typeof rawValue !== 'string') continue;
      const text = rawValue.trim();
      if (!text || skipSet.has(text.toLowerCase())) continue;
      if (options?.urlOnly && !/^https?:\/\//i.test(text)) continue;
      return text;
    }

    for (const child of Object.values(node)) {
      const result = visit(child);
      if (result) return result;
    }

    return '';
  }

  return visit(value);
}

function deepFindNumber(value: any, keys: string[]) {
  const seen = new WeakSet<object>();
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  function visit(node: any): number {
    if (!node || typeof node !== 'object') return 0;
    if (seen.has(node)) return 0;
    seen.add(node);

    for (const [rawKey, rawValue] of Object.entries(node)) {
      const key = rawKey.toLowerCase();
      if (!keySet.has(key)) continue;
      const numeric = Number(rawValue);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }

    for (const child of Object.values(node)) {
      const result = visit(child);
      if (result) return result;
    }

    return 0;
  }

  return visit(value);
}

function logVoiceShape(label: string, value: any) {
  if (!import.meta.env.DEV) return;
  const root = value && typeof value === 'object' ? value : {};
  const data = (root as any).data || {};
  const resource = (data as any).resource || (root as any).resource || {};
  const detail = (root as any).detail || {};
  // eslint-disable-next-line no-console
  console.debug('[history-voice-debug]', label, {
    rootKeys: Object.keys(root).slice(0, 24),
    dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 24) : [],
    resourceKeys: resource && typeof resource === 'object' ? Object.keys(resource).slice(0, 24) : [],
    detailKeys: detail && typeof detail === 'object' ? Object.keys(detail).slice(0, 24) : [],
  });
}

function buildSongItem(item: any, index: number): ListItem {
  const track = item.data || item.resource || item.song || item;
  const trackId = Number(track.id || item.resourceId || item.id || 0);
  const timeValue = Number(item.playTime || item.time || item.createTime || item.addTime || Date.now() - index);
  return {
    key: `songs-${trackId || index}`,
    title: safeText(track.name, `最近播放 ${index + 1}`),
    subtitle: safeText(track.ar?.[0]?.name || track.artists?.[0]?.name || item.creator?.nickname, '最近播放歌曲'),
    source: 'record_recent_song / history recommend',
    sourceTip: '最近播放-歌曲接口 /record/recent/song',
    summary: safeText(track.al?.name || track.album?.name || item.reason, '歌曲历史数据'),
    typeLabel: '歌曲历史',
    countLabel: String(item.playCount || item.count || 1),
    updatedAt: String(timeValue),
    playableLabel: '单曲播放',
    playActionTip: '将当前歌曲加入播放器并直接播放。',
    coverUrl: track.al?.picUrl || track.album?.picUrl || item.coverUrl,
    coverStyle: buildGradient(index),
    playTracks: trackId ? [{ id: trackId, name: track.name, ar: track.ar || track.artists || [], al: track.al || track.album || {} }] : undefined,
    playableItem: trackId ? { ...track, id: trackId } : track,
    manageType: 'song',
    canUnlike: Boolean(trackId),
    sortKey: timeValue,
  };
}

function buildFavoriteSongItem(track: any, index: number): ListItem {
  const trackId = Number(track.id || 0);
  const likedTrack = { ...track, liked: true, isLiked: true };
  return {
    key: `favorite-${trackId || index}`,
    title: safeText(track.name, `收藏歌曲 ${index + 1}`),
    subtitle: safeText(track.ar?.map?.((artist: any) => artist.name).filter(Boolean).join(' / ') || track.artists?.[0]?.name, '我的收藏'),
    source: 'likelist / song_detail',
    sourceTip: '喜欢音乐列表与歌曲详情接口',
    summary: safeText(track.al?.name || track.album?.name, '收藏歌曲'),
    typeLabel: '收藏歌曲',
    countLabel: '收藏',
    updatedAt: '最近',
    playableLabel: '单曲播放',
    playActionTip: '点击即可播放收藏歌曲。',
    coverUrl: track.al?.picUrl || track.album?.picUrl,
    coverStyle: buildGradient(index),
    playTracks: trackId ? [{ id: trackId, name: track.name, ar: track.ar || track.artists || [], al: track.al || track.album || {}, liked: true, isLiked: true }] : undefined,
    playableItem: trackId ? { ...likedTrack, id: trackId } : likedTrack,
    manageType: 'song',
    canUnlike: Boolean(trackId),
    sortKey: Date.now() - index,
  };
}

function buildPlaylistItem(item: any, index: number, sourceName: string, sourceTip: string): ListItem {
  const playlist = item.data?.resource || item.resource || item.playlist || item.data || item;
  const playlistId = Number(playlist.id || item.resourceId || item.id || deepFindNumber(item, ['playlistId', 'resourceId', 'id']) || 0);
  const timeValue = Number(item.playTime || item.time || playlist.updateTime || item.updateTime || playlist.lastUpdateTime || playlist.createTime || item.createTime || Date.now() - index);
  const title = playlist.name || playlist.title || deepFindString(item, ['playlistName', 'name', 'title'], { skip: ['歌单'] });
  const coverUrl = playlist.coverImgUrl || playlist.picUrl || playlist.coverUrl || playlist.cover || deepFindString(item, ['coverImgUrl', 'coverUrl', 'picUrl', 'cover', 'imgUrl'], { urlOnly: true });
  const trackCount = Number(playlist.trackCount || item.trackCount || deepFindNumber(item, ['trackCount', 'songCount']) || 0);
  const creatorName = playlist.creator?.nickname || playlist.user?.nickname || item.creator?.nickname || deepFindString(item, ['nickname', 'creatorName', 'userName']);
  return {
    key: `playlists-${playlistId || index}-${sourceName}`,
    title: safeText(title, `歌单 ${index + 1}`),
    subtitle: `${trackCount} 首 · ${creatorName || '歌单'}`,
    source: sourceName,
    sourceTip,
    summary: safeText(playlist.description || item.description || deepFindString(item, ['description', 'desc']), '歌单历史数据'),
    typeLabel: '歌单历史',
    countLabel: `${trackCount} 首`,
    updatedAt: String(timeValue),
    playableLabel: '歌单播放',
    playActionTip: '会优先载入歌单中的前几首歌曲到播放器。',
    coverUrl,
    coverStyle: buildGradient(index),
    playableItem: playlistId ? { ...playlist, id: playlistId } : playlist,
    manageType: 'playlist',
    canUnlike: Boolean(playlist.subscribed || item.subscribed || sourceName.includes('collect')),
    canOpenDetail: Boolean(playlistId),
    sortKey: timeValue,
  };
}

function buildAlbumItem(item: any, index: number): ListItem {
  const album = item.data?.resource || item.resource || item.album || item.data || item;
  const albumId = Number(album.id || item.resourceId || item.id || deepFindNumber(item, ['albumId', 'resourceId', 'id']) || 0);
  const timeValue = Number(item.playTime || item.time || album.subTime || album.publishTime || album.createTime || item.subTime || item.publishTime || item.createTime || Date.now() - index);
  const title = album.name || album.title || deepFindString(item, ['albumName', 'name', 'title'], { skip: ['专辑'] });
  const artistName = album.artist?.name || album.artists?.[0]?.name || item.artist?.name || item.artistName || deepFindString(item, ['artistName', 'nickname', 'creatorName']);
  const coverUrl = album.picUrl || album.blurPicUrl || album.coverUrl || album.cover || album.coverImgUrl || deepFindString(item, ['picUrl', 'blurPicUrl', 'coverUrl', 'cover', 'coverImgUrl', 'imgUrl'], { urlOnly: true });
  return {
    key: `albums-${albumId || index}`,
    title: safeText(title, `专辑 ${index + 1}`),
    subtitle: safeText(artistName, '收藏专辑'),
    source: 'album/sublist / record_recent_album',
    sourceTip: '专辑收藏与最近播放专辑接口',
    summary: safeText(album.alias?.join?.(' / ') || album.description || item.description || deepFindString(item, ['description', 'desc']), '专辑历史数据'),
    typeLabel: '专辑历史',
    countLabel: '专辑',
    updatedAt: String(timeValue),
    playableLabel: '专辑浏览',
    playActionTip: '专辑通常先进入详情页，再选择其中曲目播放。',
    coverUrl,
    coverStyle: buildGradient(index),
    playableItem: albumId ? { ...album, id: albumId } : album,
    manageType: 'album',
    canUnlike: true,
    canOpenDetail: Boolean(albumId),
    sortKey: timeValue,
  };
}

function buildPodcastItem(item: any, index: number): ListItem {
  const resource = item.data?.resource || item.resource || item.voice || item.program || item.data || item;
  const baseInfo = resource.baseInfo || item.data?.baseInfo || item.baseInfo || {};
  const detail = item.detail || item.data?.detail || resource.detail || item.data?.data || {};
  const detailBaseInfo = detail.baseInfo || detail.voice?.baseInfo || detail.data?.baseInfo || {};
  const detailVoice = detail.voice || detail.data?.voice || detail.data || {};
  const program = detailVoice.program || resource.program || resource.voice || detailVoice || resource;
  const radio = program.radio || resource.radio || detailVoice.radio || detailBaseInfo.radio || baseInfo.radio || item.radio;
  const anchor = detailVoice.anchorInfo || detailVoice.anchor || resource.anchorInfo || resource.anchor || detailBaseInfo.anchorInfo || baseInfo.anchorInfo || baseInfo.anchor || resource.creator || program.dj || resource.dj;
  const mainSong = detailVoice.simpleSong || detailBaseInfo.simpleSong || resource.simpleSong || baseInfo.simpleSong || program.mainSong || resource.mainSong || program.song || resource.song;
  const voiceId = Number(detailBaseInfo.id || detailVoice.id || baseInfo.id || program.id || resource.id || item.resourceId || item.id || mainSong?.id || deepFindNumber(item, ['voiceId', 'resourceId', 'vid', 'id']) || 0);
  const timeValue = Number(item.playTime || item.time || item.data?.playTime || item.resource?.playTime || resource.playTime || resource.updateTime || Date.now() - index);
  const title = detailBaseInfo.name || detailBaseInfo.title || detailVoice.name || detailVoice.title || baseInfo.name || baseInfo.title || program.name || program.title || resource.name || resource.title || mainSong?.name || deepFindString(item, ['voiceName', 'programName', 'name', 'title'], { skip: ['声音', '播客'] });
  const coverUrl = detailBaseInfo.coverUrl || detailBaseInfo.cover || detailBaseInfo.picUrl || detailVoice.coverUrl || detailVoice.cover || detailVoice.picUrl || baseInfo.coverUrl || baseInfo.cover || baseInfo.picUrl || program.coverUrl || program.blurCoverUrl || radio?.picUrl || resource.coverUrl || resource.cover || resource.picUrl || resource.coverImgUrl || resource.imgUrl || mainSong?.al?.picUrl || deepFindString(item, ['coverUrl', 'cover', 'picUrl', 'coverImgUrl', 'imgUrl', 'avatarUrl'], { urlOnly: true });
  return {
    key: `podcasts-${voiceId || index}`,
    title: safeText(title, `声音 ${index + 1}`),
    subtitle: safeText(radio?.name || detailBaseInfo.radioName || baseInfo.radioName || resource.radioName || anchor?.nickname || anchor?.name || resource.creator?.nickname || deepFindString(item, ['radioName', 'nickname', 'creatorName', 'artistName', 'userName']), '最近播放声音'),
    source: 'record_recent_voice',
    sourceTip: '最近播放-声音接口 /record/recent/voice',
    summary: safeText(detailBaseInfo.description || detailVoice.description || baseInfo.description || program.description || resource.description || item.reason, '声音历史数据'),
    typeLabel: '声音历史',
    countLabel: '声音',
    updatedAt: String(timeValue),
    playableLabel: '声音播放',
    playActionTip: '声音条目会直接载入播放器并继续播放。',
    coverUrl,
    coverStyle: buildGradient(index),
    playTracks: mainSong?.id ? [{ id: Number(mainSong.id), name: mainSong.name, ar: mainSong.ar || mainSong.artists || [], al: mainSong.al || mainSong.album || {} }] : undefined,
    playableItem: { ...resource, ...detailVoice, id: voiceId || detailVoice.id || resource.id, radio, program, baseInfo: { ...baseInfo, ...detailBaseInfo } },
    manageType: 'podcast',
    canUnlike: Boolean(radio?.subed || resource.subed),
    canOpenDetail: Boolean(radio?.id || program.radio?.id || resource.radioId || baseInfo.radioId || resource.id || voiceId),
    sortKey: timeValue,
  };
}

async function loadFavoriteSongs(uid: number, cookie?: string) {
  try {
    const allUserPlaylists = await settleList(getUserPlaylist(uid, cookie));
    const likedPlaylist = allUserPlaylists.find((item: any) => Number(item.userId || item.creator?.userId || 0) === Number(uid) && /喜欢的音乐|我喜欢|liked/i.test(String(item.name || '')))
      || allUserPlaylists.find((item: any) => Number(item.userId || item.creator?.userId || 0) === Number(uid));

    if (likedPlaylist?.id) {
      const trackRes = await getPlaylistTrackAll({ id: Number(likedPlaylist.id), limit: 200, offset: 0, cookie });
      const tracks = (trackRes as any)?.data?.songs || (trackRes as any)?.data?.playlist?.tracks || (trackRes as any)?.data?.tracks || [];
      if (Array.isArray(tracks) && tracks.length) {
        favoriteSongs.value = tracks.map((track: any, index: number) => buildFavoriteSongItem(track, index));
        const likedIdsFromPlaylist = tracks.map((track: any) => Number(track?.id || 0)).filter((id: number) => id > 0);
        if (likedIdsFromPlaylist.length) {
          userStore.state.likedSongIds = [...new Set([...userStore.state.likedSongIds, ...likedIdsFromPlaylist])];
        }
        return;
      }
    }
  } catch {
    // fallback to likelist below
  }

  try {
    const likeRes = await getUserLikeList(uid);
    const likedIds = extractApiList(likeRes).length ? extractApiList(likeRes) : ((likeRes as any)?.data?.ids || (likeRes as any)?.data?.data?.ids || []);
    const ids = (Array.isArray(likedIds) ? likedIds : []).map((id: any) => Number(id)).filter(Boolean).slice(0, 160);
    if (!ids.length) {
      favoriteSongs.value = [];
      return;
    }

    const detailRes = await getSongDetailBatch(ids);
    const tracks = (detailRes as any)?.data?.songs || [];
    favoriteSongs.value = tracks.map((track: any, index: number) => buildFavoriteSongItem(track, index));
    const likedIdsFromDetail = tracks.map((track: any) => Number(track?.id || 0)).filter((id: number) => id > 0);
    if (likedIdsFromDetail.length) {
      userStore.state.likedSongIds = [...new Set([...userStore.state.likedSongIds, ...likedIdsFromDetail])];
    }
  } catch {
    favoriteSongs.value = [];
  }
}

async function hydrateVoiceItems(items: any[], cookie?: string) {
  const baseItems = items;
  const hydrated = await Promise.all(baseItems.map(async (item) => {
    const preview = buildPodcastItem(item, 0);
    const hasRealTitle = !/^声音 \d+$/.test(preview.title);
    if (!hasRealTitle || !preview.coverUrl) logVoiceShape('recent-preview-missing', item);
    if (hasRealTitle && preview.coverUrl) return item;

    const voiceId = Number(preview.playableItem?.baseInfo?.id || preview.playableItem?.id || item.resourceId || item.id || item.data?.resourceId || item.data?.resource?.id || deepFindNumber(item, ['voiceId', 'resourceId', 'vid', 'id']) || 0);
    if (!voiceId) return item;

    try {
      const detailRes = await getVoiceDetail(voiceId, cookie);
      const detailPayload = detailRes?.data || detailRes;
      logVoiceShape('voice-detail', detailPayload);
      return { ...item, detail: detailPayload };
    } catch {
      return item;
    }
  }));
  return hydrated;
}

async function loadRecentByGrowingLimit(fetcher: (limit: number, cookie?: string) => Promise<any>, cookie?: string, options?: { initialLimit?: number; step?: number; maxLimit?: number }) {
  const initialLimit = options?.initialLimit ?? 50;
  const step = options?.step ?? 50;
  const maxLimit = options?.maxLimit ?? 500;
  let limit = initialLimit;
  let previousLength = -1;
  let latest: any[] = [];

  while (limit <= maxLimit) {
    // eslint-disable-next-line no-await-in-loop
    const current = await settleList(fetcher(limit, cookie));
    latest = current;
    if (current.length < limit || current.length === previousLength) break;
    previousLength = current.length;
    limit += step;
  }

  return latest;
}

async function loadAlbumSublistAll(cookie?: string) {
  const limit = 50;
  let offset = 0;
  const result: any[] = [];

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const page = await settleList(getAlbumSublist({ limit, offset, cookie }));
    if (!page.length) break;
    result.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return result;
}

async function loadHistoryRecommendSongsAll(cookie?: string) {
  const result: any[] = [];
  const dateRes = await getHistoryRecommendSongDates(cookie);
  const dates = extractApiList(dateRes);
  for (const dateItem of dates) {
    const date = dateItem?.time || dateItem?.date || dateItem;
    if (!date) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const detailRes = await getHistoryRecommendSongDetail(String(date), cookie);
      result.push(...extractApiList(detailRes));
    } catch {
      // keep loading remaining dates
    }
  }
  return result;
}

async function refreshAll() {
  loading.value = true;
  try {
    const uid = userStore.state.profile?.userId;
    const cookie = userStore.state.loginCookie || undefined;
    if (uid) {
      await loadFavoriteSongs(uid, cookie);
    } else {
      favoriteSongs.value = [];
    }

    const [created, collected, albumListRaw, voiceListRaw, recentSongListRaw, recentPlaylistListRaw, recentAlbumListRaw] = await Promise.all([
      uid ? settleList(getUserCreatedPlaylist(uid, 50, 0, cookie)) : Promise.resolve([]),
      uid ? settleList(getUserCollectedPlaylist(uid, 50, 0, cookie)) : Promise.resolve([]),
      loadAlbumSublistAll(cookie),
      loadRecentByGrowingLimit(getRecentVoices, cookie, { initialLimit: 50, step: 50, maxLimit: 500 }),
      loadRecentByGrowingLimit(getRecentSongs, cookie, { initialLimit: 50, step: 50, maxLimit: 500 }),
      loadRecentByGrowingLimit(getRecentPlaylists, cookie, { initialLimit: 50, step: 50, maxLimit: 500 }),
      loadRecentByGrowingLimit(getRecentAlbums, cookie, { initialLimit: 50, step: 50, maxLimit: 500 }),
    ]);

    let recentSongsRaw: any[] = [];
    try {
      recentSongsRaw = await loadHistoryRecommendSongsAll(cookie);
    } catch {
      // fallback below
    }

    const combinedSongSource = [...recentSongsRaw, ...recentSongListRaw].filter(Boolean);
    songs.value = combinedSongSource.map((item: any, index: number) => buildSongItem(item, index));
    if (!songs.value.length) songs.value = [{ ...buildSongItem({ name: '暂无歌曲记录' }, 0), key: 'songs-empty', subtitle: '接口未返回歌曲历史', summary: '后续可继续按文档补充更精细的歌曲历史。', manageType: 'song', canUnlike: false, canOpenDetail: false, sortKey: Date.now() }];

    let createdPlaylists: any[] = [];
    let collectedPlaylists: any[] = [];
    if (uid) {
      createdPlaylists = created.filter((item: any) => Number(item.userId || item.creator?.userId || 0) === Number(uid));
      collectedPlaylists = collected.filter((item: any) => Number(item.userId || item.creator?.userId || 0) !== Number(uid));
    } else {
      createdPlaylists = created;
      collectedPlaylists = collected;
    }
    if (uid && (!createdPlaylists.length || !collectedPlaylists.length)) {
      const allUserPlaylists = await settleList(getUserPlaylist(uid, cookie));
      if (allUserPlaylists.length) {
        const fallbackCreated = allUserPlaylists.filter((item: any) => Number(item.userId || item.creator?.userId || 0) === Number(uid));
        const fallbackCollected = allUserPlaylists.filter((item: any) => Number(item.userId || item.creator?.userId || 0) !== Number(uid));
        if (!createdPlaylists.length) createdPlaylists = fallbackCreated;
        if (!collectedPlaylists.length) collectedPlaylists = fallbackCollected;
      }
    }

    void created;
    void collected;

    // 先获取所有歌单的 trackCount，再一次性构建完整列表
    const rawPlaylists = (recentPlaylistListRaw as any[])
      .filter((item) => {
        const candidate = item?.data?.resource || item?.resource || item?.playlist || item?.data || item;
        return !/喜欢的音乐|我喜欢|liked/i.test(String(candidate?.name || ''));
      });
    
    // 并行获取所有歌单的 trackCount
    const playlistTrackCounts = await Promise.all(rawPlaylists.map(async (item, index) => {
      const tempItem = buildPlaylistItem(item, index, 'record_recent_playlist', '最近播放歌单接口');
      const playlistId = getItemApiId(tempItem);
      if (!playlistId || tempItem.key.endsWith('-empty')) return { index, trackCount: 0 };
      try {
        const detailRes = await getPlaylistDetail(playlistId, 1, cookie);
        const playlist = (detailRes as any)?.data?.playlist || (detailRes as any)?.playlist || {};
        return { index, trackCount: Number(playlist.trackCount || 0), creatorName: playlist.creator?.nickname };
      } catch {
        return { index, trackCount: 0 };
      }
    }));
    
    // 构建完整的歌单列表
    playlists.value = rawPlaylists.map((item, index) => {
      const built = buildPlaylistItem(item, index, 'record_recent_playlist', '最近播放歌单接口');
      const info = playlistTrackCounts.find(p => p.index === index);
      if (info && info.trackCount > 0) {
        const creatorName = built.subtitle.split('·')[1]?.trim() || info.creatorName || '歌单';
        return {
          ...built,
          subtitle: `${info.trackCount} 首 · ${creatorName}`,
          countLabel: `${info.trackCount} 首`,
        };
      }
      return built;
    });
    
    if (!playlists.value.length) playlists.value = [{ ...buildPlaylistItem({ name: '暂无歌单记录' }, 0, 'record_recent_playlist', '最近播放歌单接口'), key: 'playlists-empty', subtitle: '接口未返回最近播放歌单', summary: '后续有播放歌单后会自动显示。', canUnlike: false, canOpenDetail: false, sortKey: Date.now() }];

    const recentAlbumCombined = [...recentAlbumListRaw, ...albumListRaw].filter(Boolean);
    albums.value = (Array.isArray(recentAlbumCombined) ? recentAlbumCombined : []).map((item: any, index: number) => buildAlbumItem(item, index));
    if (!albums.value.length) albums.value = [{ ...buildAlbumItem({ name: '暂无专辑记录' }, 0), key: 'albums-empty', subtitle: '接口未返回收藏专辑', summary: '后续可根据账号状态补充更完整内容。', manageType: 'album', canUnlike: false, canOpenDetail: false, sortKey: Date.now() }];

    const hydratedVoiceList = await hydrateVoiceItems(Array.isArray(voiceListRaw) ? voiceListRaw : [], cookie);
    if (hydratedVoiceList[0]) logVoiceShape('voice-hydrated-first', hydratedVoiceList[0]);
    podcasts.value = hydratedVoiceList.map((item: any, index: number) => buildPodcastItem(item, index));
    if (!podcasts.value.length) podcasts.value = [{ ...buildPodcastItem({ name: '暂无声音记录' }, 0), key: 'podcasts-empty', subtitle: '接口未返回最近播放声音', summary: '后续可继续接入声音详情与恢复动作。', manageType: 'podcast', canUnlike: false, canOpenDetail: false, sortKey: Date.now() }];

    hydrateLocalHistory();
    selectedGroup.value = songs.value[0]?.key || playlists.value[0]?.key || albums.value[0]?.key || podcasts.value[0]?.key || 'songs-empty';
    selectedKeys.value = [];
  } finally {
    loading.value = false;
  }
}

function getItemApiId(item: ListItem) {
  if (item.manageType === 'podcast') {
    return Number(item.playableItem?.radio?.id || item.playableItem?.program?.radio?.id || item.playableItem?.dj?.id || item.playableItem?.id || 0);
  }
  return Number(item.playableItem?.id || 0);
}

function selectItem(item: ListItem) {
  selectedGroup.value = item.key;
}

function toggleSelectItem(item: ListItem) {
  selectedKeys.value = selectedKeys.value.includes(item.key)
    ? selectedKeys.value.filter((key) => key !== item.key)
    : [...selectedKeys.value, item.key];
}

function selectDetailCard(card: { key: string }) {
  selectedDetailCardKey.value = card.key;
}

function clearSelection() {
  selectedKeys.value = [];
}

function selectVisibleAll() {
  selectedKeys.value = leftItems.value.map((item) => item.key);
}

async function removeSelected() {
  const targets = leftItems.value.filter((item) => selectedKeys.value.includes(item.key) && item.canUnlike);
  if (!targets.length) return;

  const removed = new Set<string>();
  for (const item of targets) {
    const id = getItemApiId(item);
    if (!id) continue;

    if (item.manageType === 'song') {
      // eslint-disable-next-line no-await-in-loop
      await toggleSongLike({ id, like: false, uid: userStore.state.profile?.userId, cookie: userStore.state.loginCookie || undefined });
    } else if (item.manageType === 'playlist') {
      // eslint-disable-next-line no-await-in-loop
      await togglePlaylistSubscribe({ id, subscribe: false, cookie: userStore.state.loginCookie || undefined });
    } else if (item.manageType === 'album') {
      // eslint-disable-next-line no-await-in-loop
      await toggleAlbumSubscribe({ id, subscribe: false, cookie: userStore.state.loginCookie || undefined });
    } else if (item.manageType === 'podcast') {
      // eslint-disable-next-line no-await-in-loop
      await toggleDjSubscribe({ rid: id, subscribe: false, cookie: userStore.state.loginCookie || undefined });
    }

    removed.add(item.key);
  }

  if (!removed.size) return;
  songs.value = songs.value.filter((item) => !removed.has(item.key));
  playlists.value = playlists.value.filter((item) => !removed.has(item.key));
  albums.value = albums.value.filter((item) => !removed.has(item.key));
  podcasts.value = podcasts.value.filter((item) => !removed.has(item.key));
  selectedKeys.value = selectedKeys.value.filter((key) => !removed.has(key));
  selectedGroup.value = leftItems.value[0]?.key || '';
}

function openSelectedPlaylistDetail() {
  const item = activeDetail.value;
  if (!item) return;
  recordLocalHistoryItem(item);

  if (item.manageType === 'playlist') {
    const playlistId = getItemApiId(item);
    if (playlistId) emit('open-playlist-detail', playlistId);
    return;
  }

  if (item.manageType === 'album') {
    const albumId = getItemApiId(item);
    if (albumId) emit('open-album-detail', albumId);
    return;
  }

  if (item.manageType === 'podcast') {
    openPodcastPreview(item);
  }
}

function openManageItem(item: ListItem) {
  selectedGroup.value = item.key;
  toggleSelectItem(item);
}

function playPlaylistFirstTrack(item: ListItem) {
  recordLocalHistoryItem(item);
  const playlistId = getItemApiId(item);
  if (!playlistId) return;
  void getPlaylistTrackAll({ id: playlistId, limit: 12, offset: 0 }).then(async (res) => {
    const tracks = (res as any)?.data?.songs || (res as any)?.data?.playlist?.tracks || (res as any)?.data?.tracks || [];
    const playTracks = tracks.slice(0, 12).map((track: any) => ({
      id: track.id,
      name: track.name,
      ar: track.ar || track.artists || [],
      al: track.al || track.album || {}
    }));
    if (!playTracks.length) return;
    playerStore.setPlaylist(playTracks, 0);
    await playerStore.playByIndex(0);
    playerStore.openExpanded();
  });
}

function playListItem(item: ListItem, list: ListItem[], index: number) {
  if (item.manageType !== 'song') {
    recordLocalHistoryItem(item);
  }

  if (item.manageType === 'playlist' && activeTab.value === 'playlists') {
    const playlistId = getItemApiId(item);
    if (playlistId) emit('open-playlist-detail', playlistId);
    return;
  }

  if (item.manageType === 'album' && activeTab.value === 'albums') {
    const albumId = getItemApiId(item);
    if (albumId) emit('open-album-detail', albumId);
    return;
  }

  if (item.manageType === 'podcast' && activeTab.value === 'podcasts') {
    openPodcastPreview(item);
    return;
  }

  if (item.manageType === 'song') {
    recordLocalHistoryItem(item);
  }

  const tracks = list
    .map((entry) => entry.playTracks?.[0] || entry.playableItem)
    .filter((track) => Number(track?.id || 0));
  if (!tracks.length) return;
  const targetId = Number((item.playTracks?.[0] || item.playableItem)?.id || 0);
  const startIndex = Math.max(0, tracks.findIndex((track: any) => Number(track.id || 0) === targetId));
  playerStore.setPlaylist(tracks, startIndex >= 0 ? startIndex : index);
  void playerStore.playByIndex(startIndex >= 0 ? startIndex : index);
}

function getListItemSongId(item: ListItem) {
  return Number(item.playTracks?.[0]?.id || item.playableItem?.id || 0);
}

function isListItemLiked(item: ListItem) {
  const songId = getListItemSongId(item);
  return songId > 0 && userStore.state.likedSongIds.includes(songId);
}

function getHistoryCount(item: ListItem) {
  if (historySource.value !== 'local') return '';
  const value = Number(item.countLabel || 0);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function openPodcastPreview(item: ListItem) {
  if (!item?.playableItem) return;
  emit('open-podcast-detail', item.playableItem);
}

function getPodcastPreviewBadge(item: ListItem) {
  return /书|小说|读物|有声/i.test(`${item.title} ${item.subtitle} ${item.summary}`) ? '有声书' : '播客';
}

function playCurrent() {
  const item = activeDetail.value;
  if (!item) return;

  if (activeTab.value === 'songs' || activeTab.value === 'podcasts') {
    const track = item.playTracks?.[0] || item.playableItem;
    if (!track?.id) return;
    playerStore.setPlaylist(item.playTracks || [track], 0);
    void playerStore.playByIndex(0);
    playerStore.openExpanded();
    return;
  }

  if (activeTab.value === 'playlists') {
    const playlistId = Number(item.playableItem?.id || 0);
    if (!playlistId) return;
    void getPlaylistTrackAll({ id: playlistId, limit: 12, offset: 0 }).then(async (res) => {
      const tracks = (res as any)?.data?.songs || (res as any)?.data?.playlist?.tracks || (res as any)?.data?.tracks || [];
      const list = tracks.slice(0, 12).map((track: any) => ({ id: track.id, name: track.name, ar: track.ar || track.artists || [], al: track.al || track.album || {} }));
      if (!list.length) return;
      playerStore.setPlaylist(list, 0);
      await playerStore.playByIndex(0);
      playerStore.openExpanded();
    });
    return;
  }

  if (activeTab.value === 'albums') {
    // 专辑先只负责恢复到详情，不直接播放整张专辑，避免误操作
    restoreCurrent();
  }
}

function restoreCurrent() {
  selectedGroup.value = activeDetail.value?.key || selectedGroup.value;
  if (activeTab.value === 'songs' && activeDetail.value?.playTracks?.length) {
    playerStore.setPlaylist(activeDetail.value.playTracks, 0);
  }
}

onMounted(() => {
  hydrateLocalHistory();
  recordCurrentTrackFromPlayer();
  refreshAll();
});

watch(
  () => [playerStore.state.currentSongId, playerStore.state.isPlaying] as const,
  ([songId, isPlaying]) => {
    if (isPlaying && Number(songId || 0) > 0) recordCurrentTrackFromPlayer();
  },
);
</script>

<style scoped>
.history-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text-main);
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.collection-history-shell {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(420px, 1fr);
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.collection-panel {
  min-height: 0;
  padding: var(--layout-card-padding);
  padding-top: calc(var(--layout-card-padding) + 8px);
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-surface);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: var(--space-3);
  overflow: hidden;
}

.collection-panel--favorites {
  grid-template-rows: auto minmax(0, 1fr);
}

.collection-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.collection-panel__header h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.collection-panel__header p {
  margin: var(--space-1) 0 0;
  color: var(--text-sub);
  font-size: 13px;
}

.history-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.history-tabs,
.history-source-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-muted) 74%, transparent);
}

.history-chip,
.source-chip {
  height: 30px;
  min-width: 58px;
  padding: 0 var(--space-3);
  border-radius: 999px;
  border: 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  font-weight: 700;
}

.source-chip {
  min-width: 72px;
}

.history-chip.active,
.source-chip.active {
  color: var(--text-main) !important;
  background: var(--button-surface-active-bg, rgba(255, 255, 255, 0.9)) !important;
  border-color: var(--button-surface-active-border, var(--accent)) !important;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08) !important;
}

.collection-list {
  min-height: 0;
  display: grid;
  align-content: start;
  grid-auto-rows: min-content;
  gap: var(--space-2);
  overflow: auto;
  padding: var(--space-2) var(--space-1) var(--space-3) 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
}

.collection-list::-webkit-scrollbar {
  width: 6px;
}

.collection-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.42);
}

.collection-row {
  min-width: 0;
  width: 100%;
  min-height: 62px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: transform 180ms ease-out, background 180ms ease-out, border-color 180ms ease-out, box-shadow 180ms ease-out;
}

.collection-row:hover,
.collection-row.active {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--bg-surface) 54%, transparent);
  border-color: color-mix(in srgb, var(--border) 58%, transparent);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.07);
}

.collection-cover {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-muted);
  display: block;
}

.collection-cover img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.collection-row__main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.collection-row__main strong,
.collection-row__main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collection-row__main strong {
  font-size: var(--text-label-md);
  font-weight: 800;
}

.collection-row__main span {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}

.history-row {
  grid-template-columns: 46px minmax(0, 1fr) auto 32px;
}

.history-row__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.history-row__actions :deep(.play-icon-btn),
.collection-row :deep(.play-icon-btn),
.history-row__actions :deep(.bookmark-icon-button) {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}

.history-count {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  text-align: center;
}

.collection-empty {
  padding: var(--space-5);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  color: var(--text-sub);
  text-align: center;
  font-size: 13px;
}

@media (max-width: 1180px) {
  .collection-history-shell {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }

  .history-page {
    overflow: auto;
  }

  .collection-panel {
    min-height: 520px;
  }
}

@media (max-width: 767px) {
  .collection-panel {
    padding: var(--space-4);
    border-radius: 20px;
  }

  .history-controls {
    align-items: flex-start;
  }

  .history-row {
    grid-template-columns: 42px minmax(0, 1fr) auto;
  }

  .history-count {
    display: none;
  }
}
</style>
