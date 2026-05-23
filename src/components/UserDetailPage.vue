<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="playlist-detail-page user-detail-page">
    <div class="playlist-detail-back">
      <button class="back-btn" @click="emit('back')">← {{ props.backLabel }}</button>
    </div>

    <DetailStickyHeroHeader
      :loading="loading"
      :ready="!!userDetail"
      :error="error"
      loading-text="用户详情加载中…"
    >
      <template #media>
        <HeroCoverMedia :src="avatarUrl" :alt="displayName" />
      </template>
      <template #title>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">{{ displayName }}</AnimatedAppear>
      </template>
      <template #meta>
        <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="sub-row user-meta-row">
          <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="meta-pill">创建歌单：{{ createdPlaylists.length }}</AnimatedAppear>
          <AnimatedAppear tag="span" variant="text" rhythm="body" class-name="meta-pill">收藏歌单：{{ collectedPlaylists.length }}</AnimatedAppear>
        </AnimatedAppear>
        <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="desc">{{ userSignature }}</AnimatedAppear>
      </template>
      <template #actions>
        <UserFollowButton
          v-if="userId && userId !== userStore.state.profile?.userId"
          :status="followState.status.value"
          :loading="followState.isLoading.value"
          @toggle="followState.toggle"
        />
        <AnimatedAppear
          tag="button"
          variant="control"
          rhythm="actions"
          class-name="play-all"
          @click="openFirstPlaylist"
        >打开首个歌单</AnimatedAppear>
      </template>
      <template #tabs>
        <AnimatedAppear v-if="userDetail" tag="div" variant="content" rhythm="body" class-name="user-tabs" role="tablist" aria-label="用户歌单标签">
          <AnimatedAppear
            v-for="tab in tabs"
            :key="tab.key"
            tag="button"
            variant="control"
            rhythm="actions"
            class-name="user-tab"
            :class="{ active: activeTab === tab.key }"
            type="button"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </AnimatedAppear>
        </AnimatedAppear>
      </template>
    </DetailStickyHeroHeader>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="user-detail-body">
      <AnimatedAppear v-if="loading && !userDetail" tag="div" variant="text" rhythm="body" class-name="state">用户详情加载中…</AnimatedAppear>
      <AnimatedAppear v-else-if="error" tag="div" variant="text" rhythm="body" class-name="state error">{{ error }}</AnimatedAppear>
      <AnimatedAppear v-else-if="playlistList.length" tag="ul" variant="content" rhythm="list" class-name="song-list">
        <AnimatedAppear
          v-for="(playlist, idx) in playlistList"
          :key="playlist.id || idx"
          tag="li"
          variant="text"
          rhythm="list"
          :index="idx"
          class-name="song-item"
          @dblclick="onPlaylistItemDblClick($event, playlist.id)"
        >
          <AnimatedAppear tag="div" variant="text" rhythm="list" :index="idx" class-name="idx">{{ idx + 1 }}</AnimatedAppear>
          <AnimatedAppear tag="img" variant="media" rhythm="list" :index="idx" class-name="song-cover" :src="resolvePlaylistCover(playlist)" :alt="playlist.name || '歌单封面'" />
          <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="song-meta">
            <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="song-name">{{ playlist.name || '未命名歌单' }}</AnimatedAppear>
            <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="song-artist">{{ resolvePlaylistSubtitle(playlist) }}</AnimatedAppear>
          </AnimatedAppear>
          <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="idx" class-name="play-btn" @click="emitOpenPlaylist(playlist.id)">查看</AnimatedAppear>
        </AnimatedAppear>
      </AnimatedAppear>
      <AnimatedAppear v-else-if="userDetail" tag="div" variant="text" rhythm="body" class-name="state">暂无{{ activeTab === 'created' ? '创建' : '收藏' }}歌单</AnimatedAppear>
    </AnimatedAppear>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useDetailStickyState } from '../composables/useDetailStickyState';
import HeroCoverMedia from './HeroCoverMedia.vue';
import { useDominantColor } from '../composables/useDominantColor';
import AnimatedAppear from './AnimatedAppear.vue';
import DetailStickyHeroHeader from './DetailStickyHeroHeader.vue';
import { getUserCollectedPlaylist, getUserCreatedPlaylist, getUserDetail } from '../api/auth';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import UserFollowButton from './ui/UserFollowButton.vue';
import { useUserFollow } from '../composables/useUserFollow';

const props = withDefaults(
  defineProps<{
    userId: number;
    backLabel?: string;
  }>(),
  {
    backLabel: '返回搜索结果',
  },
);

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-playlist-detail', playlistId: number): void;
}>();

const loading = ref(false);
const error = ref('');
const userDetail = ref<any>(null);
const createdPlaylists = ref<any[]>([]);
const collectedPlaylists = ref<any[]>([]);
const activeTab = ref<'created' | 'collected'>('created');
const tabs = [
  { key: 'created', label: '创建歌单' },
  { key: 'collected', label: '收藏歌单' },
] as const;

const userIdRef = computed(() => props.userId || undefined);
const followState = useUserFollow({ id: userIdRef });

const displayName = computed(() => userDetail.value?.profile?.nickname || userDetail.value?.nickname || '未命名用户');
const avatarUrl = computed(() => normalizeImageUrl(userDetail.value?.profile?.avatarUrl || userDetail.value?.avatarUrl || ''));
useDominantColor(avatarUrl);
const userSignature = computed(() => userDetail.value?.profile?.signature || userDetail.value?.signature || '这个用户还没有留下签名。');
const playlistList = computed(() => activeTab.value === 'created' ? createdPlaylists.value : collectedPlaylists.value);

function normalizeImageUrl(url?: string) {
  return url ? String(url).replace(/^http:\/\//, 'https://') : '';
}

function resolvePlaylistCover(item: any) {
  return normalizeImageUrl(item?.coverImgUrl || item?.picUrl || item?.coverUrl || avatarUrl.value);
}

function resolvePlaylistSubtitle(item: any) {
  const creator = item?.creator?.nickname || displayName.value;
  const count = Number(item?.trackCount || item?.songCount || 0);
  return `${creator} · ${count} 首`;
}

function emitOpenPlaylist(playlistId: number) {
  if (!playlistId) return;
  emit('open-playlist-detail', Number(playlistId));
}

function onPlaylistItemDblClick(event: MouseEvent, playlistId: number) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, a, input, select, textarea, [role="button"]')) return;
  emitOpenPlaylist(playlistId);
}

function openFirstPlaylist() {
  const first = playlistList.value[0] || createdPlaylists.value[0] || collectedPlaylists.value[0];
  if (first?.id) emitOpenPlaylist(Number(first.id));
}

let fetchToken = 0;
async function fetchUserDetail(id: number) {
  if (!id) return;
  const currentToken = ++fetchToken;
  loading.value = true;
  error.value = '';
  try {
    const [detailRes, createdRes, collectedRes] = await Promise.all([
      getUserDetail(id),
      getUserCreatedPlaylist(id, 100, 0),
      getUserCollectedPlaylist(id, 100, 0),
    ]);
    if (currentToken !== fetchToken) return;
    userDetail.value = detailRes?.data || detailRes;
    const allCreated = normalizePlaylistArray(createdRes);
    const allCollected = normalizePlaylistArray(collectedRes);
    createdPlaylists.value = allCreated.filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) === Number(id));
    collectedPlaylists.value = allCollected.filter((item: any) => Number(item?.creator?.userId || item?.userId || 0) !== Number(id));
    activeTab.value = 'created';
  } catch (e: any) {
    if (currentToken !== fetchToken) return;
    userDetail.value = null;
    createdPlaylists.value = [];
    collectedPlaylists.value = [];
    error.value = e?.message || '用户详情加载失败';
  } finally {
    if (currentToken === fetchToken) loading.value = false;
  }
}

function normalizePlaylistArray(payload: any): any[] {
  const candidates = [
    payload?.data?.playlist,
    payload?.data?.playlists,
    payload?.data?.data?.playlist,
    payload?.playlist,
    payload?.playlists,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

const { refresh } = useDetailStickyState(
  computed(() => avatarUrl.value?.trim() || ''),
);

// 切换标签时重置滚动位置
watch(activeTab, () => {
  refresh();
});

onMounted(() => {
  fetchUserDetail(props.userId);
});
</script>

<style scoped>
@import '../styles/detail-page.css';

.cover {
  width: 308px;
  height: 308px;
  border-radius: 18px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.user-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.user-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 18px 0 20px;
}

.user-tab {
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

.user-tab:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
}

.user-tab.active {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 90%, #fff), color-mix(in srgb, var(--accent) 68%, #000));
  color: #fff;
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

.user-detail-body {
  flex: 1;
  min-height: 400px;
}

@media (max-width: 767px) {
  .user-tabs {
    gap: 10px;
  }

  .user-tab {
    min-width: auto;
    padding: 0 14px;
    height: 36px;
  }
}
</style>
