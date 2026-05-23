<template>
  <AnimatedAppear tag="div" variant="content" rhythm="shell" class-name="search-page">
    <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="card search-shell">
      <div class="history-head">
        <div>
          <AnimatedAppear tag="h3" variant="title" rhythm="title">搜索</AnimatedAppear>
        </div>
        <AnimatedAppear
          tag="button"
          variant="control"
          rhythm="actions"
          class-name="clear"
          :disabled="!keywords.trim() && !hasSearched"
          @click="resetSearchState"
        >
          返回推荐
        </AnimatedAppear>
      </div>

      <div class="search-row">
        <div class="search-input-row">
          <AnimatedAppear
            tag="input"
            variant="control"
            rhythm="actions"
            class-name="input"
            :disabled="disabled"
            :placeholder="searchInputPlaceholder"
            :value="keywords"
            @input="onInput"
            @keydown.enter="onSearch"
          />
          <AnimatedAppear
            tag="button"
            variant="control"
            rhythm="actions"
            :index="1"
            class-name="search-btn"
            :disabled="disabled || loading || (!keywords.trim() && !uiStore.state.defaultSearchKeyword.trim())"
            @click="onSearch"
          >
            {{ loading ? '搜索中' : '搜索' }}
          </AnimatedAppear>
        </div>
        <div
          v-if="keywords.trim() || hasRenderedResults || loading"
          class="type-tabs ui-safe-group"
          :class="{ disabled: disabled || loading }"
          role="tablist"
          aria-label="搜索类型"
        >
          <button
            v-for="opt in searchTypeOptions"
            :key="opt.value"
            type="button"
            class="type-tab"
            :class="{ active: activeSearchType === opt.value }"
            :disabled="disabled || loading"
            @click="selectSearchType(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <SearchHistory
        v-if="showHotBoard"
        :items="searchHistory"
        @select="handleClickHistory"
        @delete-item="handleDeleteItem"
        @clear-all="handleClearAll"
      />

      <div class="search-stage">
        <Transition name="search-swap" mode="out-in">
          <div v-if="showHotBoard" key="hot-board" class="stage-panel">
            <section class="hot-panel" aria-label="搜索榜单推荐">
              <div class="hot-head">
                <div>
                  <h4 class="panel-title">{{ activeBoardMeta.title }}</h4>
                </div>
                <div class="board-tabs ui-safe-group" role="tablist" aria-label="榜单切换">
                  <button
                    v-for="board in boardTabs"
                    :key="board.key"
                    type="button"
                    class="board-tab"
                    :class="{ active: activeBoard === board.key }"
                    :aria-selected="activeBoard === board.key"
                    @click="selectBoard(board.key)"
                  >
                    {{ board.label }}
                  </button>
                </div>
              </div>
              <ol class="hot-list">
                <AnimatedAppear
                  v-for="(item, idx) in activeBoardList"
                  :key="`${activeBoard}-${item.keyword}-${idx}`"
                  tag="li"
                  variant="text"
                  rhythm="list"
                  :index="idx"
                  class-name="hot-item"
                  @click="useKeyword(item.keyword)"
                >
                  <span class="rank" :class="idx < 3 ? 'top' : 'normal'">{{ idx + 1 }}</span>
                  <span class="kw">{{ item.keyword }}</span>
                  <span v-if="item.hot !== undefined && item.hot !== null && item.hot !== ''" class="heat-wrap">
                    <span class="heat">{{ formatHotValue(item.hot) }}</span>
                    <span class="heat-bar"><i :style="{ width: heatBarWidth(item.hot) }"></i></span>
                  </span>
                </AnimatedAppear>
              </ol>
            </section>
          </div>

          <div v-else key="search-result" class="stage-panel">
            <div v-if="hasRenderedResults" class="results-block">
              <template v-if="activeSearchType === 1018">
                <section v-if="results.artists.length" class="mixed-feature">
                  <div class="mixed-head">
                    <h4>歌手</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(100)">查看更多</button>
                  </div>
                  <div class="entity-grid compact featured-grid">
                    <AnimatedAppear
                      v-for="(item, idx) in results.artists.slice(0, 4)"
                      :key="item.id || idx"
                      tag="button"
                      variant="content"
                      rhythm="list"
                      :index="idx"
                      class-name="entity-card clickable featured-card"
                      @click="openResult(item)"
                    >
                      <div class="entity-cover artist-cover">AR</div>
                      <div class="entity-main">
                        <div class="entity-topline"><div class="name">{{ item.name }}</div><span class="entity-badge">歌手</span></div>
                        <div class="artist">{{ item.alias?.join(' / ') || '艺人' }}</div>
                      </div>
                    </AnimatedAppear>
                  </div>
                </section>

                <section v-if="results.songs.length" class="mixed-section">
                  <div class="mixed-head">
                    <h4>单曲</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(1)">查看更多</button>
                  </div>
                  <ul class="song-list song-list--search">
                    <AnimatedAppear
                      v-for="(song, idx) in results.songs.slice(0, 6)"
                      :key="song.id || idx"
                      tag="li"
                      variant="text"
                      rhythm="list"
                      :index="idx"
                      class-name="song-item"
                      :class="{ 'song-item--playing': isCurrentTrack(song) }"
                      @dblclick="onSongItemDblClick($event, idx)"
                    >
                      <PlayPauseButton :song-id="Number(song?.id || 0)" :index-label="idx + 1" @play="playSongFrom(results.songs, idx)" />
                      <img
                        v-if="resolveSongCover(song)"
                        class="song-cover"
                        :src="resolveSongCover(song)"
                        :alt="song.name || '歌曲封面'"
                        loading="lazy"
                      />
                      <div v-else class="song-cover song-cover-fallback">♪</div>
                      <div class="song-meta">
                        <p class="song-name">{{ song.name }}</p>
                        <p class="song-artist">
                          <button
                            v-for="artist in getSongArtists(song)"
                            :key="`${song.id}-${artist.id || artist.name}`"
                            type="button"
                            class="artist-link"
                            @click.stop="openArtistDetail(artist)"
                          >
                            {{ artist.name || '未知歌手' }}
                          </button>
                          <span v-if="!getSongArtists(song).length">{{ resolveSubtitle(song) }}</span>
                        </p>
                      </div>
                    </AnimatedAppear>
                  </ul>
                </section>

                <section v-if="results.playlists.length" class="mixed-section">
                  <div class="mixed-head">
                    <h4>歌单</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(1000)">查看更多</button>
                  </div>
                  <div class="entity-grid compact featured-grid">
                    <AnimatedAppear
                      v-for="(item, idx) in results.playlists.slice(0, 4)"
                      :key="item.id || idx"
                      tag="button"
                      variant="content"
                      rhythm="list"
                      :index="idx"
                      class-name="entity-card clickable featured-card"
                      @click="openResult(item)"
                    >
                      <div class="entity-cover playlist-cover">PL</div>
                      <div class="entity-main">
                        <div class="entity-topline"><div class="name">{{ item.name }}</div><span class="entity-badge">歌单</span></div>
                        <div class="artist artist-jump" @click.stop="openPlaylistCreator(item)">{{ item.creator?.nickname || item.description || '歌单' }}</div>
                      </div>
                    </AnimatedAppear>
                  </div>
                </section>

                <section v-if="results.albums.length" class="mixed-section">
                  <div class="mixed-head">
                    <h4>专辑</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(10)">查看更多</button>
                  </div>
                  <div class="entity-grid compact featured-grid">
                    <AnimatedAppear
                      v-for="(item, idx) in results.albums.slice(0, 4)"
                      :key="item.id || idx"
                      tag="button"
                      variant="content"
                      rhythm="list"
                      :index="idx"
                      class-name="entity-card clickable featured-card"
                      @click="openResult(item)"
                    >
                      <div class="entity-cover album-cover">AL</div>
                      <div class="entity-main">
                        <div class="entity-topline"><div class="name">{{ item.name }}</div><span class="entity-badge">专辑</span></div>
                        <div class="artist">{{ item.artist?.name || item.artists?.map((a: any) => a.name).join('/') || '专辑' }}</div>
                      </div>
                    </AnimatedAppear>
                  </div>
                </section>

                <section v-if="results.mvs.length" class="mixed-section">
                  <div class="mixed-head">
                    <h4>MV</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(1004)">查看更多</button>
                  </div>
                  <div class="entity-grid compact featured-grid">
                    <AnimatedAppear
                      v-for="(item, idx) in results.mvs.slice(0, 4)"
                      :key="item.id || idx"
                      tag="button"
                      variant="content"
                      rhythm="list"
                      :index="idx"
                      class-name="entity-card clickable featured-card"
                      @click="openResult(item)"
                    >
                      <div class="entity-cover mv-cover">MV</div>
                      <div class="entity-main">
                        <div class="entity-topline"><div class="name">{{ item.name }}</div><span class="entity-badge">MV</span></div>
                        <div class="artist">{{ item.artistName || item.briefDesc || 'MV' }}</div>
                      </div>
                    </AnimatedAppear>
                  </div>
                </section>

                <section v-if="results.users.length" class="mixed-section">
                  <div class="mixed-head">
                    <h4>用户</h4>
                    <button class="mixed-more" type="button" @click="selectSearchType(1002)">查看更多</button>
                  </div>
                  <div class="entity-grid compact featured-grid">
                    <AnimatedAppear
                      v-for="(item, idx) in results.users.slice(0, 4)"
                      :key="item.userId || item.id || idx"
                      tag="button"
                      variant="content"
                      rhythm="list"
                      :index="idx"
                      class-name="entity-card clickable featured-card"
                      @click="openResult(item)"
                    >
                      <div class="entity-cover user-cover">{{ (item.nickname || 'U').slice(0, 1) }}</div>
                      <div class="entity-main">
                        <div class="entity-topline"><div class="name">{{ item.nickname || item.userName || '用户' }}</div><span class="entity-badge">用户</span></div>
                        <div class="artist">{{ item.signature || item.description || '个人主页' }}</div>
                      </div>
                    </AnimatedAppear>
                  </div>
                </section>
              </template>

              <template v-else-if="isSongLikeType || activeSearchType === 10 || activeSearchType === 100 || activeSearchType === 1000 || activeSearchType === 1002 || activeSearchType === 1004">
                <ul v-if="isSongLikeType" class="song-list song-list--search">
                  <AnimatedAppear
                    v-for="(song, idx) in songs"
                    :key="song.id || idx"
                    tag="li"
                    variant="text"
                    rhythm="list"
                    :index="idx"
                    class-name="song-item"
                    :class="{ 'song-item--playing': isCurrentTrack(song) }"
                    @dblclick="onSongItemDblClick($event, idx)"
                  >
                    <PlayPauseButton :song-id="Number(song?.id || 0)" :index-label="idx + 1" @play="playSongFrom(songs, idx)" />
                    <img
                      v-if="resolveSongCover(song)"
                      class="song-cover"
                      :src="resolveSongCover(song)"
                      :alt="song.name || '歌曲封面'"
                      loading="lazy"
                    />
                    <div v-else class="song-cover song-cover-fallback">♪</div>
                    <div class="song-meta">
                      <p class="song-name">{{ song.name || song.keyword || song.nickname || '搜索结果' }}</p>
                      <p class="song-artist">
                        <button
                          v-for="artist in getSongArtists(song)"
                          :key="`${song.id}-${artist.id || artist.name}`"
                          type="button"
                          class="artist-link"
                          @click.stop="openArtistDetail(artist)"
                        >
                          {{ artist.name || '未知歌手' }}
                        </button>
                        <span v-if="!getSongArtists(song).length">{{ resolveSubtitle(song) }}</span>
                      </p>
                    </div>
                  </AnimatedAppear>
                </ul>

                <div v-else-if="activeSearchType === 10" class="entity-grid album-grid">
                  <AnimatedAppear v-for="(item, idx) in songs" :key="item.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card clickable album-card interactive-media-trigger" @click="openResult(item)">
                    <div v-if="item.picUrl || item.blurPicUrl" class="entity-media-shell interactive-media-shell">
                      <div class="entity-cover-motion-shell interactive-media-motion">
                        <img class="entity-cover cover-image interactive-media-image" :src="normalizeImageUrl(item.picUrl || item.blurPicUrl)" :alt="item.name || '专辑封面'" loading="lazy" />
                      </div>
                    </div>
                    <div v-else class="entity-cover album-cover">AL</div>
                    <div class="entity-main">
                      <div class="name">{{ item.name }}</div>
                      <div class="artist">{{ item.artist?.name || item.artists?.map((a: any) => a.name).join('/') || '专辑' }}</div>
                      <div class="artist entity-date">{{ formatAlbumReleaseDate(item) }}</div>
                    </div>
                  </AnimatedAppear>
                </div>

                <div v-else-if="activeSearchType === 100" class="entity-grid singer-grid">
                  <AnimatedAppear v-for="(item, idx) in songs" :key="item.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card clickable singer-card" @click="openResult(item)">
                    <div v-if="resolveArtistAvatar(item)" class="entity-media-shell entity-media-shell--avatar interactive-media-shell">
                      <div class="entity-cover-motion-shell interactive-media-motion">
                        <img class="user-avatar featured-avatar interactive-media-image" :src="resolveArtistAvatar(item)" :alt="item.name || '歌手头像'" loading="lazy" />
                      </div>
                    </div>
                    <div v-else class="entity-cover artist-cover">AR</div>
                    <div class="entity-main">
                      <div class="entity-topline">
                        <div class="name">{{ item.name }}</div>
                        <span class="entity-badge">歌手</span>
                      </div>
                      <div class="artist">{{ item.alias?.join(' / ') || (item.followed ? '已关注歌手' : '艺人') }}</div>
                    </div>
                  </AnimatedAppear>
                </div>

                <div v-else-if="activeSearchType === 1000" class="entity-grid playlist-list">
                  <AnimatedAppear v-for="(item, idx) in songs" :key="item.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card clickable playlist-card" @click="openResult(item)">
                    <div v-if="item.coverImgUrl || item.picUrl" class="entity-media-shell interactive-media-shell">
                      <div class="entity-cover-motion-shell interactive-media-motion">
                        <img class="entity-cover cover-image interactive-media-image" :src="normalizeImageUrl(item.coverImgUrl || item.picUrl)" :alt="item.name || '歌单封面'" loading="lazy" />
                      </div>
                    </div>
                    <div v-else class="entity-cover playlist-cover">PL</div>
                    <div class="entity-main">
                      <div class="entity-topline">
                        <div class="name">{{ item.name }}</div>
                        <span class="entity-badge">歌单</span>
                      </div>
                      <div class="artist artist-jump" @click.stop="openPlaylistCreator(item)">{{ item.creator?.nickname || item.description || '歌单' }}</div>
                    </div>
                  </AnimatedAppear>
                </div>

                <div v-else-if="activeSearchType === 1002" class="entity-grid user-grid">
                  <AnimatedAppear v-for="(item, idx) in results.users.length ? results.users : songs" :key="item.userId || item.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card clickable user-card" @click="openResult(item)">
                    <div v-if="resolveUserAvatar(item)" class="entity-media-shell entity-media-shell--avatar interactive-media-shell">
                      <div class="entity-cover-motion-shell interactive-media-motion">
                        <img class="user-avatar interactive-media-image" :src="resolveUserAvatar(item)" :alt="item.nickname || item.userName || '用户头像'" />
                      </div>
                    </div>
                    <div v-else class="entity-cover user-cover">{{ (item.nickname || item.userName || 'U').slice(0, 1) }}</div>
                    <div class="entity-main">
                      <div class="entity-topline">
                        <div class="name">{{ item.nickname || item.userName || '用户' }}</div>
                        <span class="entity-badge">用户</span>
                      </div>
                      <div class="artist user-signature">{{ item.signature || item.description || '这个用户还没有签名' }}</div>
                    </div>
                  </AnimatedAppear>
                </div>

                <div v-else-if="activeSearchType === 1004" class="entity-grid mv-grid">
                  <AnimatedAppear v-for="(item, idx) in songs" :key="item.id || idx" tag="button" variant="content" rhythm="list" :index="idx" class-name="entity-card clickable mv-card" @click="openResult(item)">
                    <MvHoverPoster
                      :src="resolveMvCover(item)"
                      :alt="item.name || 'MV封面'"
                      :count="item.playCount || item.playTime || 0"
                      fallback-class="entity-cover mv-cover mv-poster-cover"
                    />
                    <div class="mv-info">
                      <div class="mv-title-row">
                        <div class="name mv-title">{{ resolveMvTitle(item) }}</div>
                        <span class="entity-badge">MV</span>
                      </div>
                      <div class="artist mv-artist">{{ resolveMvArtist(item) }}</div>
                    </div>
                  </AnimatedAppear>
                </div>
              </template>
            </div>

            <ul v-else-if="loading" class="loading-list" aria-label="搜索加载中">
              <li v-for="n in 6" :key="`loading-${n}`" class="loading-item">
                <span class="loading-rank shimmer" />
                <div class="loading-main">
                  <span class="loading-name shimmer" />
                  <span class="loading-artist shimmer" />
                </div>
                <span class="loading-btn shimmer" />
              </li>
            </ul>

            <AnimatedAppear v-else-if="hasSearched && keywords.trim()" tag="p" variant="text" rhythm="body" class-name="empty result-empty">
              没有找到相关结果，换个关键词试试
            </AnimatedAppear>
          </div>
        </Transition>
      </div>
    </AnimatedAppear>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getPlaylistDetail, getSongDetailBatch, searchMusic, searchMusicDefault, searchMusicHotDetail } from '../api/music';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import { normalizeImageUrl, resolveArtistImageUrl } from '../utils/image';
import { getSongArtists, isCurrentTrack as isCurrentTrackUtil } from '../utils/trackHelpers';
import AnimatedAppear from './AnimatedAppear.vue';
import MvHoverPoster from './MvHoverPoster.vue';
import SearchHistory, { type SearchHistoryRecord } from './SearchHistory.vue';
import PlayPauseButton from './ui/PlayPauseButton.vue';

defineProps<{ disabled?: boolean }>();

type HotSearchItem = { keyword: string; hot?: string | number; id?: number };
type BoardKey = 'hot' | 'rock' | 'folk' | 'ancient' | 'acg' | 'rap';

type BoardMeta = {
  key: BoardKey;
  label: string;
  title: string;
  subtitle: string;
};

const ROCK_TOPLIST_ID = 5059633707;
const FOLK_TOPLIST_ID = 5059661515;
const ANCIENT_TOPLIST_ID = 5059642708;
const ACG_TOPLIST_ID = 71385702;
const RAP_TOPLIST_ID = 991319590;
const boardTabs: BoardMeta[] = [
  { key: 'hot', label: '热搜榜', title: '热搜榜', subtitle: '当前热门搜索推荐，点击即可快速搜索' },
  { key: 'rock', label: '摇滚榜', title: '摇滚榜', subtitle: '网易云官方摇滚歌曲榜单，点击即可快速搜索' },
  { key: 'folk', label: '民谣榜', title: '民谣榜', subtitle: '网易云官方民谣歌曲榜单，点击即可快速搜索' },
  { key: 'ancient', label: '古风榜', title: '古风榜', subtitle: '网易云官方国风歌曲榜单，点击即可快速搜索' },
  { key: 'acg', label: 'ACG 榜', title: 'ACG 榜', subtitle: '网易云官方 ACG 歌曲榜单，点击即可快速搜索' },
  { key: 'rap', label: '说唱榜', title: '说唱榜', subtitle: '网易云官方中文说唱榜单，点击即可快速搜索' },
];

function formatHotValue(value?: string | number) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return String(value);

  const abs = Math.abs(value);
  if (abs >= 100000000) {
    const n = value / 100000000;
    return `热度 ${Number.isInteger(n) ? n : n.toFixed(1)}亿`;
  }
  if (abs >= 10000) {
    const n = value / 10000;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}万`;
  }
  return String(Math.round(value));
}

const hotList = ref<HotSearchItem[]>([]);
const rockList = ref<HotSearchItem[]>([]);
const folkList = ref<HotSearchItem[]>([]);
const ancientList = ref<HotSearchItem[]>([]);
const acgList = ref<HotSearchItem[]>([]);
const rapList = ref<HotSearchItem[]>([]);
const activeBoard = ref<BoardKey>('hot');
const activeBoardMeta = computed(() => boardTabs.find((board) => board.key === activeBoard.value) || boardTabs[0]);
const activeBoardList = computed(() => {
  if (activeBoard.value === 'rock') return rockList.value;
  if (activeBoard.value === 'folk') return folkList.value;
  if (activeBoard.value === 'ancient') return ancientList.value;
  if (activeBoard.value === 'acg') return acgList.value;
  if (activeBoard.value === 'rap') return rapList.value;
  return hotList.value;
});

function heatBarWidth(value?: string | number) {
  if (value === undefined || value === null || value === '') return '0%';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0%';
  const max = activeBoardList.value.reduce((acc, item) => {
    const v = typeof item.hot === 'number' ? item.hot : Number(item.hot || 0);
    return Number.isFinite(v) && v > acc ? v : acc;
  }, 0);
  if (!max) return '0%';
  return `${Math.max(12, Math.round((n / max) * 100))}%`;
}

const searchTypeOptions = [
  { label: '单曲', value: 1 },
  { label: '歌单', value: 1000 },
  { label: '歌手', value: 100 },
  { label: 'MV', value: 1004 },
  { label: '歌词', value: 1006 },
  { label: '专辑', value: 10 },
  { label: '电台', value: 1009 },
  { label: '用户', value: 1002 },
];
const searchTypeLabelMap: Record<number, string> = Object.fromEntries(searchTypeOptions.map((opt) => [opt.value, opt.label]));
const activeSearchType = ref(uiStore.state.searchType || 1);
const isSongLikeType = computed(() => [1, 1006, 1009].includes(activeSearchType.value));
const resultBadge = computed(() => searchTypeLabelMap[activeSearchType.value] || '结果');
const results = computed(() => {
  const raw = searchResult.value?.result || searchResult.value?.data || {};
  const songsList = Array.isArray(raw.songs) ? normalizeSongsLikeItems(raw.songs) : [];
  const albumsList = Array.isArray(raw.albums) ? raw.albums : [];
  const artistsList = Array.isArray(raw.artists) ? raw.artists : [];
  const playlistsList = Array.isArray(raw.playlists) ? raw.playlists : [];
  const usersList = Array.isArray(raw.users) ? raw.users : Array.isArray(raw.userprofiles) ? raw.userprofiles : [];
  const mvsList = Array.isArray(raw.mvs) ? raw.mvs : [];
  const radiosList = Array.isArray(raw.djRadios) ? raw.djRadios : Array.isArray(raw.radios) ? raw.radios : [];
  const voicesList = Array.isArray(raw.voiceList) ? raw.voiceList : [];
  return {
    songs: songsList,
    albums: albumsList,
    artists: artistsList,
    playlists: playlistsList,
    users: usersList,
    mvs: mvsList,
    radios: radiosList,
    voices: voicesList,
  };
});
const activeResultList = computed(() => {
  if (activeSearchType.value === 10) return results.value.albums;
  if (activeSearchType.value === 100) return results.value.artists;
  if (activeSearchType.value === 1000) return results.value.playlists;
  if (activeSearchType.value === 1002) return results.value.users;
  if (activeSearchType.value === 1004) return results.value.mvs;
  if (activeSearchType.value === 1009 || activeSearchType.value === 2000) return results.value.radios.length ? results.value.radios : results.value.voices;
  return results.value.songs;
});
const totalResultCount = computed(() => {
  if (activeSearchType.value === 1018) {
    return results.value.songs.length + results.value.albums.length + results.value.artists.length + results.value.playlists.length + results.value.users.length + results.value.mvs.length + results.value.radios.length + results.value.voices.length;
  }
  return activeResultList.value.length;
});
const hasRenderedResults = computed(() => totalResultCount.value > 0);
const emit = defineEmits<{
  (e: 'open-album-detail', albumId: number): void;
  (e: 'open-playlist-detail', playlistId: number): void;
  (e: 'open-podcast-detail', item: any): void;
  (e: 'open-user', userId: number): void;
  (e: 'open-artist', artist: any): void;
  (e: 'open-mv-player', item: any): void;
}>();

const SEARCH_HISTORY_KEY = 'music_search_history';
const keywords = ref(uiStore.state.searchKeyword || '');
const loading = ref(false);
const songs = ref<any[]>([]);
const searchResult = ref<any>(null);
const searchHistory = ref<SearchHistoryRecord[]>([]);
const isEmpty = computed(() => searchHistory.value.length === 0);
const hasSearched = ref(false);
const showHotBoard = computed(() => !hasSearched.value && !loading.value);
const searchInputPlaceholder = computed(() => uiStore.state.defaultSearchHint || '输入关键词回车搜索');
const HOT_REFRESH_INTERVAL = 5 * 60 * 1000;
let hotRefreshTimer: ReturnType<typeof setInterval> | undefined;

let inputDebounceTimer: ReturnType<typeof setTimeout> | undefined;

function onInput(e: Event) {
  keywords.value = (e.target as HTMLInputElement).value;
  uiStore.state.searchKeyword = keywords.value;
  if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
  if (keywords.value.trim()) {
    inputDebounceTimer = setTimeout(() => {
      void onSearch();
    }, 300);
  }
}

function resolveSubtitle(item: any) {
  return (
    item.ar?.map((a: any) => a.name).join('/') ||
    item.artists?.map((a: any) => a.name).join('/') ||
    item.album?.name ||
    item.company ||
    item.nickname ||
    item.userName ||
    '暂无描述'
  );
}

function openArtistDetail(artist: any) {
  const artistId = Number(artist?.id || artist?.artistId || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}

function openPlaylistCreator(item: any) {
  const creator = item?.creator || item?.user || item?.owner || null;
  const userId = Number(creator?.userId || creator?.id || creator?.uid || 0);
  if (!userId) return;
  emit('open-user', userId);
}

function resolveSongCover(item: any) {
  return normalizeImageUrl(
    item.al?.picUrl ||
      item.album?.picUrl ||
      item.album?.blurPicUrl ||
      item.img1v1Url ||
      item.coverImgUrl ||
      item.picUrl ||
      item.coverUrl ||
      item.blurCoverUrl ||
      item.avatarUrl ||
      item.dj?.avatarUrl ||
      item.program?.coverUrl ||
      '',
  );
}

function resolveMvCover(item: any) {
  return normalizeImageUrl(item.cover || item.imgurl16v9 || item.coverImgUrl || item.picUrl || item.picUrl16v9 || item.imgurl || '');
}

function resolveMvArtist(item: any) {
  return item.artistName || item.artist?.name || item.artists?.map((a: any) => a.name).join('/') || item.creator?.nickname || item.briefDesc || '未知歌手';
}

function resolveMvTitle(item: any) {
  return item.name || item.title || item.keyword || '未命名 MV';
}

function resolveArtistAvatar(item: any) {
  return resolveArtistImageUrl(item);
}

function resolveUserAvatar(item: any) {
  return normalizeImageUrl(item.avatarUrl || item.avatarImgUrl || item.avatar || item.backgroundUrl || item.picUrl || '');
}

function formatAlbumReleaseDate(item: any) {
  const rawValue = item?.publishTime ?? item?.publishDate ?? item?.publish_date ?? item?.releaseDate;
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

function extractResults(data: any) {
  const raw = data?.result || data?.data || {};
  if (Array.isArray(raw.songs)) return normalizeSongsLikeItems(raw.songs);
  if (Array.isArray(raw.albums)) return raw.albums;
  if (Array.isArray(raw.artists)) return raw.artists;
  if (Array.isArray(raw.playlists)) return raw.playlists;
  if (Array.isArray(raw.users)) return raw.users;
  if (Array.isArray(raw.mvs)) return raw.mvs;
  if (Array.isArray(raw.djRadios)) return raw.djRadios;
  if (Array.isArray(raw.radios)) return raw.radios;
  if (Array.isArray(raw.voiceList)) return raw.voiceList;
  return [];
}

function readSearchHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(raw)
      ? raw
          .map((item: any) => ({ keyword: String(item?.keyword || '').trim(), time: Number(item?.time || 0) }))
          .filter((item: SearchHistoryRecord) => item.keyword)
          .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function persistSearchHistory() {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.value.slice(0, 10)));
}

function handleSearch(keyword: string) {
  const clean = keyword.trim();
  if (!clean) return;
  searchHistory.value = [{ keyword: clean, time: Date.now() }, ...searchHistory.value.filter((item) => item.keyword !== clean)].slice(0, 10);
  persistSearchHistory();
}

function handleClickHistory(keyword: string) {
  useKeyword(keyword);
}

function handleDeleteItem(keyword: string) {
  searchHistory.value = searchHistory.value.filter((item) => item.keyword !== keyword);
  persistSearchHistory();
}

function handleClearAll() {
  searchHistory.value = [];
  persistSearchHistory();
}

function resetSearchState() {
  searchRequestSeq += 1;
  keywords.value = '';
  uiStore.state.searchKeyword = '';
  hasSearched.value = false;
  loading.value = false;
  songs.value = [];
  searchResult.value = null;
}

function normalizeHotList(raw: any): HotSearchItem[] {
  const list = raw?.data?.list || raw?.result || raw?.data || [];
  return list
    .slice(0, 8)
    .map((item: any) => ({
      keyword: item.searchWord || item.keyword || item.first || item.name || '',
      hot: item.hot ?? item.score ?? item.playCount ?? item.hotValue ?? item.searchCount,
    }))
    .filter((item: HotSearchItem) => Boolean(item.keyword));
}

function normalizePlaylistBoard(raw: any): HotSearchItem[] {
  const list = raw?.playlist?.tracks || raw?.tracks || raw?.songs || [];
  return list
    .slice(0, 8)
    .map((item: any) => ({
      keyword: item.name || item.keyword || '',
      hot: item.pop ?? item.popularity ?? item.score ?? item.playCount,
      id: item.id,
    }))
    .filter((item: HotSearchItem) => Boolean(item.keyword));
}

/** 从 playlist 响应中提取 track ids，去重后批量获取真实播放量 */
async function enrichBoardWithPlayCounts(items: HotSearchItem[]): Promise<HotSearchItem[]> {
  if (!items.length) return items;
  const ids = items
    .map((item) => item.id)
    .filter((id): id is number => typeof id === 'number' && id > 0);
  if (!ids.length) return items;

  try {
    const res = await getSongDetailBatch(ids);
    const songs: Array<{ id: number; playCount?: number }> =
      res?.data?.songs || [];
    const playCountMap = new Map(
      songs.map((s) => [s.id, s.playCount]),
    );
    return items.map((item) => {
      if (item.id && playCountMap.has(item.id)) {
        const pc = playCountMap.get(item.id);
        if (typeof pc === 'number' && pc > 0) {
          return { ...item, hot: pc };
        }
      }
      return item;
    });
  } catch {
    return items;
  }
}

async function loadDefaults() {
  const [, hotRes, rockRes, folkRes, ancientRes, acgRes, rapRes] = await Promise.allSettled([
    searchMusicDefault(),
    searchMusicHotDetail(),
    getPlaylistDetail(ROCK_TOPLIST_ID),
    getPlaylistDetail(FOLK_TOPLIST_ID),
    getPlaylistDetail(ANCIENT_TOPLIST_ID),
    getPlaylistDetail(ACG_TOPLIST_ID),
    getPlaylistDetail(RAP_TOPLIST_ID),
  ]);
  if (hotRes.status === 'fulfilled') {
    hotList.value = normalizeHotList(hotRes.value);
  }
  // 并行获取分类榜单的真实播放量
  const boardPromises: Promise<HotSearchItem[]>[] = [];
  if (rockRes.status === 'fulfilled') {
    boardPromises.push(enrichBoardWithPlayCounts(normalizePlaylistBoard(rockRes.value.data)));
  }
  if (folkRes.status === 'fulfilled') {
    boardPromises.push(enrichBoardWithPlayCounts(normalizePlaylistBoard(folkRes.value.data)));
  }
  if (ancientRes.status === 'fulfilled') {
    boardPromises.push(enrichBoardWithPlayCounts(normalizePlaylistBoard(ancientRes.value.data)));
  }
  if (acgRes.status === 'fulfilled') {
    boardPromises.push(enrichBoardWithPlayCounts(normalizePlaylistBoard(acgRes.value.data)));
  }
  if (rapRes.status === 'fulfilled') {
    boardPromises.push(enrichBoardWithPlayCounts(normalizePlaylistBoard(rapRes.value.data)));
  }
  const enriched = await Promise.all(boardPromises);
  if (enriched.length > 0) rockList.value = enriched[0];
  if (enriched.length > 1) folkList.value = enriched[1];
  if (enriched.length > 2) ancientList.value = enriched[2];
  if (enriched.length > 3) acgList.value = enriched[3];
  if (enriched.length > 4) rapList.value = enriched[4];
}

async function refreshHotList() {
  try {
    const [hotRes, rockRes, folkRes, ancientRes, acgRes, rapRes] = await Promise.all([
      searchMusicHotDetail(),
      getPlaylistDetail(ROCK_TOPLIST_ID),
      getPlaylistDetail(FOLK_TOPLIST_ID),
      getPlaylistDetail(ANCIENT_TOPLIST_ID),
      getPlaylistDetail(ACG_TOPLIST_ID),
      getPlaylistDetail(RAP_TOPLIST_ID),
    ]);
    hotList.value = normalizeHotList(hotRes.data);
    const [rock, folk, ancient, acg, rap] = await Promise.all([
      enrichBoardWithPlayCounts(normalizePlaylistBoard(rockRes.data)),
      enrichBoardWithPlayCounts(normalizePlaylistBoard(folkRes.data)),
      enrichBoardWithPlayCounts(normalizePlaylistBoard(ancientRes.data)),
      enrichBoardWithPlayCounts(normalizePlaylistBoard(acgRes.data)),
      enrichBoardWithPlayCounts(normalizePlaylistBoard(rapRes.data)),
    ]);
    rockList.value = rock;
    folkList.value = folk;
    ancientList.value = ancient;
    acgList.value = acg;
    rapList.value = rap;
  } catch {
    // ignore refresh errors and keep last known board data
  }
}

function selectBoard(board: BoardKey) {
  activeBoard.value = board;
}

function startHotAutoRefresh() {
  stopHotAutoRefresh();
  hotRefreshTimer = setInterval(() => {
    void refreshHotList();
  }, HOT_REFRESH_INTERVAL);
}

function stopHotAutoRefresh() {
  if (hotRefreshTimer) {
    clearInterval(hotRefreshTimer);
    hotRefreshTimer = undefined;
  }
}

let searchRequestSeq = 0;

async function onSearch() {
  const kw = keywords.value.trim() || uiStore.state.defaultSearchKeyword.trim();
  if (!kw) return;
  const requestSeq = ++searchRequestSeq;
  keywords.value = kw;
  uiStore.state.searchKeyword = kw;
  uiStore.state.searchType = activeSearchType.value;
  hasSearched.value = true;
  loading.value = true;
  try {
    const data = await searchMusic(kw, { type: activeSearchType.value });
    if (requestSeq !== searchRequestSeq) return;
    searchResult.value = data;
    songs.value = extractResults(data);
    handleSearch(kw);
  } finally {
    if (requestSeq === searchRequestSeq) loading.value = false;
  }
}

function useKeyword(kw: string) {
  keywords.value = kw;
  uiStore.state.searchKeyword = kw;
  void onSearch();
}

function useHistory(kw: string) {
  useKeyword(kw);
}

function selectSearchType(type: number) {
  activeSearchType.value = type;
  uiStore.state.searchType = type;
  if (hasSearched.value && keywords.value.trim()) {
    void onSearch();
  }
}

function openResult(item: any) {
  if (activeSearchType.value === 100) {
    emit('open-artist', item);
    return;
  }
  if (activeSearchType.value === 10) {
    emit('open-album-detail', Number(item.id || item.albumId || 0));
    return;
  }
  if (activeSearchType.value === 1000) {
    emit('open-playlist-detail', Number(item.id || item.playlistId || 0));
    return;
  }
  if (activeSearchType.value === 1002) {
    emit('open-user', Number(item.userId || item.id || item.uid || 0));
    return;
  }
  if (activeSearchType.value === 1004) {
    emit('open-mv-player', item);
    return;
  }
  if (activeSearchType.value === 1009 || activeSearchType.value === 2000) {
    emit('open-podcast-detail', item);
    return;
  }
}

function normalizeSongsLikeItems(list: any[]) {
  return list.filter((item: any) => item?.id || item?.name || item?.keyword || item?.nickname);
}

function onSongItemDblClick(event: MouseEvent, index: number) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, a, input, select, textarea, [role="button"]')) return;
  void playSong(index);
}

function isCurrentTrack(song: any) {
  return isCurrentTrackUtil(Number(song?.id || 0), Number(playerStore.state.currentSongId || 0));
}

async function playSong(index: number) {
  if (!songs.value.length) return;
  playerStore.setPlaylist(songs.value, index);
  await playerStore.playByIndex(index);
}

async function playSongFrom(list: any[], index: number) {
  if (!Array.isArray(list) || !list.length) return;
  playerStore.setPlaylist(list, index);
  await playerStore.playByIndex(index);
}

watch(
  () => uiStore.state.searchType,
  (next) => {
    activeSearchType.value = next || 1;
  },
);

watch(
  () => uiStore.state.searchKeyword,
  (next) => {
    const normalized = String(next || '');
    if (normalized === keywords.value) return;
    keywords.value = normalized;
    if (!normalized.trim()) return;
    void onSearch();
  },
);

watch(
  () => keywords.value,
  (next) => {
    if (next.trim()) return;
    searchRequestSeq += 1;
    hasSearched.value = false;
    loading.value = false;
    songs.value = [];
    searchResult.value = null;
  },
);

onMounted(() => {
  searchHistory.value = readSearchHistory();
  void refreshHotList();
  loadDefaults()
    .then(() => {
      startHotAutoRefresh();
    })
    .catch(() => undefined);

  if (keywords.value.trim()) {
    hasSearched.value = true;
    void onSearch();
  }
});

onBeforeUnmount(() => {
  stopHotAutoRefresh();
});
</script>

<style scoped>
@import '../styles/detail-page.css';

.search-page {
  width: 100%;
  min-width: 0;
  overflow-x: clip;
}

.artist-jump {
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.artist-jump:hover,
.artist-jump:focus-visible {
  color: var(--accent);
  text-decoration: underline;
}

.search-shell {
  display: grid;
  gap: var(--space-4);
}

.card { min-width: 0; }

h3,
.panel-title {
  margin: 0;
  color: var(--text-main);
}

.panel-title {
  font-size: var(--text-body-lg);
  font-weight: 700;
}

.sub,
.panel-sub {
  margin: var(--space-1) 0 0;
  color: var(--text-sub);
  font-size: 13px;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.search-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.search-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  min-width: 0;
}

.input {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-main);
  padding: 0 var(--space-2);
  box-sizing: border-box;
}

.type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
}

.type-tab {
  position: relative;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-sub);
  font-size: var(--text-label-md);
  font-weight: 600;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease;
}

.type-tab:hover {
  color: var(--text-main);
  transform: translateY(-1px);
}

.type-tab.active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-surface));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 10%, transparent);
}

.type-tab.active::after {
  display: none;
}

.search-stage {
  position: relative;
  min-width: 0;
}

.stage-panel {
  min-width: 0;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.hot-panel {
  display: grid;
  gap: var(--space-4);
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.hot-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-2);
}

.board-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  flex-wrap: wrap;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.board-tab {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-sub);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}

.board-tab:hover {
  color: var(--text-main);
}

.board-tab.active {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-surface));
  color: var(--accent);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .06);
}

.hot-list {
  margin: 0;
  padding: var(--space-1) 0 0;
  list-style: none;
}

.hot-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2);
  border-radius: 12px;
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, box-shadow .18s ease;
  min-width: 0;
}

.hot-item:hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface));
  transform: translateX(2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .05);
}

.rank {
  width: 22px;
  min-width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  text-align: center;
  font-weight: 800;
  font-size: var(--text-label-sm);
  background: var(--bg-muted);
  color: var(--text-sub);
}

.rank.top {
  background: color-mix(in srgb, #ef4444 16%, var(--bg-muted));
  color: color-mix(in srgb, #ef4444 85%, var(--text-main));
}

.rank.normal {
  color: var(--accent);
}

.kw {
  color: var(--text-main);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heat-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-self: end;
  margin-left: 0;
}

.heat {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  white-space: nowrap;
}

.heat-bar {
  width: 76px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-muted) 82%, var(--border));
}

.heat-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 88%, white), color-mix(in srgb, var(--accent) 55%, white));
}

.clear,
.search-btn,
.play,
.tag,
.suggestion,
.mixed-more {
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-main);
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.clear:hover,
.search-btn:hover,
.play:hover,
.tag:hover,
.suggestion:hover,
.mixed-more:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  box-shadow: 0 10px 18px color-mix(in srgb, var(--accent) 10%, transparent);
}

.clear:active,
.search-btn:active,
.play:active,
.tag:active,
.suggestion:active,
.mixed-more:active {
  transform: translateY(0) scale(0.99);
}

.clear {
  padding: var(--space-1) var(--space-2);
}

.search-btn {
  height: 38px;
  padding: 0 var(--space-3);
}

.history-tags,
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag,
.suggestion {
  padding: 5px 10px;
}

.suggestions {
  margin-top: var(--space-2);
}

.empty {
  color: var(--text-sub);
  font-size: 13px;
}

.results-block {
  display: grid;
  gap: var(--space-4);
}

.result-list {
  margin-top: 0;
}

/* 搜索页使用 detail-page.css 的 song-list/song-item 基线，这里只做轻量兼容 */
.song-list--search {
  margin: 0;
}
.song-cover {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  flex: 0 0 auto;
  background: var(--bg-muted);
  display: block;
}

.song-cover-fallback {
  display: grid;
  place-items: center;
  font-weight: 800;
  color: var(--text-sub);
}

.song-main,
.entity-main {
  min-width: 0;
  flex: 1;
}

.entity-topline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.name {
  color: var(--text-main);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  line-height: 1.35;
  max-height: calc(1.35em * 2);
}

.entity-date {
  -webkit-line-clamp: 1;
  max-height: 1.35em;
}

.entity-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-muted));
  color: var(--accent);
  font-size: var(--text-label-xs);
  font-weight: 700;
}

.play {
  height: 32px;
  padding: 0 var(--space-3);
  flex: 0 0 auto;
}

.entity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
  align-items: start;
}

.entity-grid.compact {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.playlist-list {
  grid-template-columns: 1fr;
}

.singer-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mv-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.album-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.album-card {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
}

.album-card .entity-cover,
.album-card .cover-image {
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  object-fit: cover;
  display: block;
  background: var(--bg-muted);
}

.album-card .entity-main {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 0;
  align-self: stretch;
  justify-items: start;
  align-content: start;
  justify-content: start;
  text-align: left;
}

.album-card .name,
.album-card .artist,
.album-card .entity-date {
  display: block;
  width: 100%;
  min-width: 0;
  justify-self: start;
  text-align: left;
}

.mv-card {
  flex-direction: column;
  align-items: stretch;
  padding: var(--space-2);
  gap: var(--space-2);
}

.mv-info {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 6px;
  justify-items: start;
  align-content: start;
  text-align: left;
}

.mv-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  text-align: left;
}

.mv-title,
.mv-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.mv-title {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  text-align: left;
}

.mv-artist {
  display: block;
  width: 100%;
  min-width: 0;
  white-space: nowrap;
  color: var(--text-sub);
  text-align: left;
}

.singer-card,
.mv-card {
  width: 100%;
}

.entity-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  text-align: left;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.entity-media-shell {
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 14px;
  transform: translateZ(0);
}

.entity-media-shell--avatar {
  border-radius: 14px;
}

.entity-cover-motion-shell {
  display: block;
  line-height: 0;
  transform-origin: center center;
}

.cover-image,
.featured-avatar,
.user-avatar {
  transition:
    transform var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease)),
    filter var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease));
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
}

.entity-card.clickable {
  cursor: pointer;
}

.entity-card.clickable:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
}

@media (hover: hover) and (pointer: fine) {
  .entity-card.clickable:hover .cover-image,
  .entity-card.clickable:focus-visible .cover-image,
  .entity-card.clickable:hover .featured-avatar,
  .entity-card.clickable:focus-visible .featured-avatar,
  .entity-card.clickable:hover .user-avatar,
  .entity-card.clickable:focus-visible .user-avatar {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}

.mv-card:hover .mv-play-count,
.mv-card:focus-visible .mv-play-count {
  opacity: 0;
  transform: translateY(-6px);
  filter: blur(2px);
}

.mv-card:hover .mv-play-button,
.mv-card:focus-visible .mv-play-button {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.playlist-card {
  width: 100%;
}

.entity-cover {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: var(--text-label-sm);
  font-weight: 800;
  color: #fff;
  flex: 0 0 auto;
  object-fit: cover;
  overflow: hidden;
}

.cover-image,
.playlist-image {
  object-fit: cover;
  background: var(--bg-muted);
}

.featured-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  object-fit: cover;
  flex: 0 0 auto;
}

.user-card {
  align-items: center;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  object-fit: cover;
  flex: 0 0 auto;
  border: 1px solid var(--border);
}

.user-signature {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  overflow: hidden;
}

.user-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.album-cover {
  background: linear-gradient(135deg, #f97316, #ef4444);
}

.artist-cover {
  background: linear-gradient(135deg, #14b8a6, #0ea5e9);
}

.playlist-cover {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.user-cover {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.mv-cover {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.mixed-feature,
.mixed-section {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
}

.mixed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.mixed-head h4 {
  margin: 0;
  color: var(--text-main);
  font-size: var(--text-body-md);
}

.mixed-more {
  padding: 6px 12px;
}

.loading-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.loading-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: 12px;
}

.loading-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.loading-rank {
  width: 20px;
  height: 18px;
  border-radius: 6px;
}

.loading-name {
  width: min(58%, 260px);
  height: 12px;
  border-radius: 999px;
}

.loading-artist {
  width: min(42%, 190px);
  height: 10px;
  border-radius: 999px;
}

.loading-btn {
  width: 54px;
  height: 28px;
  border-radius: 10px;
}

.shimmer {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-muted) 78%, var(--border));
}

.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 42%, transparent), transparent);
  animation: shimmer-slide 1.15s ease-in-out infinite;
}

.result-empty {
  margin-top: 0;
}

.search-swap-enter-active,
.search-swap-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease, max-height 0.32s ease;
  overflow: hidden;
}

.search-swap-enter-from,
.search-swap-leave-to {
  opacity: 0;
  transform: translateY(10px);
  max-height: 0;
}

.search-swap-enter-to,
.search-swap-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 2400px;
}

@keyframes shimmer-slide {
  100% {
    transform: translateX(100%);
  }
}

@media (max-width: 767px) {
  .history-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .search-input-row {
    grid-template-columns: 1fr;
  }

  .type-tabs {
    gap: var(--space-3);
  }

  .type-tab {
    font-size: var(--text-label-md);
  }

  .entity-grid,
  .singer-grid,
  .mv-grid {
    grid-template-columns: 1fr;
  }

  .hot-item {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .hot-head {
    flex-direction: column;
    align-items: stretch;
  }

  .board-tabs {
    width: fit-content;
    max-width: 100%;
  }

  .heat-wrap {
    grid-column: 2 / -1;
    justify-self: start;
  }
}
</style>
