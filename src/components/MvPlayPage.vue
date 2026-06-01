<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="mv-play-page">

    <div class="mv-play-content">
      <div class="mv-play-main">
        <div ref="videoSectionRef" class="video-section">
          <div class="video-wrap" :class="{ 'video-wrap--pip-hidden': pipActive }">
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
          <!-- 画中画占位：保持滚动高度 -->
          <div v-if="pipActive" class="pip-placeholder"></div>
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
  
  <!-- 画中画浮动条 - Teleport 到 body 避免 position:fixed 被父级 contain 拦截 -->
  <Teleport to="body">
    <div v-if="pipActive" class="mv-pip-floating" @click="scrollToTop">
      <div class="pip-floating-wrap">
        <video
          ref="pipVideoElRef"
          :src="mvUrl"
          controls
          autoplay
          playsinline
          preload="metadata"
          class="pip-video"
        />
      </div>
      <button class="pip-floating-close" @click.stop="pipActive = false">✕</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
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

// 画中画（PiP）状态
const pipActive = ref(false);
const videoSectionRef = ref<HTMLElement | null>(null);
const pipVideoElRef = ref<HTMLVideoElement | null>(null);
const PIP_THRESHOLD = 80;
let pipScrollTarget: HTMLElement | null = null;
let savedPlayTime = 0;

function scrollToTop() {
  const content = document.querySelector('.content');
  if (content) content.scrollTop = 0;
}

function syncVideoTime() {
  // 同步两个 video 元素的播放位置
  const origVideo = document.querySelector('.video-wrap video') as HTMLVideoElement | null;
  const pipVideo = pipVideoElRef.value;
  if (!origVideo && !pipVideo) return;
  const srcVideo = pipActive.value ? origVideo : pipVideo;
  const dstVideo = pipActive.value ? pipVideo : origVideo;
  if (srcVideo && dstVideo && !isNaN(srcVideo.currentTime)) {
    dstVideo.currentTime = srcVideo.currentTime;
  }
}

function checkPip() {
  if (!videoSectionRef.value || !pipScrollTarget) return;
  const rect = videoSectionRef.value.getBoundingClientRect();
  const contentRect = pipScrollTarget.getBoundingClientRect();
  const videoTop = rect.top - contentRect.top;
  const shouldPip = videoTop < -PIP_THRESHOLD || (rect.bottom < contentRect.top);
  if (shouldPip !== pipActive.value) {
    // 切换前同步播放位置
    if (pipActive.value !== shouldPip) {
      savedPlayTime = document.querySelector('.video-wrap video')?.currentTime || 0;
    }
    pipActive.value = shouldPip;
    // 切换后恢复播放位置
    nextTick(() => {
      const targetVideo = pipActive.value ? pipVideoElRef.value : document.querySelector('.video-wrap video') as HTMLVideoElement | null;
      if (targetVideo && savedPlayTime > 0) {
        targetVideo.currentTime = savedPlayTime;
        targetVideo.play().catch(() => {});
      }
    });
  }
}

onMounted(() => {
  pipScrollTarget = document.querySelector('.content') as HTMLElement | null;
  if (!pipScrollTarget) return;
  pipScrollTarget.addEventListener('scroll', checkPip, { passive: true });
  // 初始检查
  checkPip();
});

onUnmounted(() => {
  if (pipScrollTarget) {
    pipScrollTarget.removeEventListener('scroll', checkPip);
  }
});


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


/* ── 画中画（PiP）── */
.video-section {
  position: relative;
}

.video-wrap--pip-hidden {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
}

.pip-placeholder {
  width: 100%;
  aspect-ratio: 16 / 9;
  pointer-events: none;
}

/* ── Teleport 到 body 的浮动画中画 ── */
.mv-pip-floating {
  position: fixed;
  bottom: calc(var(--player-bar-height, 84px) + 16px);
  right: 16px;
  width: min(360px, 40vw);
  z-index: 99999;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  cursor: pointer;
  animation: pip-enter 0.35s cubic-bezier(0.34, 1, 0.64, 1);
}

.pip-floating-wrap {
  width: 100%;
  line-height: 0;
}

.pip-video {
  width: 100%;
  display: block;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.pip-floating-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 1;
  opacity: 0;
  transition: opacity 0.2s;
}

.mv-pip-floating:hover .pip-floating-close {
  opacity: 1;
}

@keyframes pip-enter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.85);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 980px) {
  .mv-pip-floating {
    right: 8px;
    bottom: calc(var(--player-bar-height, 84px) + 8px);
    width: min(280px, 50vw);
  }
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
