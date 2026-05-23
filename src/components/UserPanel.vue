<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="user-page user-page--fixed">
    <div v-if="!isLogin" class="empty-state">
      <LoginPanel />
    </div>

    <UserSplitView
      v-else
      v-model:activeTab="activeTab"
      v-model:playlistSubTab="playlistSubTab"
      :detail="detail"
      :profile="profileMeta"
      :playlist-items="currentPlaylistItems"
      :album-items="albumItems"
      :selected-item="selectedItem"
      :show-cloud-tab="!isPublicUserMode"
      :show-album-tab="!isPublicUserMode"
      :show-podcast-tab="!isPublicUserMode"
      :dj-items="currentDjItems"
      :fill-sub-tabs="isPublicUserMode"
      @select-item="handleSelectItem"
    >
      <template #detail="{ item }">
        <PlaylistDetailPage
          v-if="activeTab === 'playlists' && (playlistSubTab === 'created' || playlistSubTab === 'collected')"
          :playlist-id="item.id"
          back-label="返回用户中心"
          :embedded="true"
          @back="selectedItem = null"
          @open-artist="(artist) => emit('open-artist', artist)"
          @open-comment="(songId) => emit('open-comment', songId)"
        />

        <AlbumDetailPage
          v-else-if="activeTab === 'playlists' && playlistSubTab === 'albums'"
          :album-id="item.id"
          back-label="返回用户中心"
          :embedded="true"
          @back="selectedItem = null"
          @open-artist="(artist) => emit('open-artist', artist)"
        />

        <PodcastDetailPage
          v-else-if="activeTab === 'playlists' && playlistSubTab === 'podcast'"
          :detail="djDetail"
          :items="djDetailItems"
          :loading="djDetailLoading"
          :embedded="true"
          @back="selectedItem = null"
          @play-item="playPodcastItem"
          @play-all="playPodcastAll"
        />

        <PlaylistDetailPage
          v-else-if="activeTab === 'cloud'"
          :playlist-id="0"
          back-label="返回用户中心"
          :embedded="true"
          :injected-playlist="cloudPseudoPlaylist"
          @back="selectedItem = null"
          @open-artist="(artist) => emit('open-artist', artist)"
        />
      </template>
    </UserSplitView>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AnimatedAppear from './AnimatedAppear.vue';
import LoginPanel from './LoginPanel.vue';
import UserSplitView from './UserSplitView.vue';
import PlaylistDetailPage from './PlaylistDetailPage.vue';
import AlbumDetailPage from './AlbumDetailPage.vue';
import PodcastDetailPage from './PodcastDetailPage.vue';
import { getUserCollectedPlaylist, getUserCreatedPlaylist, getUserDetail, getUserPlaylist } from '../api/auth';
import { getAlbumDetail, getAlbumSublist, getCloudStorage, getCloudStorageDetail, getDjDetail, getDjProgram, getDjSublist, getSongUrl } from '../api/music';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();

const emit = defineEmits<{ (e: 'open-playlist', playlistId: number, returnPage?: string): void; (e: 'open-artist', artist: any): void; (e: 'open-comment', songId: number): void }>();

const loading = ref(false);
const detail = ref<any>(null);
const createdPlaylists = ref<any[]>([]);
const collectedPlaylists = ref<any[]>([]);
const albumItems = ref<any[]>([]);
const djSublist = ref<any[]>([]);
const djDetailLoading = ref(false);
const djDetail = ref<any>(null);
const djDetailItems = ref<any[]>([]);
const cloudPlaylists = ref<any[]>([]);
const cloudDetailItems = ref<any[]>([]);
const cloudLoading = ref(false);
const cloudTitle = computed(() => '我的云盘');
const cloudPseudoPlaylist = computed(() => ({
  name: '我的云盘',
  coverImgUrl: cloudPlaylists.value[0]?.coverImgUrl || profileMeta.value.avatarUrl || '',
  description: `${profileMeta.value.nickname} 的云盘歌曲`,
  creator: { nickname: profileMeta.value.nickname, avatarUrl: profileMeta.value.avatarUrl },
  trackCount: cloudPlaylists.value.length,
  tracks: cloudPlaylists.value,
}));
const activeTab = ref<'playlists' | 'cloud'>('playlists');
const playlistSubTab = ref<'created' | 'collected' | 'albums' | 'podcast'>('created');
const selectedItem = ref<any>(null);
const albumSongs = ref<any[]>([]);
const albumLoading = ref(false);
const albumError = ref('');

const isLogin = computed(() => userStore.state.isLogin);
const isPublicUserMode = computed(() => userStore.state.loginMode === 'uid');
const profileMeta = computed(() => ({
  avatarUrl: detail.value?.profile?.avatarUrl || userStore.state.profile?.avatarUrl || '',
  nickname: detail.value?.profile?.nickname || userStore.state.profile?.nickname || '未命名用户',
  signature: detail.value?.profile?.signature || '这里展示用户简介与登录状态信息',
}));

const currentPlaylistItems = computed(() => {
  if (playlistSubTab.value === 'created') return createdPlaylists.value.map(normalizePlaylistItem);
  if (playlistSubTab.value === 'collected') return collectedPlaylists.value.map(normalizePlaylistItem);
  if (playlistSubTab.value === 'albums') return albumItems.value;
  return [];
});

const currentDjItems = computed(() => {
  return djSublist.value.map((item: any) => ({
    ...item,
    id: item.id ?? 0,
    name: item.name || item.title || '播客',
    subtitle: `${item.subCount ?? item.programCount ?? 0} 期`,
    coverImgUrl: item.picUrl || item.coverImgUrl || item.coverUrl || '',
    type: 'djradio',
    source: 'dj',
  }));
});

const activeDetailItem = computed(() => {
  if (activeTab.value === 'cloud') return cloudPseudoPlaylist.value || null;
  if (playlistSubTab.value === 'podcast') return currentDjItems.value[0] || null;
  return currentPlaylistItems.value[0] || null;
});

watch(
  activeDetailItem,
  (item) => {
    if (item) selectedItem.value = item;
  },
  { immediate: true },
);

watch(activeTab, async (tab) => {
  if (tab === 'cloud' && !cloudPlaylists.value.length) {
    await loadCloudData();
  }
});

watch([activeTab, playlistSubTab], () => {
  if (activeTab.value === 'playlists') {
    if (playlistSubTab.value === 'podcast') {
      selectedItem.value = currentDjItems.value[0] || null;
    } else {
      djDetail.value = null;
      djDetailItems.value = [];
      selectedItem.value = currentPlaylistItems.value[0] || null;
    }
  } else if (activeTab.value === 'cloud') {
    djDetail.value = null;
    djDetailItems.value = [];
    selectedItem.value = cloudPseudoPlaylist.value || null;
  }
});

watch(
  [currentPlaylistItems, cloudPseudoPlaylist, currentDjItems],
  ([playlistItems, cloudItem, djItems]) => {
    if (activeTab.value === 'playlists') {
      if (playlistSubTab.value === 'podcast') {
        const nextItems = Array.isArray(djItems) ? djItems : [];
        const currentId = selectedItem.value?.id;
        const matched = nextItems.find((item: any) => item?.id === currentId);
        selectedItem.value = matched || nextItems[0] || null;
      } else {
        const nextItems = Array.isArray(playlistItems) ? playlistItems : [];
        const currentId = selectedItem.value?.id;
        const matched = nextItems.find((item: any) => item?.id === currentId);
        selectedItem.value = matched || nextItems[0] || null;
      }
      return;
    }

    if (activeTab.value === 'cloud') {
      selectedItem.value = cloudItem || null;
    }
  },
  { immediate: true },
);

function normalizeCloudItem(item: any) {
  const source = item?.song || item?.simpleSong || item?.data?.[0] || item;
  const songName =
    item.songName ||
    item.name ||
    item.title ||
    source.name ||
    source.title ||
    source.songName ||
    source.name ||
    '云盘歌曲';
  const artists =
    item.ar?.map((a: any) => a.name).join(' / ') ||
    item.simpleSong?.ar?.map((a: any) => a.name).join(' / ') ||
    source.ar?.map((a: any) => a.name).join(' / ') ||
    item.artist ||
    item.singer ||
    source.artist ||
    source.singer ||
    '';
  const album =
    item.al?.name ||
    item.simpleSong?.al?.name ||
    source.al?.name ||
    item.album ||
    item.albumName ||
    source.album ||
    source.albumName ||
    '';
  const coverImgUrl =
    item.al?.picUrl ||
    item.al?.img1v1Url ||
    item.al?.coverImgUrl ||
    item.simpleSong?.al?.picUrl ||
    item.simpleSong?.al?.img1v1Url ||
    item.simpleSong?.al?.coverImgUrl ||
    source.al?.picUrl ||
    source.al?.img1v1Url ||
    source.al?.coverImgUrl ||
    item.coverImgUrl ||
    item.coverUrl ||
    item.picUrl ||
    item.blurPicUrl ||
    item.simpleSong?.coverImgUrl ||
    item.simpleSong?.coverUrl ||
    item.simpleSong?.picUrl ||
    source.coverImgUrl ||
    source.coverUrl ||
    source.picUrl ||
    source.blurPicUrl ||
    source.album?.picUrl ||
    source.album?.blurPicUrl ||
    '';
  const id = item.id || item.songId || item.musicId || item.trackId || source.id || source.songId || source.musicId || source.trackId;

  return {
    ...item,
    ...source,
    id,
    name: songName,
    subtitle: [artists, album].filter(Boolean).join(' · ') || item.description || source.description || '云盘歌曲',
    coverImgUrl,
    type: 'cloud',
    source: 'cloud',
    cloudSid: Number(item.simpleSong?.id || source.id || id),
    cloudOwnerId: Number(userStore.state.profile?.userId || 0),
  };
}

async function enrichCloudUrls(items: any[]) {
  const validIds = items.map((item) => item.id).filter(Boolean);
  if (!validIds.length) return items;
  const cookie = userStore.state.loginCookie || undefined;
  const urlRes = await Promise.all(
    validIds.map(async (id) => {
      try {
        // 云盘歌曲需要 cookie 才能获取播放地址
        const res = await getSongUrl(Number(id), cookie);
        const list = res.data?.data || res.data?.songs || res.data?.url || res.data || [];
        const target = Array.isArray(list) ? list[0] : list;
        return { id, url: target?.url || target?.data?.[0]?.url || '' };
      } catch {
        return { id, url: '' };
      }
    }),
  );
  const urlMap = new Map(urlRes.map((entry) => [String(entry.id), entry.url]));
  const result = items.map((item) => ({ ...item, url: urlMap.get(String(item.id)) || item.url || '' }));
  return result;
}

function normalizePlaylistArray(payload: any): any[] {
  const candidates = [payload?.data?.playlist, payload?.data?.data?.playlist, payload?.data?.playlists, payload?.data?.playlist?.playlist, payload?.playlist, payload?.playlists];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function normalizePlaylistItem(item: any) {
  const resolvedCover = resolveUserPlaylistCover(item);
  return {
    ...item,
    coverImgUrl: resolvedCover,
    picUrl: item.picUrl || resolvedCover,
    subtitle: `${item.trackCount || 0} 首`,
  };
}

function resolveUserPlaylistCover(item: any) {
  const fallbackCover = item?.coverImgUrl || item?.picUrl || item?.coverUrl || '';
  if (!isLikedSongsPlaylist(item)) return fallbackCover;

  const trackCover = item?.tracks?.[0]?.al?.picUrl || item?.tracks?.[0]?.album?.picUrl || item?.trackCover || item?.trackNumberUpdateTimeCover;
  return trackCover || fallbackCover;
}

function isLikedSongsPlaylist(item: any) {
  const name = String(item?.name || '').trim();
  return Boolean(item?.specialType === 5 || item?.specialType === '5' || name.endsWith('喜欢的音乐') || name === '我喜欢的音乐');
}

function logUserPanelDebug(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.debug('[user-panel-debug]', event, payload || {});
}

function normalizeCreatedCollectedPayload(payload: any): any[] {
  const candidates = [payload?.data?.playlist, payload?.data?.data?.playlist, payload?.data?.list, payload?.data?.data?.list, payload?.playlist, payload?.list];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function normalizeAlbumItems(payload: any) {
  const albumList = payload?.data?.data || payload?.data?.albums || payload?.data?.weekData || payload?.data || [];
  return Array.isArray(albumList)
    ? albumList.map((item: any) => ({
        ...item,
        name: item.name || item.albumName || item.title || '收藏专辑',
        subtitle: `${item.songCount ?? item.trackCount ?? item.size ?? item.subCount ?? item.albumSize ?? 0} 首`,
        coverImgUrl: item.picUrl || item.coverImgUrl || item.coverUrl || item.blurPicUrl || '',
        type: 'album',
        source: 'album',
      }))
    : [];
}

async function loadUserData() {
  if (!userStore.state.profile?.userId) return;
  loading.value = true;
  try {
    const uid = userStore.state.profile.userId;
    const detailRes = await getUserDetail(uid);
    const authCookie = userStore.state.loginMode === 'uid' ? '' : userStore.state.loginCookie || '';
    logUserPanelDebug('loadUserData:start', {
      uid,
      loginMode: userStore.state.loginMode,
      hasCookie: Boolean(authCookie),
      cookiePreview: authCookie ? `${authCookie.slice(0, 16)}...${authCookie.slice(-12)}` : '',
      activeTab: activeTab.value,
      playlistSubTab: playlistSubTab.value,
    });
    detail.value = detailRes.data || detailRes;

    if (isPublicUserMode.value) {
      const playlistRes = await getUserPlaylist(uid);
      const publicPlaylists = normalizePlaylistArray(playlistRes);
      createdPlaylists.value = publicPlaylists
        .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) === uid)
        .map(normalizePlaylistItem);
      collectedPlaylists.value = publicPlaylists
        .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) !== uid)
        .map(normalizePlaylistItem);
      logUserPanelDebug('loadUserData:publicModePlaylists', {
        playlistCount: publicPlaylists.length,
        createdCount: createdPlaylists.value.length,
        collectedCount: collectedPlaylists.value.length,
      });
      albumItems.value = [];
      djSublist.value = [];
      cloudPlaylists.value = [];
      cloudDetailItems.value = [];
      activeTab.value = 'playlists';
      if (playlistSubTab.value === 'albums' || playlistSubTab.value === 'podcast') playlistSubTab.value = 'created';
    } else {
      const [playlistRes, albumRes, cloudRes, djRes] = await Promise.allSettled([
        getUserPlaylist(uid),
        getAlbumSublist({ limit: 25, offset: 0, cookie: authCookie }),
        getCloudStorage({ limit: 1000, offset: 0, cookie: authCookie }),
        getDjSublist(authCookie),
      ]);

      logUserPanelDebug('loadUserData:cookieModeResponses', {
        playlistStatus: playlistRes.status,
        albumStatus: albumRes.status,
        cloudStatus: cloudRes.status,
        albumCode: albumRes.status === 'fulfilled' ? albumRes.value?.data?.code ?? null : null,
        cloudCode: cloudRes.status === 'fulfilled' ? cloudRes.value?.data?.code ?? null : null,
        albumKeys: albumRes.status === 'fulfilled' ? Object.keys(albumRes.value?.data || {}) : [],
        cloudKeys: cloudRes.status === 'fulfilled' ? Object.keys(cloudRes.value?.data || {}) : [],
      });

      const allPlaylists = playlistRes.status === 'fulfilled' ? normalizePlaylistArray(playlistRes.value) : [];
      createdPlaylists.value = allPlaylists
        .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) === uid)
        .map(normalizePlaylistItem);
      collectedPlaylists.value = allPlaylists
        .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) !== uid)
        .map(normalizePlaylistItem);

      if (!createdPlaylists.value.length || !collectedPlaylists.value.length) {
        const [createdRes, collectedRes] = await Promise.allSettled([
          getUserCreatedPlaylist(uid, 100, 0),
          getUserCollectedPlaylist(uid, 100, 0),
        ]);

        if (!createdPlaylists.value.length && createdRes.status === 'fulfilled') {
          const items = normalizeCreatedCollectedPayload(createdRes.value);
          createdPlaylists.value = items
            .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) === uid)
            .map(normalizePlaylistItem);
        }
        if (!collectedPlaylists.value.length && collectedRes.status === 'fulfilled') {
          const items = normalizeCreatedCollectedPayload(collectedRes.value);
          collectedPlaylists.value = items
            .filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) !== uid)
            .map(normalizePlaylistItem);
        }
      }

      albumItems.value = albumRes.status === 'fulfilled' ? normalizeAlbumItems(albumRes.value) : [];

      const djData = djRes.status === 'fulfilled'
        ? djRes.value?.data?.djRadios || djRes.value?.data?.data?.djRadios || djRes.value?.djRadios || []
        : [];
      djSublist.value = Array.isArray(djData) ? djData : [];

      const cloudList = cloudRes.status === 'fulfilled'
        ? cloudRes.value.data?.data || cloudRes.value.data?.list || cloudRes.value.data?.songs || cloudRes.value.data || []
        : [];
      const normalizedCloud = Array.isArray(cloudList) ? cloudList.map(normalizeCloudItem) : [];
      cloudDetailItems.value = normalizedCloud;
      cloudPlaylists.value = await enrichCloudUrls(normalizedCloud);

      logUserPanelDebug('loadUserData:cookieModeParsed', {
        createdCount: createdPlaylists.value.length,
        collectedCount: collectedPlaylists.value.length,
        albumCount: albumItems.value.length,
        djCount: djSublist.value.length,
        cloudCount: cloudPlaylists.value.length,
        firstAlbum: albumItems.value[0]?.name || null,
        firstCloud: cloudPlaylists.value[0]?.name || null,
      });
    }

    if (activeTab.value === 'playlists' && playlistSubTab.value === 'albums' && currentPlaylistItems.value.length) {
      selectedItem.value = currentPlaylistItems.value[0];
      await loadAlbumSongs(Number(selectedItem.value.id));
    } else if (activeTab.value === 'playlists' && playlistSubTab.value === 'podcast') {
      selectedItem.value = currentDjItems.value[0] || null;
    } else if (activeTab.value === 'playlists') {
      selectedItem.value = currentPlaylistItems.value[0] || null;
    } else if (activeTab.value === 'cloud' && cloudPlaylists.value.length) {
      selectedItem.value = cloudPseudoPlaylist.value;
    }
  } finally {
    loading.value = false;
  }
}

async function loadCloudData() {
  if (cloudLoading.value) return;
  const uid = userStore.state.profile?.userId;
  if (!uid) return;
  cloudLoading.value = true;
  try {
    const authCookie = userStore.state.loginMode === 'uid' ? '' : userStore.state.loginCookie || '';
    logUserPanelDebug('loadCloudData:start', {
      uid,
      loginMode: userStore.state.loginMode,
      hasCookie: Boolean(authCookie),
    });
    const cloudRes = await getCloudStorage({ limit: 1000, offset: 0, cookie: authCookie });
    logUserPanelDebug('loadCloudData:response', {
      code: cloudRes.data?.code ?? null,
      keys: Object.keys(cloudRes.data || {}),
    });
    const cloudList = cloudRes.data?.data || cloudRes.data?.list || cloudRes.data?.songs || cloudRes.data || [];
    const normalizedCloud = Array.isArray(cloudList) ? cloudList.map(normalizeCloudItem) : [];
    const ids = normalizedCloud.map((item: any) => item.id).filter(Boolean);
    let detailed = normalizedCloud;
    if (ids.length) {
      try {
        const cloudDetailRes = await getCloudStorageDetail(ids, authCookie);
        const cloudDetailList = cloudDetailRes.data?.data || cloudDetailRes.data?.songs || cloudDetailRes.data || [];
        const detailItems = Array.isArray(cloudDetailList) ? cloudDetailList.map(normalizeCloudItem) : [];
        const detailMap = new Map(detailItems.map((item: any) => [String(item.id), item]));
        detailed = normalizedCloud.map((item: any) => ({ ...item, ...(detailMap.get(String(item.id)) || {}) }));
      } catch {
        detailed = normalizedCloud;
      }
    }
    cloudDetailItems.value = detailed;
    cloudPlaylists.value = await enrichCloudUrls(detailed);
    logUserPanelDebug('loadCloudData:parsed', {
      rawCount: Array.isArray(cloudList) ? cloudList.length : 0,
      detailedCount: detailed.length,
      finalCount: cloudPlaylists.value.length,
      firstCloud: cloudPlaylists.value[0]?.name || null,
    });
    if (activeTab.value === 'cloud' && cloudPlaylists.value.length) {
      selectedItem.value = cloudPseudoPlaylist.value;
    }
  } finally {
    cloudLoading.value = false;
  }
}

async function playCloudItem(item: any) {
  if (!item) return;
  selectedItem.value = item;
  if (!item.url) {
    try {
      const res = await getSongUrl(Number(item.id));
      const list = res.data?.data || res.data?.songs || res.data?.url || res.data || [];
      const target = Array.isArray(list) ? list[0] : list;
      item.url = target?.url || target?.data?.[0]?.url || '';
    } catch {
      item.url = item.url || '';
    }
  }
  if (item.url) {
    playerStore.setPlaylist([item], 0);
    await playerStore.playTrack(item);
  }
}

async function loadAlbumSongs(albumId: number) {
  if (!albumId) return;
  albumLoading.value = true;
  albumError.value = '';
  albumSongs.value = [];
  try {
    const { data } = await getAlbumDetail(albumId);
    const detailData = data?.album;
    if (!detailData) {
      albumError.value = '专辑详情为空';
      return;
    }
    albumSongs.value = data?.songs || detailData.songs || [];
  } catch (e: any) {
    albumError.value = e?.message || '专辑歌曲加载失败';
  } finally {
    albumLoading.value = false;
  }
}

async function loadDjDetail(rid: number) {
  if (!rid) return;
  djDetailLoading.value = true;
  djDetailItems.value = [];
  try {
    const [detailRes, programRes] = await Promise.all([
      getDjDetail(rid),
      getDjProgram({ rid, limit: 100, offset: 0 }),
    ]);
    const detailData = detailRes.data?.data || detailRes.data || null;
    djDetail.value = detailData;
    const programs = programRes.data?.programs || programRes.data?.data?.programs || programRes.data?.data || [];
    djDetailItems.value = Array.isArray(programs) ? programs : [];
  } catch {
    djDetail.value = null;
    djDetailItems.value = [];
  } finally {
    djDetailLoading.value = false;
  }
}

function handleSelectItem(item: any) {
  selectedItem.value = item;
  if (activeTab.value === 'playlists' && playlistSubTab.value === 'albums') {
    void loadAlbumSongs(Number(item.id));
  }
  if (activeTab.value === 'playlists' && playlistSubTab.value === 'podcast') {
    void loadDjDetail(Number(item.id));
  }
}

function resolvePodcastRid(item: any) {
  return Number(item?.radio?.id || item?.program?.radio?.id || item?.dj?.id || djDetail.value?.id || djDetail.value?.radio?.id || 0);
}

function normalizePodcastPlayableTrack(item: any) {
  const mainTrackId = Number(item?.mainTrackId || item?.mainSong?.id || item?.song?.id || item?.program?.mainTrackId || item?.program?.mainSong?.id || 0);
  const rid = resolvePodcastRid(item);
  const programId = Number(item?.id || item?.voiceId || item?.programId || item?.program?.id || 0);
  const createTime = Number(item?.createTime || item?.program?.createTime || 0);
  if (!mainTrackId) return null;

  return {
    id: mainTrackId,
    name: item?.name || item?.programName || item?.title || item?.mainSong?.name || '播客节目',
    ar: [{ name: item?.radio?.name || item?.program?.radio?.name || djDetail.value?.name || '播客' }],
    al: {
      name: item?.radio?.name || item?.program?.radio?.name || djDetail.value?.name || '播客',
      picUrl: item?.coverUrl || item?.picUrl || item?.imgUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.radio?.picUrl || '',
    },
    source: 'podcast',
    description: (item?.description || item?.desc || item?.briefDesc || item?.program?.description || item?.program?.desc || item?.mainSong?.description || '').trim(),
    podcast: rid > 0 ? { rid, programId: programId > 0 ? programId : undefined, createTime: createTime > 0 ? createTime : undefined } : (programId > 0 ? { programId, createTime: createTime > 0 ? createTime : undefined } : (createTime > 0 ? { createTime } : undefined)),
  };
}

async function playPodcastItem(payload: { item: any; index: number }) {
  const playableTracks = djDetailItems.value.map(normalizePodcastPlayableTrack).filter(Boolean);
  if (!playableTracks.length) return;

  const targetTrackId = Number(payload?.item?.mainTrackId || payload?.item?.mainSong?.id || payload?.item?.song?.id || payload?.item?.program?.mainTrackId || payload?.item?.program?.mainSong?.id || 0);
  const startIndex = Math.max(0, playableTracks.findIndex((track: any) => Number(track?.id || 0) === targetTrackId));
  playerStore.setPlaylist(playableTracks, startIndex >= 0 ? startIndex : 0);
  await playerStore.playByIndex(startIndex >= 0 ? startIndex : 0);
}

async function playPodcastAll(items: any[]) {
  const playableTracks = (items || []).map(normalizePodcastPlayableTrack).filter(Boolean);
  if (!playableTracks.length) return;
  playerStore.setPlaylist(playableTracks, 0);
  await playerStore.playByIndex(0);
}

function openPlaylist(playlistId: number) {
  if (!playlistId) return;
  emit('open-playlist', playlistId, 'user');
}

onMounted(loadUserData);

watch(
  () => userStore.state.profile?.userId,
  () => {
    selectedItem.value = null;
    void loadUserData();
  },
);

watch(
  isPublicUserMode,
  (enabled) => {
    selectedItem.value = null;
    cloudPlaylists.value = [];
    cloudDetailItems.value = [];
    djSublist.value = enabled ? [] : djSublist.value;
    albumItems.value = enabled ? [] : albumItems.value;
    djDetail.value = null;
    djDetailItems.value = [];

    if (enabled) {
      activeTab.value = 'playlists';
      if (playlistSubTab.value === 'albums' || playlistSubTab.value === 'podcast') playlistSubTab.value = 'created';
    }

    void loadUserData();
  },
);

watch(
  () => selectedItem.value?.id,
  (id) => {
    if (activeTab.value === 'playlists' && playlistSubTab.value === 'albums' && id) {
      void loadAlbumSongs(Number(id));
    }
    if (activeTab.value === 'playlists' && playlistSubTab.value === 'podcast' && id) {
      void loadDjDetail(Number(id));
    }
  },
);
</script>

<style scoped>
@import '../styles/detail-page.css';

.user-page { display: grid; gap: var(--space-4); color: var(--text-main); height: 100%; min-height: 0; overflow: hidden; }
.user-page--fixed { max-height: 100%; }
.empty-state { min-height: 0; height: 100%; display: grid; align-content: start; overflow: auto; padding-right: var(--space-1); }
.user-page--fixed :deep(.split-stage) {
  min-height: 0;
  height: calc(100vh - 220px);
  max-height: calc(100vh - 220px);
}

.user-page--fixed :deep(.left-panel),
.user-page--fixed :deep(.detail-panel) {
  height: 100%;
  max-height: 100%;
}
</style>
