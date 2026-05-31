<!--
  DetailShrinkExample.vue

  与 SPlayer-dev 的 ListDetail.vue 完全一致的详情页头部缩小/放大示例。
  Tabs + Search 在封面下方，背景高斯模糊覆盖整个头部。
-->
<template>
  <div class="shrink-demo-page">
    <!-- Detail Header (position: absolute, float on top) -->
    <div :class="['list-detail', { small: listScrolling }]">
      <div class="detail">
        <!-- 背景高斯模糊 -->
        <div
          class="hero-bg"
          :style="{ backgroundImage: `url(${coverUrl})` }"
        ></div>

        <!-- 主内容：封面 + 信息 -->
        <div class="detail-body">
          <div class="cover">
            <img :src="coverUrl" class="cover-img" />
            <div class="cover-mask" />
            <div class="play-count">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span class="num">{{ formatCount(playCount) }}</span>
            </div>
          </div>
          <div class="data">
            <h2 class="name">{{ title }}</h2>
            <div v-if="!listScrolling" class="collapse">
              <p v-if="description" class="description">{{ description }}</p>
              <div class="meta">
                <div class="item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>{{ creator }}</span>
                </div>
                <div class="item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                  <span>{{ songCount }} 首</span>
                </div>
              </div>
            </div>
            <div class="menu">
              <div class="left">
                <button class="btn-play" @click="$emit('play-all')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  播放全部
                </button>
                <button class="btn-like" title="收藏">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </button>
                <button class="btn-more" title="更多">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs + Search：封面下方，在背景内 -->
        <div class="detail-tabs">
          <DetailTabBar
            v-model="activeTab"
            :tabs="tabs"
            aria-label="歌单详情标签"
            v-model:search-query="searchQuery"
            :show-search="activeTab === 'songs'"
          />
        </div>
      </div>
    </div>

    <!-- 歌曲列表（可滚动，驱动 shrink） -->
    <div ref="scrollRef" class="song-list-scroll" @scroll="handleListScroll">
      <div v-for="(song, i) in displaySongs" :key="i" class="song-item">
        <span class="col-num">{{ i + 1 }}</span>
        <div class="col-cover">
          <div class="mini-cover"></div>
        </div>
        <div class="col-title">
          <span class="song-name">{{ song.name }}</span>
          <span class="song-artist">{{ song.artist }}</span>
        </div>
        <span class="col-duration">{{ song.duration }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useListScroll } from '../composables/useScrollShrink'
import DetailTabBar from './ui/DetailTabBar.vue'

const props = withDefaults(
  defineProps<{
    coverUrl?: string
    title: string
    description?: string
    creator?: string
    songCount?: number
    playCount?: number
    songs?: { name: string; artist: string; duration: string; album?: string }[]
  }>(),
  {
    coverUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgNDAwIDQwMCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjY3ZWVhIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzc2NGJhMiIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9InVybCgjZykiLz4KICA8Y2lyY2xlIGN4PSIyMDAiIGN5PSIxNzAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMTUpIi8+CiAgPHBhdGggZD0iTTE4NSAxNDUgbDAgNTAgMzUtMjV6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuNikiLz4KICA8dGV4dCB4PSIyMDAiIHk9IjI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjUpIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCI+56S65L6L5LiT6L6RPC90ZXh0PgogIDx0ZXh0IHg9IjIwMCIgeT0iMzEwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMykiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEzIj5EZW1vIENvdmVyPC90ZXh0Pgo8L3N2Zz4=',
    description: '',
    creator: '未知用户',
    songCount: 0,
    playCount: 0,
    songs: () => [],
  },
)

defineEmits<{
  'play-all': []
}>()

const { listScrolling, handleListScroll } = useListScroll()

const activeTab = ref('songs')
const searchQuery = ref('')
const tabs = [
  { key: 'songs', label: '歌曲' },
  { key: 'comments', label: '评论' },
]

const displaySongs = computed(() => {
  if (!searchQuery.value) return props.songs
  const q = searchQuery.value.toLowerCase()
  return props.songs.filter(
    (s) => s.name.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q),
  )
})

function formatCount(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}
</script>

<style scoped>
/* =========================================
 * 页面容器
 * ========================================= */
.shrink-demo-page {
  height: calc(100% + 16px);
  display: flex;
  flex-direction: column;
  position: relative;
  margin: -16px -16px 0 -16px;
  overflow-x: hidden;
}

/* =========================================
 * ListDetail
 * ========================================= */
.list-detail {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.list-detail .detail {
  position: absolute;
  display: flex;
  flex-direction: column;
  height: 290px;
  width: 100%;
  padding: 12px 24px 16px 24px;
  will-change: height, opacity;
  z-index: 1;
  overflow: hidden;
  box-sizing: border-box;
  transition:
    height 0.3s,
    opacity 0.3s;
}

/* 主内容行（封面 + 信息） */
.detail-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* =========================================
 * 高斯模糊背景
 * ========================================= */
.hero-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(24px) saturate(1.3);
  opacity: 0.35;
  z-index: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.list-detail.small .hero-bg {
  opacity: 0;
}

/* =========================================
 * 封面
 * ========================================= */
.cover {
  position: relative;
  display: flex;
  width: auto;
  height: 100%;
  aspect-ratio: 1/1;
  margin-right: 20px;
  border-radius: 8px;
  transition:
    opacity 0.3s,
    margin 0.3s,
    transform 0.3s;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.cover-img {
  border-radius: 8px;
  overflow: hidden;
  z-index: 1;
  transition:
    opacity 0.3s,
    filter 0.3s,
    transform 0.3s;
}



.cover-mask {
  position: absolute;
  top: 0;
  left: 0;
  height: 30%;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  z-index: 1;
  background: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0));
  transition: opacity 0.3s;
}

.play-count {
  position: absolute;
  display: flex;
  align-items: center;
  top: 10px;
  right: 12px;
  color: #fff;
  font-weight: bold;
  z-index: 2;
  transition: opacity 0.3s;
}

.play-count svg {
  color: #fff;
  margin-right: 4px;
}

.cover:active {
  transform: scale(0.98);
}

/* =========================================
 * 信息区 .data
 * ========================================= */
.data {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  
}

.description {
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.name {
  font-size: 30px;
  font-weight: bold;
  margin-bottom: 12px;
  margin-top: 0;
  transition:
    font-size 0.3s ease,
    color 0.3s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.collapse {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta .item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  opacity: 0.7;
}

.meta .item svg {
  flex-shrink: 0;
}

/* =========================================
 * 操作区 .menu（按钮行）
 * ========================================= */
.menu {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  margin-top: auto;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 25px;
  background: var(--accent, #1ed760);
  color: #000;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-play:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
}

.btn-play:active {
  transform: scale(0.98);
}

.btn-like {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-soft, #888);
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-like:hover {
  background: var(--bg-hover, rgba(255,255,255,0.08));
}

.btn-like:active {
  transform: scale(0.95);
}

.btn-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-soft, #888);
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-more:hover {
  background: var(--bg-hover, rgba(255,255,255,0.08));
}

.btn-more:active {
  transform: scale(0.95);
}

/* =========================================
 * Tabs + Search 行（在 .detail 底部）
 * ========================================= */
.detail-tabs {
  padding-top: 8px;
  z-index: 1;
  position: relative;
  transition: padding 0.3s ease;
}

.list-detail.small .detail-tabs {
  padding-top: 4px;
}

/* tabs 缩小 */
.list-detail.small :deep(.playlist-tab) {
  height: 30px !important;
  min-width: 72px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
}

.list-detail.small :deep(.tab-search-input) {
  height: 28px !important;
  width: 140px !important;
  font-size: 12px !important;
  padding: 0 28px 0 12px !important;
}

.list-detail.small :deep(.tab-search-clear) {
  width: 18px !important;
  height: 18px !important;
  right: 5px !important;
}

.list-detail.small :deep(.playlist-tabs) {
  gap: 8px !important;
}

/* =========================================
 * .small 状态 — 头部缩小
 * ========================================= */
.list-detail.small .detail {
  height: 160px;
  padding: 8px 16px 8px 16px;
}


.list-detail.small .detail-body {
  align-items: center;
}

.list-detail.small .cover {
  margin-right: 12px;
}

.list-detail.small .cover-mask,
.list-detail.small .play-count {
  opacity: 0;
}

.list-detail.small .name {
  font-size: 22px;
  margin-bottom: 4px;
}


.list-detail.small .btn-play {
  height: 32px;
  padding: 0 18px;
  font-size: 13px;
}

.list-detail.small .btn-like {
  width: 32px;
  height: 32px;
}

.list-detail.small .btn-more {
  width: 32px;
  height: 32px;
}

/* =========================================
 * 歌曲列表
 * ========================================= */
.song-list-scroll {
  flex: 1;
  overflow-y: auto;
  margin-top: 290px; /* = detail height */
  transition: margin-top 0.3s ease;
}

.list-detail.small ~ .song-list-scroll {
  margin-top: 160px; /* = detail height (small) */
}

.song-item {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.song-item:hover {
  background: var(--bg-hover, rgba(255,255,255,0.04));
}

.col-num {
  width: 40px;
  min-width: 40px;
  text-align: center;
  opacity: 0.5;
  font-variant-numeric: tabular-nums;
}

.col-cover {
  width: 40px;
  min-width: 40px;
  margin-right: 12px;
}

.mini-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: var(--bg-muted, rgba(255,255,255,0.06));
}

.col-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-right: 12px;
}

.song-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-duration {
  width: 50px;
  text-align: right;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .list-detail .detail {
    height: 220px;
    padding: 8px 16px 12px 16px;
  }

  .cover {
    margin-right: 12px;
  }

  .data .name {
    font-size: 22px;
    margin-bottom: 8px;
  }

  .collapse {
    top: 42px;
  }

  .btn-play {
    height: 34px;
    padding: 0 16px;
    font-size: 13px;
  }

  .btn-like,
  .btn-more {
    width: 34px;
    height: 34px;
  }

  .list-detail.small .detail {
    height: 136px;
    padding: 6px 12px 6px 12px;
  }

  .list-detail.small .name {
    font-size: 18px;
  }

  .list-detail.small .btn-play {
    height: 30px;
    padding: 0 14px;
    font-size: 12px;
  }

  .list-detail.small .btn-like,
  .list-detail.small .btn-more {
    width: 30px;
    height: 30px;
  }

  .list-detail.small :deep(.playlist-tab) {
    height: 26px !important;
    min-width: 64px !important;
    padding: 0 10px !important;
    font-size: 11px !important;
  }

  .list-detail.small :deep(.tab-search-input) {
    height: 24px !important;
    width: 120px !important;
    font-size: 11px !important;
  }

  .list-detail.small .detail-tabs {
    padding-top: 2px;
  }

  .song-list-scroll {
    margin-top: 220px; /* mobile detail height */
  }

  .list-detail.small ~ .song-list-scroll {
    margin-top: 136px; /* mobile small detail height */
  }
}
</style>
