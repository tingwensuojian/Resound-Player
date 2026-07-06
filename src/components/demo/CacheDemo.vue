<!--
  ============================================================
  CacheDemo — TanStack Query 使用示范组件
  展示 useApiQuery 的三种典型用法
  ============================================================
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useApiQuery } from '../../composables/useApiQuery';

// ── 示例 1：简单查询 ──
const playlistId = ref(3778678);
const {
  data: playlistData,
  isPending: loadingPlaylist,
  error: playlistError,
  refetch: refetchPlaylist,
} = useApiQuery({
  queryKey: computed(() => ['playlist', playlistId.value]),
  queryFn: async () => {
    const { getPlaylistDetail } = await import('../../api/music');
    return getPlaylistDetail(playlistId.value);
  },
  ttl: 'ENTITY',
  enabled: computed(() => playlistId.value > 0),
});

const playlistName = computed(() =>
  playlistData.value?.data?.playlist?.name ?? '—',
);

// ── 示例 2：一次性数据（immutable） ──
const { data: staticData, isPending: loadingStatic } = useApiQuery({
  queryKey: ['top-playlists', 'hot'],
  queryFn: async () => {
    const { getPlaylistDetail } = await import('../../api/music');
    return getPlaylistDetail(3778678);
  },
  ttl: 'LIST',
  immutable: true,
});

// ── 示例 3：手动控制启用 ──
const searchEnabled = ref(false);
const searchKeyword = ref('');
const { data: searchResult } = useApiQuery({
  queryKey: computed(() => ['search', searchKeyword.value]),
  queryFn: async () => {
    const { cloudSearch } = await import('../../api/music');
    return cloudSearch({ keywords: searchKeyword.value, limit: 5 });
  },
  ttl: 'LIST_VOLATILE',
  enabled: computed(() => searchEnabled.value && searchKeyword.value.length > 0),
});

function triggerSearch() {
  searchKeyword.value = '周杰伦';
  searchEnabled.value = true;
}
</script>

<template>
  <div class="cache-demo">
    <h3>TanStack Query 缓存示范</h3>

    <!-- 示例 1 -->
    <section class="demo-section">
      <h4>① 实体查询（ENTITY TTL）</h4>
      <p v-if="loadingPlaylist">加载中...</p>
      <p v-else-if="playlistError">错误: {{ playlistError.message }}</p>
      <p v-else>歌单名称: <strong>{{ playlistName }}</strong></p>
      <button class="demo-btn" @click="refetchPlaylist">🔄 刷新</button>
      <button class="demo-btn" @click="playlistId = 745062260">切换歌单</button>
    </section>

    <!-- 示例 2 -->
    <section class="demo-section">
      <h4>② 一次性数据（Immutable）</h4>
      <p v-if="loadingStatic">加载中...</p>
      <p v-else>数据已缓存，不会后台刷新</p>
    </section>

    <!-- 示例 3 -->
    <section class="demo-section">
      <h4>③ 条件启用（enabled）</h4>
      <button class="demo-btn" @click="triggerSearch">搜索「周杰伦」</button>
      <p v-if="searchResult">
        搜索结果: {{ searchResult?.data?.result?.songs?.length ?? 0 }} 首
      </p>
    </section>
  </div>
</template>

<style scoped>
.cache-demo {
  padding: 16px;
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-lg, 14px);
  background: var(--bg-secondary, #1a1a2e);
  color: var(--text-primary, #eee);
  font-size: 14px;
  max-width: 480px;
}
h3 { margin: 0 0 12px; font-size: 16px; }
h4 { margin: 0 0 8px; font-size: 13px; font-weight: 500; color: var(--text-secondary, #999); }
.demo-section {
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-tertiary, #252540);
}
.demo-section:last-child { margin-bottom: 0; }
.demo-btn {
  margin-right: 6px;
  padding: 4px 12px;
  border: 1px solid var(--border, #444);
  border-radius: 6px;
  background: var(--bg-primary, #2a2a3e);
  color: var(--text-primary, #eee);
  cursor: pointer;
  font-size: 12px;
}
.demo-btn:hover { background: #3a3a5e; }
</style>
