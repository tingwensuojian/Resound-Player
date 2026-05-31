<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="mv-play-page playlist-detail-page">

    <div class="mv-play-content">
      <div class="mv-play-main">
        <div class="video-wrap">
          <video
            v-if="mvUrl"
            :src="mvUrl"
            controls
            autoplay
            playsinline
            preload="metadata"
            class="video"
          />
          <div v-else-if="playerLoading" class="video-placeholder">正在加载视频…</div>
          <div v-else-if="playerError" class="video-placeholder error">{{ playerError }}</div>
          <div v-else class="video-placeholder">暂无可播放地址</div>
        </div>
      </div>

      <aside class="mv-play-side">
        <div class="side-title-wrap">
          <p class="side-eyebrow">NOW PLAYING</p>
          <h3 class="side-title" :title="activeMv?.name">{{ activeMv?.name || 'MV 播放器' }}</h3>
          <p class="side-sub">{{ activeMv?.artistName || '未知歌手' }}</p>
        </div>

        <img v-if="activeMv?.cover" class="side-poster" :src="activeMv.cover" :alt="activeMv?.name || 'MV封面'" />

        <p class="side-meta">播放量：{{ formatCount(mvMeta?.playCount || activeMv?.playCount || 0) }}</p>

        <section class="mv-data-panel">
          <p class="data-title">MV 数据</p>
          <div class="data-grid">
            <p class="data-line">名称：{{ mvMeta?.name || activeMv?.name || '-' }}</p>
            <p class="data-line">歌手：{{ mvMeta?.artistName || activeMv?.artistName || '-' }}</p>
            <p class="data-line">发布时间：{{ mvMeta?.publishTime || '-' }}</p>
            <p class="data-line">点赞：{{ formatCount(mvMeta?.likedCount || 0) }}</p>
            <p class="data-line">评论：{{ formatCount(mvMeta?.commentCount || 0) }}</p>
            <p class="data-line">转发：{{ formatCount(mvMeta?.shareCount || 0) }}</p>
            <p class="data-line">收藏：{{ formatCount(mvMeta?.subscribeCount || 0) }}</p>
          </div>
          <p v-if="mvMeta?.desc" class="data-desc">简介：{{ mvMeta.desc }}</p>
          <p v-if="detailLoading" class="data-loading">MV 数据加载中…</p>
        </section>
      </aside>

      <section class="mv-play-comments">
        <CommentPanel
          :resource-id="(activeMv?.id as number) || 0"
          :resource-type="1"
          title="评论区"
          :fetcher="api.getMvComments"
          :sender="api.sendComment"
          :liker="api.likeComment"
          :deleter="api.deleteMvComment"
          @open-user="(uid) => emit('open-user', uid)"
        />
      </section>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  getMvDetail,
  getMvDetailInfo,
  getMvUgcInfo,
  getMvUrl,
} from '../api/music';
import * as api from '../api/music';
import AnimatedAppear from './AnimatedAppear.vue';
import CommentPanel from './CommentPanel.vue';

const props = defineProps<{ mv?: any | null; backLabel?: string }>();
const emit = defineEmits<{ (e: 'back'): void; (e: 'open-user', userId: number): void }>();

type MvItem = {
  id: number;
  name: string;
  cover: string;
  playCount: number;
  artistName?: string;
};

function normalizeInputMv(item: any): MvItem | null {
  const id = Number(item?.id || item?.mvid || item?.mvId || item?.vid || 0);
  if (!id) return null;
  return {
    id,
    name: item?.name || item?.title || '未命名 MV',
    cover:
      item?.cover ||
      item?.imgurl16v9 ||
      item?.coverImgUrl ||
      item?.picUrl ||
      item?.picUrl16v9 ||
      item?.imgurl ||
      '',
    playCount: Number(item?.playCount || item?.playTime || 0),
    artistName:
      item?.artistName ||
      item?.artist?.name ||
      item?.artists?.map((a: any) => a?.name).filter(Boolean).join('/') ||
      item?.creator?.nickname ||
      '',
  };
}

function formatCount(count = 0) {
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  return String(count);
}

const activeMv = ref<MvItem | null>(null);
const mvUrl = ref('');
const playerLoading = ref(false);
const playerError = ref('');

const detailLoading = ref(false);
const mvMeta = ref<{
  name?: string;
  artistName?: string;
  publishTime?: string;
  desc?: string;
  playCount?: number;
  commentCount?: number;
  shareCount?: number;
  likedCount?: number;
  subscribeCount?: number;
} | null>(null);

let openMvToken = 0;

async function openMv(item: MvItem) {
  const currentToken = ++openMvToken;
  activeMv.value = item;
  mvUrl.value = '';
  playerError.value = '';
  playerLoading.value = true;
  detailLoading.value = true;
  mvMeta.value = null;

  void getMvUrl(item.id, 1080)
    .then((res) => {
      if (currentToken !== openMvToken) return;
      const url = res?.data?.data?.url;
      if (url) {
        mvUrl.value = url;
      } else {
        playerError.value = '未获取到可播放视频地址';
      }
    })
    .catch(() => {
      if (currentToken !== openMvToken) return;
      playerError.value = 'MV 播放地址加载失败';
    })
    .finally(() => {
      if (currentToken !== openMvToken) return;
      playerLoading.value = false;
    });

  try {
    const [detailRes, infoRes, ugcRes] = await Promise.allSettled([
      getMvDetail(item.id),
      getMvDetailInfo(item.id),
      getMvUgcInfo(item.id),
    ]);

    if (currentToken !== openMvToken) return;

    const detailData = detailRes.status === 'fulfilled' ? detailRes.value?.data : null;
    const infoData = infoRes.status === 'fulfilled' ? infoRes.value?.data : null;
    const ugcData = ugcRes.status === 'fulfilled' ? ugcRes.value?.data : null;

    const detailMv = detailData?.data || detailData?.mv || detailData;
    const info = infoData || {};
    const ugc = ugcData?.data || ugcData || {};

    const rawPublishTime = detailMv?.publishTime || detailMv?.publishDate || detailMv?.publishdate;
    const publishTime = typeof rawPublishTime === 'string'
      ? rawPublishTime
      : rawPublishTime
        ? new Date(rawPublishTime).toLocaleDateString('zh-CN')
        : '';

    mvMeta.value = {
      name: detailMv?.name || item.name,
      artistName:
        detailMv?.artistName ||
        detailMv?.artist?.name ||
        (Array.isArray(detailMv?.artists) ? detailMv.artists.map((a: any) => a?.name).filter(Boolean).join(' / ') : '') ||
        item.artistName ||
        '',
      publishTime,
      desc: ugc?.desc || ugc?.briefDesc || detailMv?.desc || '',
      playCount: detailMv?.playCount ?? item.playCount,
      commentCount: info?.commentCount ?? 0,
      shareCount: info?.shareCount ?? 0,
      likedCount: info?.likedCount ?? info?.liked ?? 0,
      subscribeCount: info?.likedCount ?? info?.subCount ?? 0,
    };
  } catch (e: any) {
    if (currentToken !== openMvToken) return;
    playerError.value = e?.message || 'MV 数据加载失败';
  } finally {
    if (currentToken === openMvToken) {
      detailLoading.value = false;
    }
  }
}

watch(
  () => props.mv,
  (mv) => {
    const normalized = normalizeInputMv(mv);
    if (!normalized) return;
    void openMv(normalized);
  },
  { immediate: true },
);
</script>

<style scoped>
@import '../styles/detail-page.css';
.mv-play-page {
  padding: var(--space-4);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.mv-play-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  grid-template-areas:
    'video side'
    'comment comment';
  gap: 14px;
  align-items: start;
}

.mv-play-main {
  grid-area: video;
}

.video-wrap {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  background: transparent;
}

.video {
  width: 100%;
  display: block;
  aspect-ratio: 16 / 9;
  background: transparent;
  object-fit: cover;
}

.video-placeholder {
  width: 100%;
  min-height: 320px;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  color: var(--text-sub);
  background: var(--bg-muted);
  font-size: var(--text-label-md);
}

.video-placeholder.error {
  color: #fca5a5;
}

/* Sidebar */
.mv-play-side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  padding: 12px;
  background: var(--bg-solid);
}

.side-title-wrap {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-soft);
}

.side-eyebrow {
  margin: 0;
  font-size: var(--text-label-xs);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--accent);
}

.side-title {
  margin: 2px 0 0;
  font-size: var(--text-body-lg);
  line-height: 1.25;
  font-weight: 700;
  color: var(--text-main);
}

.side-sub {
  margin: 4px 0 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}

.side-poster {
  width: 100%;
  border-radius: 10px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.side-meta {
  margin: 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  padding-top: 6px;
  border-top: 1px dashed var(--border-soft);
}

/* MV Data Panel */
.mv-data-panel {
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-muted);
}

.data-title {
  margin: 0 0 6px;
  font-size: var(--text-label-sm);
  color: var(--accent);
  letter-spacing: 0.03em;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}

.data-line {
  margin: 0;
  color: var(--text-main);
  font-size: var(--text-label-sm);
  line-height: 1.4;
}

.data-desc {
  margin: 8px 0 0;
  color: var(--text-sub);
  font-size: var(--text-label-xs);
  line-height: 1.45;
}

.data-loading {
  margin: 6px 0 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}

/* Comments */
.mv-play-comments {
  grid-area: comment;
}

@media (max-width: 980px) {
  .mv-play-content {
    grid-template-columns: 1fr;
    grid-template-areas:
      'video'
      'side'
      'comment';
  }
}

@media (max-width: 767px) {
  .mv-play-page { padding: var(--space-2); }
  .data-grid { grid-template-columns: 1fr; }
}
</style>
