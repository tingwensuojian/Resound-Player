<template>
  <PageLayoutShell shell-class="rank-page-shell" body-class="rank-page-body">
    <template #default>
      <AnimatedAppear v-if="error" tag="p" variant="text" rhythm="body" class-name="error">{{ error }}</AnimatedAppear>

      <div v-if="list.length" class="rank-content">
        <AnimatedAppear v-if="featuredList.length" tag="section" variant="content" rhythm="body" class-name="section featured">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">推荐榜</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="featured-scroll ui-safe-rail">
            <AnimatedAppear
              v-for="(item, idx) in featuredList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="featured-card hover-play-button-trigger interactive-media-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <InteractiveCoverMedia
                :src="item.coverImgUrl"
                :alt="item.name"
                :index="idx"
                shell-class="featured-media-shell"
                motion-class="featured-cover-motion-shell"
                image-class="featured-cover"
              />
              <HoverPlayButton class="rank-hover-play hover-play-button--lg" />
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="curatedList.length" tag="section" variant="content" rhythm="body" class-name="section curated-section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">精选榜</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="curated-grid">
            <AnimatedAppear
              v-for="(item, idx) in curatedList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="curated-card hover-play-button-trigger interactive-media-trigger"
              :class="`palette-${(idx % 5) + 1}`"
              :style="{ '--curated-cover': `url(${item.coverImgUrl})` }"
              type="button"
              @click="openDetail(item.id)"
            >
              <InteractiveCoverMedia
                :src="item.coverImgUrl"
                :alt="item.name"
                :index="idx"
                shell-class="curated-media-shell"
                motion-class="curated-cover-motion-shell"
                image-class="curated-cover"
              />
              <HoverPlayButton class="rank-hover-play hover-play-button--lg" />
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="officialList.length" tag="section" variant="content" rhythm="body" class-name="section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">官方榜</AnimatedAppear>
            <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="section-sub">平台重点维护榜单</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="grid-wrap">
            <AnimatedAppear
              v-for="(item, idx) in officialList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="rank-card interactive-media-trigger"
              :style="rankCardStyle(item.coverImgUrl)"
              type="button"
              @click="openDetail(item.id)"
            >
              <InteractiveCoverMedia
                :src="item.coverImgUrl"
                :alt="item.name"
                :index="idx"
                shell-class="rank-media-shell"
                motion-class="rank-cover-motion-shell"
                image-class="rank-cover"
              />
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="rank-main">
                <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="rank-top">
                  <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="rank-name">{{ item.name }}</AnimatedAppear>
                  <AnimatedAppear tag="div" variant="content" rhythm="actions" :index="idx" class-name="rank-tags">
                    <AnimatedAppear tag="span" variant="control" rhythm="actions" :index="idx" class-name="trend" :class="trendClass(item)">{{ trendLabel(item) }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="text" rhythm="body" :index="idx" class-name="pill">{{ normalizeUpdateFrequency(item.updateFrequency) }}</AnimatedAppear>
                  </AnimatedAppear>
                </AnimatedAppear>
                <AnimatedAppear tag="ol" variant="content" rhythm="list" :index="idx" class-name="track-list">
                  <AnimatedAppear v-for="(track, trackIdx) in getTopTracks(item)" :key="`${item.id}-${trackIdx}`" tag="li" variant="text" rhythm="list" :index="trackIdx">
                    <AnimatedAppear tag="span" variant="text" rhythm="list" :index="trackIdx" class-name="track-no" :class="`n-${trackIdx + 1}`">{{ trackIdx + 1 }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="content" rhythm="list" :index="trackIdx" class-name="track-text">
                      <span class="track-song">{{ track.name }}</span>
                      <template v-if="track.artists.length">
                        <span class="track-separator"> - </span>
                        <template v-if="track.clickable">
                          <button
                            v-for="artist in track.artists"
                            :key="`${item.id}-${trackIdx}-${artist.id || artist.name}`"
                            type="button"
                            class="artist-inline-btn"
                            @click.stop="openArtistDetail(artist)"
                          >
                            {{ artist.name || '未知歌手' }}
                          </button>
                        </template>
                        <template v-else>
                          <span class="track-artist-fallback">{{ track.artists.map((artist) => artist.name).filter(Boolean).join('/') }}</span>
                        </template>
                      </template>
                    </AnimatedAppear>
                  </AnimatedAppear>
                </AnimatedAppear>
              </AnimatedAppear>
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="globalList.length" tag="section" variant="content" rhythm="body" class-name="section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">全球榜</AnimatedAppear>
            <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="section-sub">海外与国际热度榜单</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="global-grid">
            <AnimatedAppear
              v-for="(item, idx) in globalList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="global-card interactive-media-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-cover-wrap">
                <InteractiveCoverMedia
                  :src="item.coverImgUrl"
                  :alt="item.name"
                  :index="idx"
                  shell-class="global-media-shell"
                  motion-class="global-cover-motion-shell"
                  image-class="global-cover"
                />
              </AnimatedAppear>
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-info">
                <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-title-block">
                  <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-title-row">
                    <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="global-name">{{ item.name }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="control" rhythm="actions" :index="idx" class-name="trend" :class="trendClass(item)">{{ trendLabel(item) }}</AnimatedAppear>
                  </AnimatedAppear>
                  <AnimatedAppear tag="span" variant="text" rhythm="body" :index="idx" class-name="global-update">{{ normalizeUpdateFrequency(item.updateFrequency) }}</AnimatedAppear>
                </AnimatedAppear>
                <AnimatedAppear tag="ol" variant="content" rhythm="list" :index="idx" class-name="global-track-list">
                  <AnimatedAppear v-for="(track, trackIdx) in getTopTracks(item).slice(0, 3)" :key="`${item.id}-${trackIdx}`" tag="li" variant="text" rhythm="list" :index="trackIdx">
                    <AnimatedAppear tag="span" variant="text" rhythm="list" :index="trackIdx" class-name="global-track-no">{{ trackIdx + 1 }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="content" rhythm="list" :index="trackIdx" class-name="global-track-text">
                      <span class="track-song">{{ track.name }}</span>
                      <template v-if="track.artists.length">
                        <span class="track-separator"> - </span>
                        <template v-if="track.clickable">
                          <button
                            v-for="artist in track.artists"
                            :key="`${item.id}-${trackIdx}-${artist.id || artist.name}`"
                            type="button"
                            class="artist-inline-btn"
                            @click.stop="openArtistDetail(artist)"
                          >
                            {{ artist.name || '未知歌手' }}
                          </button>
                        </template>
                        <template v-else>
                          <span class="track-artist-fallback">{{ track.artists.map((artist) => artist.name).filter(Boolean).join('/') }}</span>
                        </template>
                      </template>
                    </AnimatedAppear>
                  </AnimatedAppear>
                </AnimatedAppear>
              </AnimatedAppear>
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="languageList.length" tag="section" variant="content" rhythm="body" class-name="section language-section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">语种榜</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="language-grid">
            <AnimatedAppear
              v-for="(item, idx) in languageList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="language-card hover-play-button-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <div class="language-media-shell">
                <AnimatedAppear tag="div" variant="media" rhythm="list" :index="idx" class-name="language-cover-motion-shell">
                  <img class="language-cover" :src="item.coverImgUrl" :alt="formatLanguageTitle(item.name)" loading="lazy" />
                </AnimatedAppear>
              </div>
              <AnimatedAppear tag="img" variant="media" rhythm="list" :index="idx" class-name="language-flag" :src="getLanguageFlag(item.id)" :alt="`${formatLanguageTitle(item.name)} 国旗`" loading="lazy" />
              <HoverPlayButton class="rank-hover-play hover-play-button--md" />
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="genreList.length" tag="section" variant="content" rhythm="body" class-name="section genre-section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">曲风榜</AnimatedAppear>
            <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="section-sub">按风格聚合的热门歌单</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="genre-grid">
            <AnimatedAppear
              v-for="(item, idx) in genreList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="genre-card hover-play-button-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <div class="genre-media-shell">
                <AnimatedAppear tag="div" variant="media" rhythm="list" :index="idx" class-name="genre-cover-motion-shell">
                  <img class="genre-cover" :src="item.coverImgUrl" :alt="item.name" loading="lazy" />
                </AnimatedAppear>
              </div>
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="genre-meta">
                <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="genre-name">{{ item.name }}</AnimatedAppear>
                <AnimatedAppear tag="span" variant="text" rhythm="body" :index="idx" class-name="genre-update">{{ normalizeUpdateFrequency(item.updateFrequency) }}</AnimatedAppear>
              </AnimatedAppear>
              <HoverPlayButton class="rank-hover-play" />
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="carList.length" tag="section" variant="content" rhythm="body" class-name="section car-section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">车友榜</AnimatedAppear>
            <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="section-sub">车主与出行场景热门歌单</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="car-grid">
            <AnimatedAppear
              v-for="(item, idx) in carList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="car-card hover-play-button-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <div class="car-media-shell">
                <AnimatedAppear tag="div" variant="media" rhythm="list" :index="idx" class-name="car-cover-motion-shell">
                  <img class="car-cover" :src="item.coverImgUrl" :alt="item.name" loading="lazy" />
                </AnimatedAppear>
              </div>
              <HoverPlayButton class="rank-hover-play" />
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>

        <AnimatedAppear v-if="otherList.length" tag="section" variant="content" rhythm="body" class-name="section">
          <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="section-head">
            <AnimatedAppear tag="h3" variant="title" rhythm="title">更多榜单</AnimatedAppear>
            <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="section-sub">风格与场景榜</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="global-grid">
            <AnimatedAppear
              v-for="(item, idx) in otherList"
              :key="item.id"
              tag="button"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="global-card interactive-media-trigger"
              type="button"
              @click="openDetail(item.id)"
            >
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-cover-wrap">
                <InteractiveCoverMedia
                  :src="item.coverImgUrl"
                  :alt="item.name"
                  :index="idx"
                  shell-class="global-media-shell"
                  motion-class="global-cover-motion-shell"
                  image-class="global-cover"
                />
              </AnimatedAppear>
              <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-info">
                <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-title-block">
                  <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="global-title-row">
                    <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="global-name">{{ item.name }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="control" rhythm="actions" :index="idx" class-name="trend" :class="trendClass(item)">{{ trendLabel(item) }}</AnimatedAppear>
                  </AnimatedAppear>
                  <AnimatedAppear tag="span" variant="text" rhythm="body" :index="idx" class-name="global-update">{{ normalizeUpdateFrequency(item.updateFrequency) }}</AnimatedAppear>
                </AnimatedAppear>
                <AnimatedAppear tag="ol" variant="content" rhythm="list" :index="idx" class-name="global-track-list">
                  <AnimatedAppear v-for="(track, trackIdx) in getTopTracks(item).slice(0, 3)" :key="`${item.id}-${trackIdx}`" tag="li" variant="text" rhythm="list" :index="trackIdx">
                    <AnimatedAppear tag="span" variant="text" rhythm="list" :index="trackIdx" class-name="global-track-no">{{ trackIdx + 1 }}</AnimatedAppear>
                    <AnimatedAppear tag="span" variant="content" rhythm="list" :index="trackIdx" class-name="global-track-text">
                      <span class="track-song">{{ track.name }}</span>
                      <template v-if="track.artists.length">
                        <span class="track-separator"> - </span>
                        <template v-if="track.clickable">
                          <button
                            v-for="artist in track.artists"
                            :key="`${item.id}-${trackIdx}-${artist.id || artist.name}`"
                            type="button"
                            class="artist-inline-btn"
                            @click.stop="openArtistDetail(artist)"
                          >
                            {{ artist.name || '未知歌手' }}
                          </button>
                        </template>
                        <template v-else>
                          <span class="track-artist-fallback">{{ track.artists.map((artist) => artist.name).filter(Boolean).join('/') }}</span>
                        </template>
                      </template>
                    </AnimatedAppear>
                  </AnimatedAppear>
                </AnimatedAppear>
              </AnimatedAppear>
            </AnimatedAppear>
          </AnimatedAppear>
        </AnimatedAppear>
      </div>

      <AnimatedAppear v-else-if="!loading" tag="p" variant="text" rhythm="body" class-name="muted">暂无排行榜数据</AnimatedAppear>
    </template>
  </PageLayoutShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getPlaylistTrackAll, getToplistDetail } from '../api/music';
import { apiCache, CACHE_TTL } from '../stores/apiCache';
import InteractiveCoverMedia from './InteractiveCoverMedia.vue';
import AnimatedAppear from './AnimatedAppear.vue';
import HoverPlayButton from './HoverPlayButton.vue';
import PageLayoutShell from './PageLayoutShell.vue';

type StyleValue = Record<string, string | number>;
type ToplistTrack = { first?: string; second?: string };
type ArtistBrief = { id?: number; name?: string };
type PlaylistTrack = { id: number; name?: string; ar?: ArtistBrief[] };
type RankTrackDisplay = {
  name: string;
  artists: ArtistBrief[];
  plainText: string;
  clickable: boolean;
};
type ToplistItem = {
  id: number;
  name: string;
  coverImgUrl: string;
  updateFrequency?: string;
  description?: string;
  category?: string;
  ToplistType?: string;
  tracks?: ToplistTrack[];
};

const RECOMMEND_NAMES = [
  '云音乐飙升榜',
  '云音乐新歌榜',
  '网易原创歌曲榜',
  '云音乐热歌榜',
  '云音乐说唱榜',
  '云音乐欧美热歌榜',
  '云音乐韩国热歌榜',
  '云音乐日本热歌榜',
];

const FIXED_CURATED_IDS = [7785066739, 7785123708, 6723173524, 8532443277, 7775163417];

const emit = defineEmits<{
  (e: 'open-detail', playlistId: number, coverUrl?: string): void;
  (e: 'open-artist', artist: ArtistBrief): void;
}>();

const loading = ref(false);
const error = ref('');
const list = ref<ToplistItem[]>([]);
const cardTracksMap = ref<Record<number, RankTrackDisplay[]>>({});

const featuredList = computed(() => {
  const selected: ToplistItem[] = [];
  for (const name of RECOMMEND_NAMES) {
    const found = list.value.find((item) => item.name === name || item.name.includes(name));
    if (found && !selected.some((x) => x.id === found.id)) selected.push(found);
  }
  if (selected.length >= 4) return selected.slice(0, 8);
  const fallback = [...selected];
  for (const item of list.value) {
    if (!fallback.some((x) => x.id === item.id)) fallback.push(item);
    if (fallback.length >= 8) break;
  }
  return fallback;
});

const officialList = computed(() => list.value.filter((item) => item.ToplistType === 'A' || item.category === '官方'));

const curatedList = computed(() => {
  const byId = new Map(list.value.map((item) => [item.id, item]));
  return FIXED_CURATED_IDS.map((id) => byId.get(id)).filter(Boolean) as ToplistItem[];
});

const FIXED_GLOBAL_IDS = [60198, 180106, 60131, 27135204, 6939992364, 3812895];
const FIXED_LANGUAGE_IDS = [2809513713, 2809577409, 5059644681, 745956260, 6732051320, 7095271308, 6732014811];
const FIXED_GENRE_IDS = [5059642708, 5059661515, 5059633707, 6723173524, 7785066739];
const FIXED_CAR_IDS = [8703179781, 8703052295, 8702582160, 8703220480, 8702982391, 10131772880, 10162841534, 12717025277];

const globalList = computed(() => {
  const byId = new Map(list.value.map((item) => [item.id, item]));
  return FIXED_GLOBAL_IDS.map((id) => byId.get(id)).filter(Boolean) as ToplistItem[];
});

const languageList = computed(() => {
  const byId = new Map(list.value.map((item) => [item.id, item]));
  return FIXED_LANGUAGE_IDS.map((id) => byId.get(id)).filter(Boolean) as ToplistItem[];
});

const genreList = computed(() => {
  const byId = new Map(list.value.map((item) => [item.id, item]));
  return FIXED_GENRE_IDS.map((id) => byId.get(id)).filter(Boolean) as ToplistItem[];
});

const carList = computed(() => {
  const byId = new Map(list.value.map((item) => [item.id, item]));
  return FIXED_CAR_IDS.map((id) => byId.get(id)).filter(Boolean) as ToplistItem[];
});

const otherList = computed(() => {
  const occupied = new Set<number>();
  for (const item of featuredList.value) occupied.add(item.id);
  for (const item of curatedList.value) occupied.add(item.id);
  for (const item of officialList.value) occupied.add(item.id);
  for (const item of globalList.value) occupied.add(item.id);
  for (const item of languageList.value) occupied.add(item.id);
  for (const item of genreList.value) occupied.add(item.id);
  for (const item of carList.value) occupied.add(item.id);
  return list.value.filter((item) => !occupied.has(item.id));
});

function rankCardStyle(coverUrl?: string) {
  if (!coverUrl) return {};
  return { '--cover-bg-url': `url(${coverUrl})`, '--detail-head-fade-height': '102px', '--detail-head-fade-soft': '72px' } as StyleValue;
}

function formatCuratedName(name: string) {
  return (name || '').replace(/^黑胶/, 'VIP').replace(/排行榜周榜|排行榜|周榜/g, '').trim();
}

function formatLanguageTitle(name: string) {
  const source = (name || '').trim();
  if (/欧美热歌/.test(source)) return '欧美热歌榜';
  if (/欧美新歌/.test(source)) return '欧美新歌榜';
  if (/日语|日本/.test(source)) return '日语榜';
  if (/韩语|韩国/.test(source)) return '韩语榜';
  if (/俄/.test(source)) return '俄语榜';
  if (/泰语|泰国/.test(source)) return '泰语榜';
  if (/越南/.test(source)) return '越南语榜';
  return source.replace(/^网易云/, '').trim();
}

function getLanguageFlag(id: number) {
  const map: Record<number, string> = {
    2809513713: 'https://flagcdn.com/w40/eu.png',
    2809577409: 'https://flagcdn.com/w40/eu.png',
    5059644681: 'https://flagcdn.com/w40/jp.png',
    745956260: 'https://flagcdn.com/w40/kr.png',
    6732051320: 'https://flagcdn.com/w40/ru.png',
    7095271308: 'https://flagcdn.com/w40/th.png',
    6732014811: 'https://flagcdn.com/w40/vn.png',
  };
  return map[id] || 'https://flagcdn.com/w40/un.png';
}

function openDetail(id: number) {
  const item = list.value.find((x) => x.id === id);
  emit('open-detail', id, item?.coverImgUrl || '');
}

function normalizeUpdateFrequency(text?: string) {
  const source = (text || '').trim();
  if (!source) return '实时更新';
  if (/刚刚|实时/.test(source)) return '实时更新';
  if (/小时/.test(source)) return '每小时更新';
  if (/天|日/.test(source)) return '每日更新';
  if (/周/.test(source)) return '每周更新';
  return source;
}

function trendLabel(item: ToplistItem) {
  if (/飙升|上升/i.test(item.name)) return '升';
  if (/新歌/i.test(item.name)) return '新';
  return '稳';
}

function trendClass(item: ToplistItem) {
  const label = trendLabel(item);
  if (label === '升') return 'rise';
  if (label === '新') return 'new';
  return 'steady';
}

function normalizeArtistBriefs(artists: ArtistBrief[] = []) {
  return artists.filter((artist) => artist?.id || artist?.name);
}

function buildRankTrackDisplay(song: string, artists: ArtistBrief[] = []): RankTrackDisplay | null {
  const cleanSong = (song || '').trim();
  if (!cleanSong) return null;
  const normalizedArtists = normalizeArtistBriefs(artists);
  const artistText = normalizedArtists.map((artist) => artist.name).filter(Boolean).join('/');
  return {
    name: cleanSong,
    artists: normalizedArtists,
    plainText: artistText ? `${cleanSong} - ${artistText}` : cleanSong,
    clickable: normalizedArtists.some((artist) => artist?.id),
  };
}

function getTopTracks(item: ToplistItem) {
  const enriched = cardTracksMap.value[item.id] || [];
  if (enriched.length) return enriched;
  const tracks = Array.isArray(item.tracks) ? item.tracks : [];
  const picked = tracks
    .slice(0, 3)
    .map((it) => buildRankTrackDisplay(it.first || '', [{ name: (it.second || '').trim() }]))
    .filter(Boolean) as RankTrackDisplay[];
  if (picked.length) return picked;
  return [
    { name: '暂无歌曲摘要', artists: [], plainText: '暂无歌曲摘要', clickable: false },
    { name: '点击进入查看完整榜单', artists: [], plainText: '点击进入查看完整榜单', clickable: false },
  ];
}

function openArtistDetail(artist: ArtistBrief) {
  const artistId = Number(artist?.id || 0);
  if (!artistId) return;
  emit('open-artist', artist);
}

function formatTrackDisplay(track: PlaylistTrack) {
  return buildRankTrackDisplay(track.name || '', Array.isArray(track.ar) ? track.ar : []);
}

let hydrateToken = 0;

async function hydrateCardTracks() {
  const currentToken = ++hydrateToken;
  const merged: ToplistItem[] = [];
  const appendUnique = (items: ToplistItem[]) => {
    for (const item of items) if (!merged.some((x) => x.id === item.id)) merged.push(item);
  };
  appendUnique(featuredList.value);
  appendUnique(officialList.value);
  appendUnique(globalList.value);
  appendUnique(otherList.value);
  const targets = merged.slice(0, 36);
  if (!targets.length) return;
  await Promise.all(
    targets.map(async (item) => {
      if (cardTracksMap.value[item.id]?.length) return;
      try {
        const { data } = await getPlaylistTrackAll({ id: item.id, limit: 3, offset: 0 });
        if (currentToken !== hydrateToken) return;
        const songs = (data?.songs || []) as PlaylistTrack[];
        const lines = songs.map(formatTrackDisplay).filter(Boolean).slice(0, 3) as RankTrackDisplay[];
        if (lines.length) {
          cardTracksMap.value = { ...cardTracksMap.value, [item.id]: lines };
        }
      } catch {
        // ignore single card fetch failure
      }
    }),
  );
}

async function fetchToplist() {
  loading.value = true;
  error.value = '';

  // 检查缓存
  const cached = apiCache.get('toplist:detail');
  if (cached?.data) {
    list.value = cached.data as ToplistItem[];
    loading.value = false;
    void hydrateCardTracks();
    return;
  }

  try {
    const { data } = await getToplistDetail();
    list.value = (data?.list || []) as ToplistItem[];
    apiCache.set('toplist:detail', list.value, CACHE_TTL.LIST_VOLATILE);
    loading.value = false;
    void hydrateCardTracks();
  } catch (e: any) {
    error.value = e?.message || '排行榜加载失败';
    list.value = [];
    loading.value = false;
  }
}

onMounted(() => {
  fetchToplist();
});
</script>

<style scoped>
@import '../styles/hover-play-button.css';

.rank-page-shell { }

.rank-page-body { }

.page-head__content { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.title { margin: 0; font-size: 20px; font-weight: 700; }
.refresh-btn { height: 32px; padding: 0 var(--space-3); border-radius: 8px; border: 1px solid var(--border); background: var(--bg-muted); color: var(--text-main); cursor: pointer; }
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: var(--danger); margin: 0; }
.section { display: grid; gap: var(--space-2); }
.section-head { display: flex; align-items: baseline; gap: var(--space-2); }
.section-head h3 { margin: 0; font-size: 17px; color: var(--text-main); }
.section-sub { color: var(--text-soft); font-size: var(--text-label-sm); }
.featured-scroll { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); }
.rank-hover-play { right: 18px; bottom: 18px; z-index: 3; }
.curated-section { gap: var(--space-2); }
.curated-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); }
.curated-card {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  width: 100%;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease, border-color 0.2s ease;
}
.curated-media-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 10px;
  transform: translateZ(0);
}
.curated-cover-motion-shell {
  position: relative;
  width: 100%;
  height: 100%;
  display: block;
  line-height: 0;
  transform-origin: center center;
}
.curated-card::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 10px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.2) 28%,
    rgba(255, 255, 255, 0.52) 62%,
    rgba(255, 255, 255, 0.92) 100%
  );
}
.curated-cover {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 10px;
  object-fit: cover;
  background: var(--bg-surface);
  transition:
    transform var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease)),
    filter var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease));
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
}
.curated-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px color-mix(in srgb, var(--text-main) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, var(--border)); }
@media (hover: hover) and (pointer: fine) {
  .curated-card:hover .curated-cover,
  .curated-card:focus-visible .curated-cover {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}

.language-section { gap: var(--space-2); }
.language-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 14px; }
.language-card { position: relative; min-height: 128px; padding: 10px; cursor: pointer; display: grid; gap: 8px; text-align: left; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.language-card { --hover-play-button-size: 34px; --hover-play-button-offset: 9px; }
.language-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px color-mix(in srgb, var(--text-main) 12%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, var(--border)); }
.language-cover { width: 100%; aspect-ratio: 1 / 1; border-radius: 10px; object-fit: cover; display: block; }
.language-flag { position: absolute; top: 14px; right: 14px; width: 32px; height: 23px; border-radius: 5px; object-fit: cover; display: block; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22); }

.genre-section { gap: var(--space-2); }
.genre-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); }
.genre-card { --hover-play-button-size: 34px; --hover-play-button-offset: 9px; position: relative; padding: 10px; cursor: pointer; display: grid; gap: 8px; text-align: left; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.genre-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px color-mix(in srgb, var(--text-main) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, var(--border)); }
.genre-cover { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; display: block; }
.genre-meta { min-width: 0; display: grid; gap: 4px; }
.genre-card .rank-hover-play { right: 18px; bottom: 68px; z-index: 2; }
.genre-name { margin: 0; font-size: var(--text-label-md); font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.genre-update { font-size: var(--text-label-xs); color: var(--text-soft); }

.car-section { gap: var(--space-2); }
.car-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: var(--space-2); }
.car-card { --hover-play-button-size: 30px; --hover-play-button-offset: 8px; padding: 10px; cursor: pointer; display: block; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.car-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px color-mix(in srgb, var(--text-main) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, var(--border)); }
.car-cover { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; display: block; }

.global-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.global-card {
  padding: var(--space-2);
  display: grid;
  grid-template-columns: 142px 1fr;
  gap: 10px;
  align-items: start;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}
.global-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px color-mix(in srgb, var(--text-main) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}
.global-info { min-width: 0; align-self: stretch; display: grid; align-content: space-between; gap: 8px; }
.global-title-block { min-width: 0; display: grid; gap: 4px; align-content: start; }
.global-title-row { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: flex-start; gap: var(--space-1); }
.global-name { min-width: 0; margin: 0; font-size: 22px; line-height: 1.15; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.global-update { justify-self: end; font-size: var(--text-label-xs); color: var(--text-soft); }
.rank-media-shell,
.global-media-shell,
.featured-media-shell,
.language-media-shell,
.genre-media-shell,
.car-media-shell { position: relative; overflow: hidden; border-radius: 10px; transform: translateZ(0); }
.rank-cover-motion-shell,
.global-cover-motion-shell,
.featured-cover-motion-shell,
.language-cover-motion-shell,
.genre-cover-motion-shell,
.car-cover-motion-shell { display: block; line-height: 0; transform-origin: center center; }
.global-cover-wrap { position: relative; width: 142px; height: 142px; border-radius: 14px; overflow: hidden; }
.global-cover,
.rank-cover,
.featured-cover,
.language-cover,
.genre-cover,
.car-cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition:
    transform var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease)),
    filter var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease));
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
}
.global-cover { width: 142px; height: 142px; border-radius: 14px; box-shadow: none; }
.featured-media-shell {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
:deep(.featured-cover-motion-shell) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  line-height: 0;
  transform-origin: center center;
}
:deep(.featured-cover) {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  object-position: center center;
}
@media (hover: hover) and (pointer: fine) {
  .rank-card:hover .rank-cover,
  .rank-card:focus-visible .rank-cover,
  .global-card:hover .global-cover,
  .global-card:focus-visible .global-cover,
  .featured-card:hover :deep(.featured-cover),
  .featured-card:focus-visible :deep(.featured-cover),
  .language-card:hover .language-cover,
  .language-card:focus-visible .language-cover,
  .genre-card:hover .genre-cover,
  .genre-card:focus-visible .genre-cover,
  .car-card:hover .car-cover,
  .car-card:focus-visible .car-cover {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}
.global-track-list { align-self: end; margin: 0; padding: 0 0 2px; list-style: none; display: grid; gap: 5px; color: var(--text-sub); font-size: var(--text-label-sm); }
.global-track-list li { display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 6px; min-width: 0; }
.global-track-no { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 6px; font-size: var(--text-label-xs); line-height: 1; font-weight: 700; color: var(--text-sub); background: var(--bg-muted); }
.global-track-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-label-sm); line-height: 1.2; color: var(--text-sub); }
.featured-card {
  --featured-cover-focus-y: 50%;
  position: relative;
  overflow: hidden;
  display: block;
  aspect-ratio: 2.65 / 1;
  width: 100%;
  padding: 0;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.featured-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px color-mix(in srgb, var(--text-main) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, var(--border)); }
.featured-meta { min-width: 0; display: grid; gap: var(--space-1); align-content: center; padding-right: 44px; }
.featured-name { margin: 0; color: var(--text-main); font-size: var(--text-label-md); line-height: 1.3; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.featured-update { color: var(--text-soft); font-size: var(--text-label-sm); }
.language-flag { position: absolute; top: 14px; right: 14px; width: 32px; height: 23px; border-radius: 5px; object-fit: cover; display: block; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22); }
.trend { height: 20px; min-width: 20px; border-radius: 999px; padding: 0 var(--space-1); display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-label-xs); font-weight: 700; border: 1px solid transparent; }
.trend.rise { color: #b91c1c; background: #fee2e2; border-color: #fecaca; }
.trend.new { color: #92400e; background: #fef3c7; border-color: #fde68a; }
.trend.steady { color: #065f46; background: #d1fae5; border-color: #a7f3d0; }
.grid-wrap { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.rank-card { position: relative; display: grid; grid-template-columns: 96px 1fr; padding: var(--space-2); gap: var(--space-2); text-align: left; cursor: pointer; overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.rank-card:hover { transform: translateY(-2px); box-shadow: 0 10px 18px color-mix(in srgb, var(--accent) 16%, rgba(15, 23, 42, 0.1)); }
.rank-cover { width: 96px; height: 96px; border-radius: 10px; object-fit: cover; }
.rank-main { min-width: 0; display: grid; gap: var(--space-1); }
.rank-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.rank-name { margin: 0; font-size: var(--text-label-md); color: var(--text-main); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-tags { display: inline-flex; align-items: center; gap: var(--space-1); }
.pill { flex: 0 0 auto; font-size: var(--text-label-xs); color: var(--text-sub); background: var(--bg-muted); border: 1px solid var(--border); border-radius: 999px; padding: 2px var(--space-1); }
.track-list { margin: 0; padding: 0; list-style: none; color: var(--text-sub); font-size: var(--text-label-sm); display: grid; gap: var(--space-1); }
.track-list li { display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: var(--space-1); min-width: 0; }
.track-no { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 6px; font-size: var(--text-label-xs); font-weight: 700; color: var(--text-sub); background: var(--bg-muted); }
.track-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track-song,
.track-artist-fallback { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.global-track-text .track-song,
.global-track-text .track-artist-fallback { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.global-track-text .track-song { color: inherit; font-weight: inherit; }
.global-track-text .track-artist-fallback,
.global-track-text .artist-inline-btn,
.global-track-text .track-separator { color: inherit; }
.track-separator { color: var(--text-soft); }
.muted { margin: 0; color: var(--text-soft); }
.rank-content { display: grid; gap: var(--space-3); }
@media (max-width: 1280px) { .featured-scroll { grid-template-columns: repeat(3, minmax(0, 1fr)); } .curated-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .language-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .genre-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } .car-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } .grid-wrap { grid-template-columns: repeat(2, minmax(0, 1fr)); } .global-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 980px) { .featured-scroll { grid-template-columns: repeat(2, minmax(0, 1fr)); } .curated-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .language-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .genre-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .car-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .grid-wrap { grid-template-columns: repeat(1, minmax(0, 1fr)); } .global-card { grid-template-columns: 104px 1fr; padding: var(--space-2); gap: var(--space-2); } .global-name { font-size: 20px; } .global-cover-wrap, .global-cover { width: 104px; height: 104px; } }
@media (max-width: 767px) { .rank-page-header { align-items: flex-start; flex-direction: column; } .featured-scroll { display: flex; padding-bottom: var(--space-0); } .featured-card { flex: 0 0 196px; } .curated-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .curated-card { min-height: 112px; padding: 8px; border-radius: 12px; } .curated-card::before { inset: 8px; border-radius: 8px; } .language-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .language-card { min-height: 110px; border-radius: 12px; } .genre-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .car-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .rank-card { grid-template-columns: 80px 1fr; } .rank-cover { width: 80px; height: 80px; } .rank-tags { flex-wrap: wrap; justify-content: flex-end; } .global-card { grid-template-columns: 1fr; } .global-cover-wrap { width: 112px; height: 112px; } .global-cover { width: 112px; height: 112px; } .global-track-list { gap: 10px; } .global-track-no { font-size: 20px; } .global-track-text { font-size: var(--text-label-md); } }
</style>
