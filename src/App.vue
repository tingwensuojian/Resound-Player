<template>
  <div
    class="layout"
    :style="layoutVars"
  >
    <Sidebar
      v-show="!isNarrow || sidebarOpen"
      :active-key="sidebarActiveKey"
      :collapsed="isTablet ? !sidebarOpen : (!isNarrow && sidebarCollapsed)"
      :overlay="isTablet && sidebarOpen"
      @update:collapsed="sidebarCollapsed = $event"
      @select="onSelectMenu"
      @close="sidebarOpen = false"
    />

    <transition name="overlay-fade">
      <div
        v-if="(isNarrow || isTablet) && sidebarOpen"
        class="sidebar-overlay"
        @click="sidebarOpen = false"
      />
    </transition>

    <div class="main-area">
      <TopBar
        :can-go-back="navHistory.canGoBack.value"
        :can-go-forward="navHistory.canGoForward.value"
        @search-submit="openSearchPage"
        @user-click="openUserLogin"
        @open-settings-page="() => openSettings('playback')"
        @nav-back="onNavBack"
        @nav-forward="onNavForward"
      />

      <main class="content" :class="{ 'content--user-page': activePage === 'user', 'content--hero-sticky': isHeroStickyPage }" :style="contentStyle">
        <div class="content-shell">
          <KeepAlive :include="keepAliveNames">
          <HomePanel
            v-if="activePage === 'home'"
            @open-detail="(id) => openPlaylistDetail(id, undefined, 'home')"
            @open-daily-list="openDailyList"
            @open-album-detail="(albumId) => openAlbumDetail(albumId, 'home')"
            @open-playlist-category="openPlaylistByCategory"
            @open-search="openSearchPage"
            @open-artist="openArtistFromHome"
            @open-user="openUserFromHome"
            @open-mv-player="openMvFromSearch"
            @open-podcast-detail="(item) => openPodcastDetail(item, 'home')"
          />
          <SearchPage
            v-else-if="activePage === 'search'"
            :disabled="!apiReady"
            @open-album-detail="(albumId) => openAlbumDetail(albumId, 'search')"
            @open-playlist-detail="(playlistId) => openPlaylistDetail(playlistId, undefined, 'search')"
            @open-podcast-detail="openPodcastDetail"
            @open-user="openUserFromSearch"
            @open-artist="openArtistFromSearch"
            @open-mv-player="openMvFromSearch"
          />
          <PlaylistPanel
            v-else-if="activePage === 'playlist'"
            :initial-cat="playlistInitialCategory"
            @open-detail="(id) => openPlaylistDetail(id, undefined, 'home')"
          />
          <PlaylistDetailPage
            v-else-if="activePage === 'playlist-detail'"
            :playlist-id="activePlaylistId"
            :injected-playlist="dailyInjectedPlaylist"
            :back-label="playlistBackLabel"
            @back="backToPlaylist"
            @open-artist="openArtistFromDetail"
            @open-comment="openSongComment"
            @open-album="(albumId) => openAlbumDetail(albumId, 'playlist-detail')"
            @open-language="(language) => openLanguageDetail(language, activePage)"
            @open-mv-player="openMvFromSearch"
            @open-user="openUserFromComment"
          />
          <AlbumDetailPage
            v-else-if="activePage === 'album-detail'"
            :album-id="activeAlbumId"
            :back-label="albumBackLabel"
            @back="backToAlbum"
            @open-artist="openArtistFromDetail"
            @open-comment="openSongComment"
            @open-album="(albumId) => openAlbumDetail(albumId, 'album-detail')"
            @open-language="(language) => openLanguageDetail(language, activePage)"
            @open-mv-player="openMvFromSearch"
            @open-user="openUserFromComment"
          />
          <ArtistDetailPage
            v-else-if="activePage === 'artist-detail'"
            :artist-id="activeArtistId"
            :back-label="artistBackLabel"
            :initial-tab="artistActiveTabState"
            @update:active-tab="artistActiveTabState = $event"
            @back="backToArtist"
            @open-album-detail="(albumId, tab) => { artistActiveTabState = tab || 'songs'; openAlbumDetail(albumId, 'artist-detail'); }"
            @open-artist="openArtistDetail($event, 'artist-detail')"
            @open-comment="openSongComment"
            @open-mv-player="openMvFromSearch"
            @open-language="(language) => openLanguageDetail(language, activePage)"
          />
          <UserDetailPage
            v-else-if="activePage === 'user-detail'"
            :user-id="activeUserId"
            :back-label="userBackLabel"
            @back="backToUserDetail"
            @open-playlist-detail="(playlistId) => openPlaylistDetail(playlistId, undefined, 'user-detail')"
          />
          <RankPanel v-else-if="activePage === 'rank'" @open-detail="openRankDetail" @open-artist="openArtistFromRank" />
          <PlaylistDetailPage
            v-else-if="activePage === 'rank-detail'"
            :playlist-id="activeRankId"
            back-label="返回排行榜"
            @back="backToRank"
            @open-artist="openArtistFromRank"
            @open-user="openUserFromComment"
          />
          <MvPlayPage v-else-if="activePage === 'mv-play'" :mv="activeMvItem" :back-label="mvBackLabel" @back="goBackFromMvPlay" @open-user="openUserFromComment" />
          <MvPanel v-else-if="activePage === 'mv'" :initial-mv="activeMvItem" @open-user="openUserFromComment" @play-mv="openMvFromSearch" />
          <UserPanel
            v-else-if="activePage === 'user'"
            class="user-page-host"
            @open-podcast-list="() => openPodcastList('user')"
            @open-playlist="(playlistId) => openPlaylistDetail(playlistId, undefined, 'user')"
            @open-artist="openArtistFromDetail"
            @open-comment="(songId) => openSongComment(songId, 'user')"
          />
          <HistoryPanel
            v-else-if="activePage === 'history'"
            class="history-page-host"
            @open-podcast-list="() => openPodcastList('history')"
            @open-podcast-detail="(item) => openPodcastDetail(item, 'history')"
            @open-playlist-detail="(playlistId) => openPlaylistDetail(playlistId, undefined, 'history')"
            @open-album-detail="(albumId) => openAlbumDetail(albumId, 'history')"
          />
          <StatsPage v-else-if="activePage === 'stats'" @open-artist="openArtistFromDetail" />
          <PodcastListPage
            v-else-if="activePage === 'podcast-list'"
            :items="podcastItems"
            :recent-items="podcastRecentItems"
            :subscribed-items="podcastSubscribedItems"
            :category-options="podcastCategoryOptions"
            :active-category="activePodcastCategory"
            :loading="podcastLoading"
            @back="backToPodcastSource"
            @open-detail="(item) => openPodcastDetail(item, activePodcastSourcePage)"
            @change-category="openPodcastCategory"
            @open-category="openPodcastCategoryPage"
            @open-curated-page="openPodcastCategoryPage"
            @open-subscribed-page="openPodcastSubscribedPage"
          />
          <PodcastSubscribedPage
            v-else-if="activePage === 'podcast-subscribed'"
            :items="podcastSubscribedItems"
            @back="backToPodcastSubscribedSource"
            @open-detail="(item) => openPodcastDetail(item, podcastSubscribedPageSource)"
          />
          <PodcastCategoryPage
            v-else-if="activePage === 'podcast-category' && activePodcastCategoryInfo"
            :category="activePodcastCategoryInfo"
            @back="backToPodcastCategorySource"
            @open-detail="(item) => openPodcastDetail(item, 'podcast-list')"
          />
          <PodcastDetailPage
            v-else-if="activePage === 'podcast-detail'"
            :title="activePodcastTitle"
            :detail="podcastDetailInfo"
            :items="podcastDetailItems"
            :loading="podcastDetailLoading"
            @back="backToPodcastDetailSource"
            @play-item="playPodcastItem"
            @play-all="playPodcastAll"
            @open-user="openUserFromComment"
          />
          <SongCommentPage v-else-if="activePage === 'song-comment'" :song-id="activeSongId" @back="goBackFromComment" @open-artist="openArtistFromComment" @open-album="(albumId) => openAlbumDetail(albumId, 'song-comment')" @play-song="playSongFromComment" @open-user="openUserFromComment" />
          <SettingsPage v-else-if="activePage === 'settings'" :initial-tab="settingsInitialTab" @go-login="openUserLogin" />
          <LanguageDetailPage v-else-if="activePage === 'language-detail'" :language-name="activeLanguage" :back-label="activeLanguageReturnPage === 'song-comment' ? '评论' : undefined" @back="backToLanguage" @open-detail="(playlistId) => openPlaylistDetail(playlistId, undefined, activePage)" />
          <LocalMusicHub v-else-if="activePage === 'local-music' && platform.isDesktop" />
          <LocalPlaylistDetailPage v-else-if="activePage === 'local-playlist-detail' && platform.isDesktop" />
          <PlaceholderPanel v-else-if="activePage" :page-key="activePage" />
        </KeepAlive>
        </div>
      </main>
      <ScrollToTopFab v-if="showBackToTop" :fixed="true" :scroll-host-selector="backToTopScrollHost" />
    </div>

    <PlayerBar v-show="!playerStore.state.expanded" />
    <PlayQueuePanel />
    <PlayerExpanded
      @open-artist="openArtistFromPlayer"
      @open-album="(albumId) => { playerStore.closeExpanded(); openAlbumDetail(albumId, activePage); }"
      @open-user="openUserFromComment"
      @open-podcast-detail="(item) => { playerStore.closeExpanded(); openPodcastDetail(item); }"
    />
    <LoginModal />
  </div>
</template>

<script setup lang="ts">
import { computed, KeepAlive, onBeforeUnmount, onMounted, watch, ref, defineAsyncComponent } from 'vue';
import { platform } from './utils/platform';
import { injectDeviceTierCSS } from './utils/deviceDetector';
import { toggleFpsOverlay } from './utils/performance';
import HomePanel from './components/HomePanel.vue';
import PlayerBar from './components/PlayerBar.vue';
import PlayQueuePanel from './components/PlayQueuePanel.vue';
import PlayerExpanded from './components/PlayerExpanded.vue';
import PlaceholderPanel from './components/PlaceholderPanel.vue';
import ScrollToTopFab from './components/ui/ScrollToTopFab.vue';
import PlaylistDetailPage from './components/PlaylistDetailPage.vue';
import AlbumDetailPage from './components/AlbumDetailPage.vue';
import ArtistDetailPage from './components/ArtistDetailPage.vue';
import UserDetailPage from './components/UserDetailPage.vue';
import PlaylistPanel from './components/PlaylistPanel.vue';
import SearchPage from './components/SearchPage.vue';
import RankPanel from './components/RankPanel.vue';
import MvPanel from './components/MvPanel.vue';
import LoginModal from './components/LoginModal.vue';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';

/* ---- 二级页面懒加载 ---- */
const UserPanel = defineAsyncComponent(() => import('./components/UserPanel.vue'));
const HistoryPanel = defineAsyncComponent(() => import('./components/HistoryPanel.vue'));
const SettingsPage = defineAsyncComponent(() => import('./components/SettingsPage.vue'));
const StatsPage = defineAsyncComponent(() => import('./components/StatsPage.vue'));
const SongCommentPage = defineAsyncComponent(() => import('./components/SongCommentPage.vue'));
const MvPlayPage = defineAsyncComponent(() => import('./components/MvPlayPage.vue'));
const LanguageDetailPage = defineAsyncComponent(() => import('./components/LanguageDetailPage.vue'));
const LocalMusicHub = defineAsyncComponent(() => import('./components/LocalMusicHub.vue'));
const LocalSongsPage = defineAsyncComponent(() => import('./views/LocalSongsPage.vue'));
const LocalArtistsPage = defineAsyncComponent(() => import('./views/LocalArtistsPage.vue'));
const LocalAlbumsPage = defineAsyncComponent(() => import('./views/LocalAlbumsPage.vue'));
const LocalFoldersPage = defineAsyncComponent(() => import('./views/LocalFoldersPage.vue'));
const LocalPlaylistsPage = defineAsyncComponent(() => import('./views/LocalPlaylistsPage.vue'));
const LocalPlaylistDetailPage = defineAsyncComponent(() => import('./views/LocalPlaylistDetailPage.vue'));
const LocalStatsPage = defineAsyncComponent(() => import('./views/LocalStatsPage.vue'));
const PodcastListPage = defineAsyncComponent(() => import('./components/PodcastListPage.vue'));
const PodcastCategoryPage = defineAsyncComponent(() => import('./components/PodcastCategoryPage.vue'));
const PodcastDetailPage = defineAsyncComponent(() => import('./components/PodcastDetailPage.vue'));
const PodcastSubscribedPage = defineAsyncComponent(() => import('./components/PodcastSubscribedPage.vue'));
import { waitForApiReady } from './api/client';
import { getDjCategoryRecommend, getDjDetail, getDjProgram, getDjRecommend, getDjRecommendType, getDjSublist, getRecentDj, getSongDetail, getVoiceListDetail, getVoiceListItems, getVoiceListSearch } from './api/music';
import { usePlayerStore } from './stores/player';
const playerStore = usePlayerStore();
import { useUiStore } from './stores/ui';
const uiStore = useUiStore();
import { apiCache } from './stores/apiCache';
import { useUserStore } from './stores/user';
const userStore = useUserStore();
import { recordLocalHistoryEntry } from './utils/localHistory';
import { useNavigationHistory } from './composables/useNavigationHistory';
import { useLoginModalStore } from './stores/loginModal';
const loginModalStore = useLoginModalStore();

const navHistory = useNavigationHistory();

const activePage = ref('');  // 初始为空，登录验证完成后再切到首页
const activePlaylistId = ref(0);
const activeSongId = ref(0);
const activeSongCommentReturnPage = ref('playlist-detail');
const activeAlbumId = ref(0);
const activeArtistId = ref(0);
const artistActiveTabState = ref('songs');
const activeUserId = ref(0);
const activeUserReturnPage = ref('search');
const activeRankId = ref(0);
const activeMvItem = ref<any>(null);
const activeMvReturnPage = ref('playlist');
const activePlaylistReturnPage = ref('playlist');
const activeAlbumReturnPage = ref('home');
const activeArtistReturnPage = ref('search');
const activeArtistIdStack = ref<number[]>([]);
const podcastItems = ref<any[]>([]);
const podcastRecentItems = ref<any[]>([]);
const podcastSubscribedItems = ref<any[]>([]);
const podcastCategoryOptions = ref<any[]>([]);
const activePodcastCategory = ref<number | null>(null);
const activePodcastCategoryInfo = ref<{ id: number; name: string } | null>(null);
const podcastSubscribedPageSource = ref<'user' | 'history' | 'podcast-list' | 'home'>('podcast-list');
const podcastDetailInfo = ref<any>(null);
const podcastDetailItems = ref<any[]>([]);
const podcastLoading = ref(false);
const podcastDetailLoading = ref(false);
const activePodcastTitle = ref('');
const activePodcastSourcePage = ref<'user' | 'history' | 'podcast-list' | 'home'>('podcast-list');
const activePodcastCategorySourcePage = ref<'user' | 'history' | 'podcast-list' | 'home'>('podcast-list');
const activePodcastDetailSourcePage = ref<'user' | 'history' | 'podcast-list' | 'home'>('podcast-list');
const playlistInitialCategory = ref('');
const dailyListSongs = ref<any[]>([]);
const dailyInjectedPlaylist = ref<any>(null);
const activeLanguage = ref('');
const activeLanguageReturnPage = ref('home');
const apiReady = ref(false);
const isNarrow = ref(false);
const isTablet = ref(false);
const sidebarOpen = ref(true);
const sidebarCollapsed = ref(false);
type SettingsInitialTab = 'playback' | 'appearance' | 'local' | 'account' | 'about';

const settingsInitialTab = ref<SettingsInitialTab>('appearance');

const layoutVars = computed<Record<string, string>>(() => {
  if (isNarrow.value) {
    return {
      '--sidebar-width': sidebarOpen.value ? '220px' : '0px',
      '--layout-gap': sidebarOpen.value ? '8px' : '0px',
      '--content-max-width': '100%',
      '--content-padding': '14px',
    };
  }

  if (isTablet.value) {
    return {
      '--sidebar-width': sidebarOpen.value ? '220px' : '76px',
      '--layout-gap': '8px',
      '--content-max-width': '100%',
      '--content-padding': '12px',
    };
  }

  return {
    '--sidebar-width': sidebarCollapsed.value ? '76px' : '220px',
    '--layout-gap': '8px',
    '--content-max-width': '100%',
    '--content-padding': '14px',
  };
});

const sidebarActiveKey = computed(() => {
  if (activePage.value === 'playlist-detail') return 'playlist';
  if (activePage.value === 'rank-detail') return 'rank';
  if (['podcast-category', 'podcast-detail', 'podcast-subscribed'].includes(activePage.value)) return 'podcast-list';
  return activePage.value;
});

const isHeroStickyPage = computed(() => ['playlist-detail', 'rank-detail', 'artist-detail', 'album-detail', 'user-detail', 'language-detail', 'podcast-detail'].includes(activePage.value));
const showBackToTop = computed(() => isHeroStickyPage.value || ['history', 'user', 'mv', 'playlist', 'rank', 'search', 'podcast-list', 'podcast-subscribed', 'podcast-category', 'song-comment'].includes(activePage.value));
// 详情页（isHeroStickyPage）使用 .page-content-scroll 作为滚动容器，非详情页使用 .content
const backToTopScrollHost = computed(() => isHeroStickyPage.value ? '.page-content-scroll' : '.content');
const contentStyle = computed<Record<string, string>>(() => ({}));

// ── 页面缓存策略（方案二：KeepAlive + include 显式控制）──
// 核心页面缓存，切换时不销毁重建；详情页每次进入重新加载
const keepAlivePages = new Set([
  'home', 'search', 'playlist', 'rank', 'user',
  'history', 'settings', 'mv', 'podcast-list', 'stats',
]);
// KeepAlive include 匹配组件名需与文件导出的 __name（PascalCase）一致
// 不能通过 pattern 自动推导，因为组件命名不统一（Panel vs Page）
const PAGE_TO_COMPONENT: Record<string, string> = {
  'home': 'HomePanel',
  'search': 'SearchPage',
  'playlist': 'PlaylistPanel',
  'rank': 'RankPanel',
  'user': 'UserPanel',
  'history': 'HistoryPanel',
  'settings': 'SettingsPage',
  'mv': 'MvPanel',
  'podcast-list': 'PodcastListPage',
  'stats': 'StatsPage',
};
const keepAliveNames = computed(() =>
  [...keepAlivePages].map(p => PAGE_TO_COMPONENT[p]).filter(Boolean)
);

function syncViewport() {
  const w = window.innerWidth;
  isTablet.value = w >= 768 && w <= 1023;
  isNarrow.value = w <= 767;
  if (isNarrow.value && sidebarOpen.value) {
    sidebarOpen.value = false;
  }
  // 平板端默认折叠 sidebar
  if (isTablet.value && sidebarOpen.value) {
    sidebarOpen.value = false;
  }
}

function onSelectMenu(key: string) {
  if (activePage.value === key) return;
  navHistory.push({ page: key });
  activePage.value = key;
  if (key === 'playlist') {
    playlistInitialCategory.value = '';
  }
  if (key === 'podcast-list' && !podcastItems.value.length) {
    void loadPodcastCenter();
  }
}

function onNavBack() {
  // 平板端用户页：如果在详情视图，先返回列表而非页面级后退
  if (isTablet.value && activePage.value === 'user') {
    window.dispatchEvent(new CustomEvent('user-panel-back'));
    return;
  }
  const entry = navHistory.back();
  if (entry) {
    navigateToEntry(entry);
  }
}

function onNavForward() {
  const entry = navHistory.forward();
  if (entry) {
    navigateToEntry(entry);
  }
}

function navigateToEntry(entry: { page: string; params?: Record<string, any> }) {
  const { page, params } = entry;
  activePage.value = page;
  if (params?.playlistId) activePlaylistId.value = params.playlistId;
  if (params?.albumId) activeAlbumId.value = params.albumId;
  if (params?.artistId) activeArtistId.value = params.artistId;
  if (params?.userId) activeUserId.value = params.userId;
  if (params?.rankId) activeRankId.value = params.rankId;
  if (params?.songId) activeSongId.value = params.songId;
  if (params?.language) activeLanguage.value = params.language;
  if (params?.settingsTab) settingsInitialTab.value = params.settingsTab;
  if (params?.category) playlistInitialCategory.value = params.category;
  if (params?.dailyInjectedPlaylist) dailyInjectedPlaylist.value = params.dailyInjectedPlaylist;
  if (params?.keyword) uiStore.state.searchKeyword = params.keyword;
  if (params?.mvReturnPage) activeMvReturnPage.value = params.mvReturnPage;
  if (params?.returnPage) {
    if (page === 'playlist-detail') activePlaylistReturnPage.value = params.returnPage;
    else if (page === 'album-detail') activeAlbumReturnPage.value = params.returnPage;
    else if (page === 'artist-detail') activeArtistReturnPage.value = params.returnPage;
    else if (page === 'user-detail') activeUserReturnPage.value = params.returnPage;
    else if (page === 'song-comment') activeSongCommentReturnPage.value = params.returnPage;
    else if (page === 'language-detail') activeLanguageReturnPage.value = params.returnPage;
  }
  scrollContentToTop();
}

function openPlaylistDetail(playlistId: number, _coverUrl?: string, returnPage?: string) {
  navHistory.push({ page: 'playlist-detail', params: { playlistId, returnPage: returnPage || 'home' } });
  dailyInjectedPlaylist.value = null;
  activePlaylistId.value = playlistId;
  activePlaylistReturnPage.value = returnPage || 'home';
  activePage.value = 'playlist-detail';
}

function openDailyList(songs: any[]) {
  dailyListSongs.value = songs;
  if (!songs.length) return;
  const injectedPlaylist = {
    name: '每日推荐',
    coverImgUrl: songs[0]?.al?.picUrl || songs[0]?.album?.picUrl || songs[0]?.album?.blurPicUrl || '',
    description: '根据你的音乐口味生成，每天更新',
    creator: { nickname: '每日推荐' },
    trackCount: songs.length,
    tracks: songs,
  };
  navHistory.push({ page: 'playlist-detail', params: { playlistId: Number(songs[0]?.id || 0), returnPage: 'home', dailyInjectedPlaylist: injectedPlaylist } });
  activePlaylistReturnPage.value = 'home';
  dailyInjectedPlaylist.value = injectedPlaylist;
  activePlaylistId.value = Number(songs[0]?.id || 0);
  activePage.value = 'playlist-detail';
}
const playlistBackLabel = computed(() => {
  if (activePlaylistReturnPage.value === 'search') return '返回搜索结果';
  if (activePlaylistReturnPage.value === 'home') return '返回首页';
  if (activePlaylistReturnPage.value === 'user') return '返回用户中心';
  if (activePlaylistReturnPage.value === 'user-detail') return '返回用户详情';
  if (activePlaylistReturnPage.value === 'history') return '返回收藏历史';
  if (activePlaylistReturnPage.value === 'language-detail') return '返回语言详情';
  return '返回歌单分类';
});

const albumBackLabel = computed(() => {
  if (activeAlbumReturnPage.value === 'search') return '返回搜索结果';
  if (activeAlbumReturnPage.value === 'playlist-detail') return '返回歌单详情';
  if (activeAlbumReturnPage.value === 'artist-detail') return '返回歌手详情';
  if (activeAlbumReturnPage.value === 'history') return '返回收藏历史';
  return '返回首页';
});

const artistBackLabel = computed(() => {
  // 歌手链式跳转中时，显示通用返回
  if (activeArtistIdStack.value.length > 0) return '返回上一页';
  if (activeArtistReturnPage.value === 'playlist-detail') return '返回歌单详情';
  if (activeArtistReturnPage.value === 'album-detail') return '返回专辑详情';
  if (activeArtistReturnPage.value === 'home') return '返回首页';
  if (activeArtistReturnPage.value === 'rank-detail') return '返回榜单详情';
  if (activeArtistReturnPage.value === 'rank') return '返回排行榜';
  if (activeArtistReturnPage.value === 'song-comment') return '返回歌曲评论';
  if (activeArtistReturnPage.value === 'user') return '返回用户页';
  if (activeArtistReturnPage.value === 'player') return '返回播放页';
  return '返回搜索结果';
});

const mvBackLabel = computed(() => {
  if (activeMvReturnPage.value === 'search') return '返回搜索结果';
  if (activeMvReturnPage.value === 'artist-detail') return '返回歌手详情';
  return '返回 MV 列表';
});

const userBackLabel = computed(() => {
  if (activeUserReturnPage.value === 'song-comment') return '返回歌曲评论';
  if (activeUserReturnPage.value === 'mv' || activeUserReturnPage.value === 'mv-play') return '返回 MV 播放';
  if (activeUserReturnPage.value === 'home') return '返回首页';
  if (activeUserReturnPage.value === 'playlist-detail') return '返回歌单详情';
  if (activeUserReturnPage.value === 'artist-detail') return '返回歌手详情';
  if (activeUserReturnPage.value === 'album-detail') return '返回专辑详情';
  return '返回搜索结果';
});

function openPlaylistByCategory(category: string) {
  navHistory.push({ page: 'playlist', params: { category } });
  playlistInitialCategory.value = category;
  activePlaylistReturnPage.value = 'playlist';
  activePage.value = 'playlist';
}

function backToPlaylist() {
  dailyInjectedPlaylist.value = null;
  const target = activePlaylistReturnPage.value || 'playlist';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function openAlbumDetail(albumId: number, returnPage = 'home') {
  navHistory.push({ page: 'album-detail', params: { albumId, returnPage } });
  activeAlbumId.value = albumId;
  activeAlbumReturnPage.value = returnPage;
  activePage.value = 'album-detail';
}

function backToAlbum() {
  const target = activeAlbumReturnPage.value || 'home';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function openRankDetail(playlistId: number) {
  navHistory.push({ page: 'rank-detail', params: { rankId: playlistId } });
  activeRankId.value = playlistId;
  activePage.value = 'rank-detail';
}

function backToRank() {
  navHistory.replace({ page: 'rank' });
  activePage.value = 'rank';
}

function backToUser() {
  navHistory.replace({ page: 'user' });
  activePage.value = 'user';
}

function openPodcastList(sourcePage: 'user' | 'history' | 'podcast-list' = 'podcast-list') {
  navHistory.push({ page: 'podcast-list' });
  activePodcastSourcePage.value = sourcePage;
  podcastLoading.value = true;
  activePage.value = 'podcast-list';
  void loadPodcastCenter();
}

function backToPodcastSource() {
  const target = activePodcastSourcePage.value || 'podcast-list';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function backToPodcastDetailSource() {
  const target = activePodcastDetailSourcePage.value || 'podcast-list';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function backToPodcastCategorySource() {
  const target = activePodcastCategorySourcePage.value || 'podcast-list';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function openPodcastSubscribedPage() {
  navHistory.push({ page: 'podcast-subscribed' });
  podcastSubscribedPageSource.value = activePodcastSourcePage.value;
  activePage.value = 'podcast-subscribed';
}

function backToPodcastSubscribedSource() {
  const target = podcastSubscribedPageSource.value || 'podcast-list';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function backToPodcastList() {
  navHistory.replace({ page: 'podcast-list' });
  activePage.value = 'podcast-list';
}

function openPodcastCategoryPage(category: { id: number; name: string }) {
  if (!category?.id) return;
  navHistory.push({ page: 'podcast-category', params: { podcastCategoryId: category.id } });
  activePodcastCategorySourcePage.value = activePodcastSourcePage.value;
  activePodcastCategory.value = category.id;
  activePodcastCategoryInfo.value = { id: Number(category.id), name: category.name || '分类内容' };
  activePage.value = 'podcast-category';
}

function resolvePodcastRid(item: any) {
  return Number(item?.radio?.id || item?.program?.radio?.id || item?.dj?.id || podcastDetailInfo.value?.id || podcastDetailInfo.value?.radio?.id || 0);
}

function normalizePodcastPlayableTrack(item: any) {
  const mainTrackId = Number(item?.mainTrackId || item?.mainSong?.id || item?.song?.id || item?.program?.mainTrackId || item?.program?.mainSong?.id || 0);
  const rid = resolvePodcastRid(item);
  const programId = Number(item?.id || item?.voiceId || item?.programId || item?.program?.id || 0);
  const createTime = Number(item?.createTime || item?.program?.createTime || 0);
  if (!mainTrackId) return null;

  // 内联付费徽标检测，与 PodcastDetailPage 的 resolveFeeMeta 一致
  const feeType = Number(item?.voiceFeeType ?? item?.feeType ?? item?.programFeeType ?? item?.fee ?? item?.payType ?? item?.saleType ?? 0);
  const payed = Number(item?.payed ?? item?.paid ?? 0);
  const price = Number(item?.price ?? item?.originalPrice ?? item?.actualPrice ?? 0);
  const buyed = Boolean(item?.buyed ?? item?.purchased ?? item?.hasPurchased) || payed > 0;
  const needPay = Boolean(item?.needPay ?? item?.needPurchase ?? item?.needBuy ?? item?.payInfo) || price > 0;
  let feeBadge: string | undefined;
  let feeTone: string | undefined;
  if (buyed) { feeBadge = '已购买'; feeTone = 'purchased'; }
  else if (feeType === 8 || feeType === 16) { feeBadge = '会员'; feeTone = 'vip'; }
  else if (feeType > 0 || needPay) { feeBadge = '付费'; feeTone = 'paid'; }

  return {
    id: mainTrackId,
    name: item?.name || item?.programName || item?.title || item?.mainSong?.name || '播客节目',
    ar: [{ name: item?.radio?.name || item?.program?.radio?.name || activePodcastTitle.value || '播客' }],
    al: {
      name: item?.radio?.name || item?.program?.radio?.name || activePodcastTitle.value || '播客',
      picUrl: item?.coverUrl || item?.picUrl || item?.imgUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.radio?.picUrl || '',
    },
    source: 'podcast',
    description: (item?.description || item?.desc || item?.briefDesc || item?.program?.description || item?.program?.desc || item?.mainSong?.description || '').trim(),
    podcast: rid > 0
      ? { rid, programId: programId > 0 ? programId : undefined, createTime: createTime > 0 ? createTime : undefined, feeBadge, feeTone }
      : (programId > 0
        ? { programId, createTime: createTime > 0 ? createTime : undefined, feeBadge, feeTone }
        : (createTime > 0
          ? { createTime, feeBadge, feeTone }
          : (feeBadge ? { feeBadge, feeTone } : undefined))),
  };
}

function buildLocalPodcastHistoryEntry() {
  const detail = podcastDetailInfo.value || {};
  const firstItem = podcastDetailItems.value[0] || {};
  const radio = detail?.radio || firstItem?.radio || firstItem?.program?.radio || {};
  const id = Number(detail?.id || detail?.voiceListId || radio?.id || firstItem?.voiceListId || firstItem?.program?.radio?.id || firstItem?.radio?.id || 0);
  const title = activePodcastTitle.value || detail?.name || radio?.name || '当前播客';
  const coverUrl = detail?.picUrl || detail?.coverUrl || detail?.imgUrl || detail?.imageUrl || detail?.blurCoverUrl || detail?.intervenePicUrl || radio?.picUrl || firstItem?.coverUrl || firstItem?.picUrl || firstItem?.program?.coverUrl || '';
  return {
    key: `podcast-${id || title}`,
    title,
    subtitle: `${podcastDetailItems.value.length || 0} 条声音 · ${detail?.category || radio?.category || '播客'}`,
    source: 'local_play_history',
    sourceTip: '当前设备本地播放记录',
    summary: detail?.description || detail?.desc || radio?.desc || '当前设备播放过的播客。',
    typeLabel: '播客历史',
    countLabel: '0',
    updatedAt: String(Date.now()),
    playableLabel: '播客播放',
    playActionTip: '从本地历史恢复播客详情。',
    coverUrl,
    playableItem: { ...detail, id, name: title, coverUrl, items: podcastDetailItems.value },
    manageType: 'podcast' as const,
    canUnlike: false,
    canOpenDetail: true,
    sortKey: Date.now(),
  };
}

function recordPodcastLocalHistory() {
  if (!podcastDetailItems.value.length && !podcastDetailInfo.value) return;
  recordLocalHistoryEntry(buildLocalPodcastHistoryEntry());
}

async function playPodcastItem(payload: { item: any; index: number }) {
  const playableTracks = podcastDetailItems.value.map(normalizePodcastPlayableTrack).filter(Boolean);
  if (!playableTracks.length) return;

  const targetTrackId = Number(payload?.item?.mainTrackId || payload?.item?.mainSong?.id || payload?.item?.song?.id || payload?.item?.program?.mainTrackId || payload?.item?.program?.mainSong?.id || 0);
  const startIndex = Math.max(0, playableTracks.findIndex((track: any) => Number(track?.id || 0) === targetTrackId));
  recordPodcastLocalHistory();
  playerStore.setPlaylist(playableTracks, startIndex >= 0 ? startIndex : 0);
  await playerStore.playByIndex(startIndex >= 0 ? startIndex : 0);
}

async function playPodcastAll(items: any[]) {
  const playableTracks = (items || []).map(normalizePodcastPlayableTrack).filter(Boolean);
  if (!playableTracks.length) return;
  recordPodcastLocalHistory();
  playerStore.setPlaylist(playableTracks, 0);
  await playerStore.playByIndex(0);
}

function extractVoiceDetailItems(payload: any): any[] {
  const candidates = [
    payload?.data,
    payload?.result,
    payload?.list,
    payload?.voiceList,
    payload?.programs,
    payload?.djPrograms,
    payload?.data?.list,
    payload?.data?.voiceList,
    payload?.data?.programs,
    payload?.data?.djPrograms,
    payload?.data?.result?.list,
    payload?.data?.result?.voiceList,
    payload?.data?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function openPodcastDetail(item: any, sourcePage: 'user' | 'history' | 'podcast-list' | 'home' = activePodcastSourcePage.value) {
  navHistory.push({ page: 'podcast-detail' });
  activePodcastDetailSourcePage.value = sourcePage;
  const matchedCategory = podcastCategoryOptions.value.find((category: any) => Number(category?.id || 0) === Number(item?.categoryId || item?.radio?.categoryId || item?.program?.radio?.categoryId || 0));
  if (matchedCategory) {
    activePodcastCategoryInfo.value = { id: Number(matchedCategory.id), name: matchedCategory.name || '分类内容' };
  }
  const djRid = item?.radio?.id || item?.program?.radio?.id || item?.dj?.id || item?.id;
  const voiceListId = item?.voiceListId || item?.voiceList?.id || item?.detail?.id;
  const isDjItem = Boolean(item?.radio || item?.program || item?.dj || item?.djPrograms || item?.programCount || item?.subCount || item?.categoryId);

  activePodcastTitle.value = item?.name || item?.program?.radio?.name || item?.radio?.name || '播客';
  podcastDetailInfo.value = null;
  podcastDetailItems.value = [];
  activePage.value = 'podcast-detail';

  if (!djRid && !voiceListId) {
    return;
  }

  podcastDetailLoading.value = true;
  try {
    if (isDjItem && djRid) {
      const [detailRes, programRes] = await Promise.all([
        getDjDetail(Number(djRid)),
        getDjProgram({ rid: Number(djRid), limit: 200, offset: 0 }),
      ]);
      const detailPayload = detailRes.data || detailRes;
      const programPayload = programRes.data || programRes;
      podcastDetailInfo.value = detailPayload?.data || detailPayload?.djRadio || detailPayload?.radio || detailPayload || item;
      podcastDetailItems.value = extractVoiceDetailItems(programPayload);
      const detailTitle = detailPayload?.data?.name || detailPayload?.djRadio?.name || detailPayload?.radio?.name || item?.name;
      if (detailTitle) activePodcastTitle.value = detailTitle;
      return;
    }

    if (voiceListId) {
      const [detailRes, listRes] = await Promise.all([
        getVoiceListDetail(Number(voiceListId)),
        getVoiceListItems({ voiceListId: Number(voiceListId), limit: 200, offset: 0 }),
      ]);
      const detailPayload = detailRes.data || detailRes;
      const detailItems = extractVoiceDetailItems(detailPayload);
      podcastDetailInfo.value = detailPayload?.data?.voiceList || detailPayload?.data || detailPayload?.voiceList || detailPayload?.result || detailPayload || item;
      podcastDetailItems.value = detailItems.length ? detailItems : extractVoiceDetailItems(listRes);
      const detailTitle = detailPayload?.data?.voiceList?.name || detailPayload?.name || detailPayload?.voiceList?.name || detailPayload?.data?.name;
      if (detailTitle) activePodcastTitle.value = detailTitle;
    }
  } finally {
    podcastDetailLoading.value = false;
  }
}

function extractVoiceListItems(payload: any): any[] {
  const root = payload?.data || payload || {};
  const nested = root?.data || {};
  const candidates = [
    payload?.data,
    payload?.result,
    payload?.list,
    payload?.voiceList,
    payload?.programs,
    payload?.djRadios,
    payload?.data?.list,
    payload?.data?.records,
    payload?.data?.programs,
    payload?.data?.djRadios,
    payload?.data?.history,
    payload?.data?.radios,
    payload?.data?.data,
    payload?.data?.data?.list,
    payload?.data?.data?.records,
    payload?.data?.data?.programs,
    payload?.data?.data?.djRadios,
    payload?.data?.data?.history,
    payload?.data?.data?.radios,
    root?.list,
    root?.voiceList,
    root?.records,
    root?.programs,
    root?.djRadios,
    root?.weekData,
    root?.items,
    root?.history,
    root?.radios,
    nested,
    nested?.list,
    nested?.records,
    nested?.programs,
    nested?.djRadios,
    nested?.weekData,
    nested?.items,
    nested?.history,
    nested?.radios,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  const objectCandidates = [payload, payload?.data, payload?.result, root, nested, payload?.data?.data];
  for (const candidate of objectCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    for (const value of Object.values(candidate)) {
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === 'object') {
        for (const nestedValue of Object.values(value)) {
          if (Array.isArray(nestedValue) && nestedValue.length) return nestedValue;
        }
      }
    }
  }

  return [];
}

function normalizeRecentDjItems(items: any[]): any[] {
  return items
    .map((item) => {
      const radio = item?.radio || item?.program?.radio || item?.data?.radio || item?.resource?.radio || item?.resourceExtInfo?.radio || null;
      const program = item?.program || item?.data?.program || item?.resource?.program || item?.resourceExtInfo?.program || item?.data || null;
      const source = radio || program || item;
      const id = source?.id || radio?.id || program?.id || item?.id || item?.resourceId || item?.rid || item?.programId || 0;
      const name = source?.name || program?.name || radio?.name || item?.name || item?.title || item?.data?.name || '';
      if (!id && !name) return null;
      return {
        ...item,
        ...source,
        id,
        name: name || '播客节目',
        coverUrl: source?.picUrl || source?.coverUrl || source?.blurCoverUrl || source?.intervenePicUrl || radio?.picUrl || radio?.coverUrl || radio?.intervenePicUrl || program?.coverUrl || program?.blurCoverUrl || program?.radio?.picUrl || item?.coverUrl || item?.picUrl || item?.imgUrl || item?.data?.coverUrl || item?.data?.radio?.picUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.program?.radio?.picUrl || item?.program?.mainSong?.al?.picUrl || item?.mainSong?.al?.picUrl || '',
        description: source?.desc || source?.description || program?.description || radio?.desc || item?.description || item?.reason || item?.data?.description || '',
        category: source?.category || source?.rcmdtext || item?.category || item?.data?.category || '',
        program,
        radio,
      };
    })
    .filter(Boolean);
}

function normalizeRecentPlayDjItems(items: any[]): any[] {
  return items
    .map((item) => {
      const program = item?.data || item?.program || item?.resource?.program || item?.resourceExtInfo?.program || item;
      const radio = program?.radio || item?.radio || item?.resource?.radio || item?.resourceExtInfo?.radio || null;
      const id = program?.id || item?.id || item?.resourceId || item?.programId || radio?.id || 0;
      const name = program?.name || radio?.name || item?.name || item?.title || '';
      if (!id && !name) return null;
      return {
        ...item,
        ...program,
        id,
        name: name || '播客节目',
        coverUrl: program?.coverUrl || program?.blurCoverUrl || radio?.picUrl || radio?.coverUrl || item?.coverUrl || item?.picUrl || item?.imgUrl || '',
        description: program?.description || radio?.desc || item?.description || item?.reason || '',
        category: radio?.category || item?.category || '',
        program,
        radio,
      };
    })
    .filter(Boolean);
}

async function loadPodcastCenter() {
  podcastLoading.value = true;
  podcastSubscribedItems.value = [];
  podcastCategoryOptions.value = [];
  activePodcastCategory.value = null;

  try {
    const tasks: Promise<any>[] = [];
    tasks.push(getRecentDj(100));
    tasks.push(getDjSublist());
    tasks.push(getDjRecommend());
    tasks.push(getDjCategoryRecommend());

    const isFullLogin = userStore.state.loginMode === 'cookie' || userStore.state.loginMode === 'qr';
    const [recentRes, sublistRes, recommendRes, categoryRes] = await Promise.all(tasks);

    podcastRecentItems.value = normalizeRecentPlayDjItems(extractVoiceListItems(recentRes));
    podcastSubscribedItems.value = isFullLogin ? normalizeRecentDjItems(extractVoiceListItems(sublistRes)) : [];
    podcastItems.value = normalizeRecentDjItems(extractVoiceListItems(recommendRes));
    const categoryItems = extractVoiceListItems(categoryRes);
    podcastCategoryOptions.value = categoryItems.map((item: any) => ({ id: Number(item?.id || item?.categoryId || item?.type || 0), name: item?.name || item?.categoryName || item?.title || '分类' })).filter((item: any) => item.id > 0 && item.name);
    activePodcastCategory.value = podcastCategoryOptions.value[0]?.id || null;

    if (!podcastItems.value.length) {
      const [podcastRes, bookRes] = await Promise.all([
        getVoiceListSearch({ keyword: '播客', limit: 8, offset: 0 }),
        getVoiceListSearch({ keyword: '有声书', limit: 8, offset: 0 }),
      ]);

      podcastItems.value = [...extractVoiceListItems(podcastRes), ...extractVoiceListItems(bookRes)];
    }
  } finally {
    podcastLoading.value = false;
  }
}

async function openPodcastCategory(categoryId: number) {
  if (!categoryId) return;
  activePodcastCategory.value = categoryId;
  podcastLoading.value = true;
  try {
    const { data } = await getDjRecommendType(categoryId);
    podcastItems.value = normalizeRecentDjItems(extractVoiceListItems(data || { data }));
  } finally {
    podcastLoading.value = false;
  }
}

function openSearchPage(keyword: string) {
  navHistory.push({ page: 'search', params: { keyword } });
  uiStore.state.searchKeyword = keyword;
  uiStore.state.searchType = 1;
  activePage.value = 'search';
}

function openUserDetail(userId: number, returnPage = 'search') {
  navHistory.push({ page: 'user-detail', params: { userId: Number(userId || 0), returnPage } });
  activeUserId.value = Number(userId || 0);
  activeUserReturnPage.value = returnPage;
  activePage.value = 'user-detail';
}

function openUserFromSearch(userId: number) {
  openUserDetail(userId, 'search');
}

function resolveArtistId(artist: any) {
  if (typeof artist === 'number') return Number(artist || 0);
  return Number(artist?.id || artist?.artistId || artist?.userId || 0);
}

function openArtistDetail(artist: any, returnPage = 'search') {
  navHistory.push({ page: 'artist-detail', params: { artistId: resolveArtistId(artist), returnPage } });
  // 从歌手页内部跳转到另一个歌手时，压栈保存当前歌手ID，保留原始 returnPage
  if (activePage.value === 'artist-detail' && activeArtistId.value > 0) {
    activeArtistIdStack.value.push(activeArtistId.value);
  } else {
    activeArtistReturnPage.value = returnPage;
  }
  activeArtistId.value = resolveArtistId(artist);
  activePage.value = 'artist-detail';
}

function openArtistFromSearch(artist: any) {
  openArtistDetail(artist, 'search');
}

function openArtistFromHome(artist: any) {
  openArtistDetail(artist, 'home');
}

function openArtistFromPlayer(artist: any) {
  playerStore.closeExpanded();
  openArtistDetail(artist, 'player');
}

function openUserFromHome(userId: number) {
  openUserDetail(userId, 'home');
}

function openUserLogin() {
  navHistory.push({ page: 'user' });
  activePage.value = 'user';
}

function openSongComment(songId: number, returnPage = activePage.value) {
  navHistory.push({ page: 'song-comment', params: { songId, returnPage } });
  activeSongId.value = songId;
  activeSongCommentReturnPage.value = returnPage;
  activePage.value = 'song-comment';
}
function goBackFromComment() {
  const target = activeSongCommentReturnPage.value || 'playlist-detail';
  navHistory.replace({ page: target });
  activePage.value = target;
}

async function playSongFromComment(songId: number) {
  try {
    const detail = await getSongDetail(songId);
    const song = detail.data?.songs?.[0];
    if (!song) return;
    const track = { id: song.id, name: song.name, ar: song.ar || [], al: song.al || {} };
    playerStore.setPlaylist([track], 0);
    await playerStore.playByIndex(0);
  } catch {}
}

function openUserFromComment(userId: number) {
  playerStore.closeExpanded();
  openUserDetail(userId, activePage.value);
}

function openSettings(tab: SettingsInitialTab = 'appearance') {
  navHistory.push({ page: 'settings', params: { settingsTab: tab } });
  settingsInitialTab.value = tab;
  activePage.value = 'settings';
}

const openTraySettings = () => {
  playerStore.closeExpanded();
  openSettings('playback');
};

function openArtistFromComment(artist: any) {
  openArtistDetail(artist, 'song-comment');
}

function openArtistFromRank(artist: any) {
  openArtistDetail(artist, activePage.value === 'rank-detail' ? 'rank-detail' : 'rank');
}

function openArtistFromDetail(artist: any) {
  const returnPage =
    activePage.value === 'album-detail' ? 'album-detail' :
    activePage.value === 'user' ? 'user' :
    'playlist-detail';
  openArtistDetail(artist, returnPage);
}

function backToArtist() {
  // 歌手链式跳转：弹出前一个歌手ID，留在歌手页
  if (activeArtistIdStack.value.length > 0) {
    const prevId = activeArtistIdStack.value.pop()!;
    activeArtistId.value = prevId;
    navHistory.replace({ page: 'artist-detail', params: { artistId: prevId } });
    return;
  }
  if (activeArtistReturnPage.value === 'rank-detail') {
    navHistory.replace({ page: 'rank-detail' });
    activePage.value = 'rank-detail';
    return;
  }
  if (activeArtistReturnPage.value === 'player') {
    playerStore.openExpanded();
    return;
  }
  const target = activeArtistReturnPage.value || 'search';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function backToUserDetail() {
  const target = activeUserReturnPage.value || 'search';
  navHistory.replace({ page: target });
  activePage.value = target;
}

function openLanguageDetail(language: string, returnPage = 'home') {
  if (!language) return;
  navHistory.push({ page: 'language-detail', params: { language, returnPage } });
  activeLanguage.value = language;
  activeLanguageReturnPage.value = returnPage;
  activePage.value = 'language-detail';
}

function backToLanguage() {
  const target = activeLanguageReturnPage.value === 'song-comment' ? 'song-comment' : (activeLanguageReturnPage.value || 'home');
  navHistory.replace({ page: target });
  activePage.value = target;
}

function goBackFromMvPlay() {
  const target = activeMvReturnPage.value || 'playlist';
  navHistory.replace({ page: target });
  activePage.value = target;
  // 关闭 MV 页后根据设置恢复音乐播放
  if (uiStore.state.resumeAfterMv && wasPlayingBeforeMvPage && playerStore.state.currentTrack) {
    playerStore.togglePlay();
  }
}

let wasPlayingBeforeMvPage = false;

function openMvFromSearch(item: any) {
  navHistory.push({ page: 'mv-play', params: { mvItem: item, mvReturnPage: activePage.value } });
  activeMvItem.value = item || null;
  activeMvReturnPage.value = activePage.value;
  activePage.value = 'mv-play';
  // 打开 MV 页时暂停音乐播放
  wasPlayingBeforeMvPage = playerStore.state.isPlaying;
  if (playerStore.state.isPlaying) {
    playerStore.state.audio.pause();
  }
}

// 页面跳转时重置滚动位置，避免新页面从中间显示 / sticky 态卡死
function scrollContentToTop() {
  const el = document.querySelector('.content') as HTMLElement | null;
  if (el) el.scrollTop = 0;
}

watch(activePage, (page) => { if (!keepAlivePages.has(page)) scrollContentToTop(); });
watch(
  [activeArtistId, activeAlbumId, activePlaylistId, activeUserId, activeLanguage, activeRankId],
  () => { scrollContentToTop(); },
);

watch(
  () => uiStore.state.searchType,
  () => {
    if (activePage.value === 'search') {
      // 搜索类型变更后保持在搜索页，实际检索由搜索页读取全局状态
      activePage.value = 'search';
    }
  },
);

/** 处理本地页面间导航事件 */
function handleMiniModeState(e: Event) {
  const isMini = !!(e as CustomEvent).detail;
  uiStore.state.isMiniMode = isMini;
  if (isMini) {
    uiStore.state.showPlayQueue = false;
    playerStore.closeExpanded();
    loginModalStore.hideLoginModal();
  }
}

function handleLocalNavigate(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.page && ['local-music', 'local-songs', 'local-artists', 'local-albums', 'local-folders', 'local-playlists', 'local-playlist-detail'].includes(detail.page)) {
    if (activePage.value === detail.page) return
    navHistory.push({ page: detail.page })
    activePage.value = detail.page
  }
}

/** 处理从子组件（如本地歌曲）触发的在线专辑导航 */
function handleOpenAlbumDetail(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.albumId) {
    openAlbumDetail(detail.albumId, 'local-music')
  }
}

function flushApiCacheBeforeUnload() {
  apiCache.flushPending()
}

// FPS监控快捷键切换: Ctrl/Cmd + Shift + F
function handleFpsToggle(e: KeyboardEvent) {
  const isMod = e.ctrlKey || e.metaKey;
  if (isMod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    toggleFpsOverlay({ position: 'top-right', size: 'large', showFrameTime: true });
  }
}

onMounted(async () => {
  injectDeviceTierCSS();
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('local-navigate', handleLocalNavigate);
  window.addEventListener('open-tray-settings', openTraySettings);
  window.addEventListener('open-album-detail', handleOpenAlbumDetail);
  document.addEventListener('mini-mode-state', handleMiniModeState);
  
  // FPS监控快捷键: Ctrl/Cmd + Shift + F
  window.addEventListener('keydown', handleFpsToggle);

  playerStore.init();
  await userStore.hydrate();
  uiStore.init();
  apiCache.init();
  // 桌面端退出前强制写入缓存（防抖窗口内可能丢失的写入）
  window.addEventListener('beforeunload', flushApiCacheBeforeUnload);

  // 并行：登录验证和 API 就绪检测同时进行
  // refreshLoginStatus 首次调用可能因 API 未就绪而失败，静默处理
  const [apiReadyResult] = await Promise.all([
    waitForApiReady({ maxAttempts: 30, intervalMs: 500 }),
    userStore.refreshLoginStatus().catch(() => {/* 静默 */}),
  ]);
  apiReady.value = apiReadyResult;

  if (apiReady.value) {
    // API 已就绪，确认登录状态（首次成功则跳过，失败则重试）
    if (!userStore.state.loginVerified) {
      await userStore.refreshLoginStatus();
    }
    await uiStore.loadDefaultSearchKeyword();
  }
  // 登录验证完成后再进入首页，确保 HomePanel 挂载时登录态已就绪
  activePage.value = 'home';
  navHistory.replace({ page: 'home' });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport);
  window.removeEventListener('local-navigate', handleLocalNavigate);
  window.removeEventListener('open-tray-settings', openTraySettings);
  window.removeEventListener('open-album-detail', handleOpenAlbumDetail);
  window.removeEventListener('beforeunload', flushApiCacheBeforeUnload);
  document.removeEventListener('mini-mode-state', handleMiniModeState);
  window.removeEventListener('keydown', handleFpsToggle);
});
</script>

<style scoped>
.layout {
  --layout-top: 8px;
  --layout-left: 8px;
  --layout-gap: 8px;
  --sidebar-width: 220px;
  --topbar-height: 74px;
  --player-bar-height: 84px;
  --content-max-width: 100%;
  --content-padding: 16px;

  --main-height: calc(100dvh - (var(--layout-top) * 2) - var(--player-bar-height));
  --sidebar-height: var(--main-height);
  --main-width: calc(100% - (var(--layout-left) * 2) - var(--sidebar-width) - var(--layout-gap));
  --content-height: calc(var(--main-height) - var(--topbar-height));

  width: 100%;
  height: 100dvh;
  position: fixed;
  inset: 0;
  background: var(--bg-app);
  overflow-x: clip;
  transition: opacity 0.18s ease;
}

.main-area {
  position: fixed;
  top: var(--layout-top);
  left: calc(var(--layout-left) + var(--sidebar-width) + var(--layout-gap));
  width: var(--main-width);
  height: var(--main-height);
  display: grid;
  grid-template-rows: var(--topbar-height) minmax(0, 1fr);
  min-width: 0;
  will-change: left;
  transition: left 0.28s cubic-bezier(0.34, 1, 0.64, 1), width 0.28s cubic-bezier(0.34, 1, 0.64, 1);
}

.content {
  position: relative;
  width: 100%;
  min-height: 0;
  padding: var(--content-padding);
  padding-bottom: var(--content-padding);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  background: var(--bg-app);
  box-sizing: border-box;
  cursor: auto;
}

.content::-webkit-scrollbar {
  display: none;
}

.content.content--hero-sticky {
  padding-top: 0;
}

.content::before {
  content: '';
  position: absolute;
  top: 0;
  left: -20px;
  right: -20px;
  height: 360px;
  z-index: 0;
  background-image:
    linear-gradient(
      180deg,
      rgba(17, 24, 39, 0.56) 0%,
      rgba(17, 24, 39, 0.34) 28%,
      rgba(17, 24, 39, 0.14) 56%,
      rgba(17, 24, 39, 0.04) 80%,
      transparent 100%
    ),
    var(--cover-bg-url, none);
  background-size: cover, cover;
  background-position: center, var(--detail-head-bg-position, center);
  transform: scale(1.1);
  transform-origin: top center;
  filter: blur(24px) saturate(155%) contrast(1.08);
  contain: paint;
  pointer-events: none;
  opacity: 0;
  will-change: filter, opacity;
  transition: opacity 0.6s ease;
}

.content.content--hero-sticky::before {
  opacity: 0;  /* disabled - all hero-sticky pages use DetailShrinkShell */
}

.content.content--user-page,
.content:has(.history-page-host) {
  padding-bottom: 16px;
}

.content-shell {
  width: min(var(--content-max-width), 100%);
  min-height: 100%;
  margin: 0;
  height: 100%;
}

@supports not (height: 100dvh) {
  .layout {
    height: 100vh;
    --main-height: calc(100vh - (var(--layout-top) * 2) - var(--player-bar-height));
  }
}

/* ── 平板端布局 ── */
@media (min-width: 768px) and (max-width: 1023px) {
  .layout {
    --sidebar-width: 76px;
    --topbar-height: 68px;
    --content-max-width: 100%;
    --content-padding: 12px;
  }
}

@media (max-width: 1919px) {
  .layout {
    --sidebar-width: 212px;
    --topbar-height: 72px;
    --content-max-width: 100%;
    --content-padding: 14px;
  }
}

@media (max-width: 767px) {
  .layout {
    --sidebar-width: 196px;
    --topbar-height: 68px;
    --content-max-width: 100%;
    --content-padding: 12px;
  }
}

:deep(.user-page-host) {
  height: 100%;
}

/* ── 侧栏遮罩层 ── */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 9;
  -webkit-tap-highlight-color: transparent;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.22s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
