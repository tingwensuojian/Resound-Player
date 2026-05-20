<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="user-split-view">
    <div class="split-stage" :class="{ 'has-detail': !!selectedItem }" :style="splitStageStyle">
      <aside class="left-panel">
        <div class="mini-profile user-mini-profile-card" v-if="profile">
          <img class="mini-avatar" :src="profile.avatarUrl" alt="头像" />
          <div class="mini-meta">
            <strong>{{ profile.nickname || '未命名用户' }}</strong>
            <span>{{ profile.signature || '这里展示用户简介与登录状态信息' }}</span>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat"><span class="stat-value">{{ detail?.profile?.followeds ?? 0 }}</span><span class="stat-label">粉丝</span></div>
          <div class="stat"><span class="stat-value">{{ detail?.profile?.follows ?? 0 }}</span><span class="stat-label">关注</span></div>
          <div class="stat"><span class="stat-value">{{ detail?.level ?? detail?.userPoint?.userLevel ?? 0 }}</span><span class="stat-label">等级</span></div>
        </div>

        <div class="tab-row ui-safe-rail">
          <button class="tab" :class="{ active: activeTab === 'playlists' }" @click="$emit('update:activeTab', 'playlists')">歌单列表</button>
          <button v-if="showCloudTab" class="tab" :class="{ active: activeTab === 'cloud' }" @click="$emit('update:activeTab', 'cloud')">云盘</button>
        </div>

        <div class="left-content">
          <div class="sub-tabs ui-safe-rail" :class="{ 'sub-tabs--fill': fillSubTabs }">
            <button class="sub-tab" :class="{ active: playlistSubTab === 'created' }" @click="$emit('update:playlistSubTab', 'created')">创建歌单</button>
            <button class="sub-tab" :class="{ active: playlistSubTab === 'collected' }" @click="$emit('update:playlistSubTab', 'collected')">收藏歌单</button>
            <button v-if="showAlbumTab" class="sub-tab" :class="{ active: playlistSubTab === 'albums' }" @click="$emit('update:playlistSubTab', 'albums')">收藏专辑</button>
            <button v-if="showPodcastTab" class="sub-tab" :class="{ active: playlistSubTab === 'podcast' }" @click="$emit('update:playlistSubTab', 'podcast')">收藏播客</button>
          </div>

          <div v-if="playlistSubTab === 'albums'" class="list-wrap">
            <button
              v-for="item in albumItems"
              :key="item.id"
              type="button"
              class="playlist-row"
              :class="{ active: selectedItem?.id === item.id }"
              @click="$emit('update:activeTab', 'playlists'); $emit('select-item', item)"
            >
              <img class="playlist-cover" :src="item.coverImgUrl || item.picUrl || item.coverUrl || profile?.avatarUrl" :alt="item.name" loading="lazy" />
              <div class="playlist-main">
                <strong>{{ item.name }}</strong>
                <span>{{ item.subtitle || item.artistName || item.artist || `${item.songCount ?? item.trackCount ?? item.size ?? item.subCount ?? 0} 首` }}</span>
              </div>
            </button>
          </div>

          <div v-else-if="playlistSubTab === 'podcast'" class="list-wrap">
            <button
              v-for="item in djItems"
              :key="item.id"
              type="button"
              class="dj-card"
              :class="{ active: selectedItem?.id === item.id }"
              @click="$emit('update:activeTab', 'playlists'); $emit('select-item', item)"
            >
              <img class="dj-cover" :src="item.picUrl || item.coverImgUrl || item.coverUrl || profile?.avatarUrl" :alt="item.name" loading="lazy" />
              <div class="dj-main">
                <strong>{{ item.name }}</strong>
                <span>{{ item.dj?.nickname || item.creator || '播客' }}</span>
                <small>{{ item.subCount ?? item.programCount ?? 0 }} 期</small>
              </div>
            </button>
          </div>

          <div v-else class="list-wrap">
            <button
              v-for="item in playlistItems"
              :key="item.id"
              type="button"
              class="playlist-row"
              :class="{ active: selectedItem?.id === item.id }"
              @click="$emit('update:activeTab', 'playlists'); $emit('select-item', item)"
            >
              <img class="playlist-cover" :src="item.coverImgUrl || item.picUrl || profile?.avatarUrl" :alt="item.name" loading="lazy" />
              <div class="playlist-main">
                <strong>{{ item.name }}</strong>
                <span>{{ item.subtitle }}</span>
              </div>
            </button>
          </div>
        </div>
        <ScrollToTopFab scrollHostSelector=".left-panel" />
      </aside>

      <section class="detail-panel" :style="detailPanelStyle">
        <div v-if="selectedItem" class="detail-body-wrap">
          <slot name="detail" :item="selectedItem" />
        </div>

        <div v-else class="detail-empty">
          <h3>请选择左侧内容</h3>
          <p>点击歌单或播客后，这里会联动显示对应详情。</p>
        </div>
        <ScrollToTopFab scrollHostSelector=".detail-panel" :threshold="100" />
      </section>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDominantColor } from '../composables/useDominantColor';
import AnimatedAppear from './AnimatedAppear.vue';
import ScrollToTopFab from './ui/ScrollToTopFab.vue';

const props = defineProps<{
  detail?: any;
  profile?: any;
  activeTab: 'playlists' | 'cloud';
  playlistSubTab: 'created' | 'collected' | 'albums' | 'podcast';
  playlistItems: any[];
  albumItems?: any[];
  djItems?: any[];
  selectedItem?: any;
  showCloudTab?: boolean;
  showAlbumTab?: boolean;
  showPodcastTab?: boolean;
  fillSubTabs?: boolean;
}>();

const showCloudTab = computed(() => props.showCloudTab !== false);
const showAlbumTab = computed(() => props.showAlbumTab !== false);
const fillSubTabs = computed(() => props.fillSubTabs === true);

const detailPanelStyle = computed(() => {
  const cover =
    props.selectedItem?.coverImgUrl ||
    props.selectedItem?.picUrl ||
    props.selectedItem?.coverUrl ||
    props.profile?.avatarUrl ||
    '';

  const accent =
    props.selectedItem?.color ||
    props.selectedItem?.themeColor ||
    props.selectedItem?.highlightColor ||
    '';

  return {
    '--detail-cover': cover ? `url(${cover})` : 'none',
    '--panel-accent': accent,
  } as Record<string, string>;
});

const selectedCoverUrl = computed(() => 
  props.selectedItem?.coverImgUrl || 
  props.selectedItem?.picUrl || 
  props.selectedItem?.coverUrl || 
  props.profile?.avatarUrl || 
  ''
);
useDominantColor(selectedCoverUrl);

const splitStageStyle = computed(() => {
  const avatar = props.profile?.avatarUrl || '';
  return {
    '--avatar-cover': avatar ? `url(${avatar})` : 'none',
  } as Record<string, string>;
});

defineEmits<{
  (e: 'update:activeTab', value: 'playlists' | 'cloud'): void;
  (e: 'update:playlistSubTab', value: 'created' | 'collected' | 'albums' | 'podcast'): void;
  (e: 'select-item', item: any): void;
}>();
</script>

<style scoped>
@import '../styles/detail-page.css';
.user-split-view { display: grid; gap: 16px; height: 100%; min-height: 0; }
.split-stage { display: grid; grid-template-columns: minmax(360px, 441px) minmax(0, 1fr); gap: 16px; align-items: start; min-height: 0; height: 100%; }
.left-panel, .detail-panel { border: 1px solid var(--border); border-radius: 20px; background: var(--bg-surface); }
.left-panel { padding: 18px; display: grid; gap: 16px; align-content: start; grid-auto-rows: min-content; min-height: 0; max-height: 100%; overflow: auto; scrollbar-width: none; -ms-overflow-style: none; }
.left-panel::-webkit-scrollbar, .detail-panel::-webkit-scrollbar, .list-wrap::-webkit-scrollbar { width: 0; height: 0; }
.mini-profile { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 16px; }
.mini-avatar { width: 90px; height: 90px; border-radius: 22px; object-fit: cover; position: relative; z-index: 1; }
.mini-meta { display: grid; gap: 4px; color: var(--text-sub); position: relative; z-index: 1; }
.mini-meta strong { color: var(--text-main); font-size: var(--text-body-lg); }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stat { padding: 12px; border-radius: 16px; background: var(--bg-muted); display: grid; gap: 4px; text-align: center; }
.stat-value { font-size: 22px; font-weight: 800; }
.stat-label { color: var(--text-sub); font-size: var(--text-label-sm); }
.tab-row, .sub-tabs { display: flex; gap: 8px; padding: 8px; border-radius: 18px; background: var(--bg-muted); width: 100%; box-sizing: border-box; min-height: 66px; }
.tab, .sub-tab { height: var(--button-height-lg); padding: 0 16px; margin: 0; border-radius: var(--button-radius-pill); color: var(--text-sub); font-weight: 600; cursor: pointer; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; box-sizing: border-box; transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}
.tab:hover, .sub-tab:hover { transform: translateY(-1px); }
.tab:active, .sub-tab:active { transform: translateY(0) scale(0.99); }
.tab { font-size: var(--text-body-md); flex: 1 1 0; }
.sub-tab { font-size: var(--text-label-md); flex: 0 0 auto; }
.sub-tabs--fill .sub-tab { flex: 1 1 0; }
.tab.active, .sub-tab.active {
  color: var(--text-main) !important;
  background: var(--button-surface-active-bg) !important;
  border-color: var(--button-surface-active-border) !important;
}
.left-content { display: grid; gap: 12px; min-height: 0; width: 100%; align-content: start; justify-items: stretch; grid-auto-rows: min-content; }
.list-wrap { display: grid; gap: 10px; min-height: 0; padding: 8px 2px; margin: -8px -2px; scrollbar-width: none; -ms-overflow-style: none; background: transparent !important; border: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.playlist-row, .dj-card {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 16px;
  text-align: left;
  background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}
.playlist-row:hover, .dj-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
  box-shadow: 0 10px 18px color-mix(in srgb, var(--accent) 8%, transparent);
}
.playlist-row:active, .dj-card:active { transform: translateY(0) scale(0.99); }
.playlist-row.active {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%), color-mix(in srgb, var(--accent) 10%, var(--bg-surface));
  box-shadow: 0 10px 22px color-mix(in srgb, var(--accent) 12%, transparent);
}
.playlist-cover, .dj-cover { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; flex: 0 0 auto; }
.playlist-main, .dj-main { display: grid; gap: 4px; min-width: 0; flex: 1; }
.playlist-main strong, .playlist-main span, .dj-main strong, .dj-main span, .dj-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.playlist-main span, .dj-main span, .dj-main small { color: var(--text-sub); font-size: 13px; }
.detail-panel { padding: 18px; min-height: 0; max-height: 100%; height: 100%; position: relative; overflow-y: auto; overflow-x: hidden; isolation: isolate; scrollbar-width: none; -ms-overflow-style: none; }
.detail-body-wrap { min-height: 100%; position: relative; z-index: 1; }
.detail-empty { min-height: 320px; display: grid; place-items: center; gap: 14px; text-align: center; color: var(--text-sub); }
.detail-empty h3 { margin: 0; color: var(--text-main); }
.detail-empty p { margin: 0; max-width: 28ch; line-height: 1.6; }
@media (max-width: 1180px) { .split-stage { grid-template-columns: 1fr; height: auto; } .left-panel, .detail-panel { max-height: none; } }
@media (max-width: 767px) { .tab, .sub-tab { height: 44px; } .tab { font-size: var(--text-body-md); } .sub-tab { font-size: 15px; } .stats-grid { grid-template-columns: 1fr; } .tab-row, .sub-tabs { width: 100%; } .playlist-row.active { padding: 9px 11px; } }
/* 右侧详情面板顶部主色渐变 - 使用封面主色从顶部渐变到透明 */
.detail-panel::before {
  content: '';
  position: absolute;
  top: -20px;
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
  pointer-events: none;
}

/* 隐藏全局 detail-page.css 中 detail-panel::after 的模糊封面，避免透出 */
.detail-panel::after {
  display: none;
}
</style>
