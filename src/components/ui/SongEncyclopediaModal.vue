<template>
  <transition name="enc-fade">
    <div v-if="open" class="enc-backdrop" @click.self="close">
      <section class="enc-shell" role="dialog" aria-modal="true" aria-label="歌曲百科">
        <header class="enc-header">
          <h3 class="enc-title">音乐百科</h3>
          <button class="enc-close" type="button" aria-label="关闭" @click="close">×</button>
        </header>

        <div class="enc-body">
          <div v-if="loading" class="enc-loading">加载中…</div>
          <div v-else-if="error" class="enc-error">{{ error }}</div>
          <div v-else-if="wikiItems.length" class="enc-wiki-list">
            <div v-for="(item, idx) in wikiItems" :key="idx" class="enc-wiki-row">
              <span class="enc-wiki-label">{{ item.label }}</span>
              <span v-if="item.linkType === 'artist'" class="enc-wiki-value">
                <template v-for="(name, i) in item.linkNames" :key="i">
                  <button v-if="i > 0" class="enc-link-sep" disabled aria-hidden="true"> / </button>
                  <button class="enc-link" type="button" @click.stop="openArtist(item.linkIds![i])">{{ name }}</button>
                </template>
              </span>
              <button v-else-if="item.linkType === 'album'" class="enc-wiki-value enc-link" type="button" @click.stop="openAlbum(item.linkIds![0])">{{ item.value }}</button>
              <button v-else-if="item.linkType === 'language'" class="enc-wiki-value enc-link" type="button" @click.stop="openLanguage(item.value)">{{ item.value }}</button>
              <span v-else class="enc-wiki-value">{{ item.value }}</span>
            </div>
          </div>
          <div v-else class="enc-empty">暂无百科信息</div>
        </div>
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { getSongEncyclopedia } from '../../api/music';
import { useUserStore } from '../../stores/user';
const userStore = useUserStore();

const props = withDefaults(
  defineProps<{
    songId?: number;
  }>(),
  { songId: 0 },
);

interface WikiItem {
  label: string;
  value: string;
  linkType?: 'artist' | 'album' | 'language';
  linkIds?: number[];
  linkNames?: string[];
}

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-artist', artist: any): void;
  (e: 'open-album', albumId: number): void;
  (e: 'open-language', language: string): void;
}>();

const open = ref(false);
const loading = ref(false);
const error = ref('');
const wikiItems = ref<WikiItem[]>([]);

function close() {
  open.value = false;
  wikiItems.value = [];
  error.value = '';
  loading.value = false;
  emit('close');
}

function onEscClose(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close();
  }
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatArtistNames(artists: any[] | null | undefined): string {
  if (!artists || !artists.length) return '';
  return artists
    .map((a: any) => a.artistName)
    .filter(Boolean)
    .join(' / ');
}

let fetchToken = 0;

function extractEncyclopediaItems(data: any): WikiItem[] {
  if (!data) return [];
  const items: WikiItem[] = [];

  function pickArtistIds(arr: any[] | null | undefined): number[] {
    return (arr || []).map((a: any) => a?.artistId).filter(Boolean);
  }
  function pickArtistNames(arr: any[] | null | undefined): string[] {
    return (arr || []).map((a: any) => a?.artistName).filter(Boolean);
  }

  // 语种
  if (data.language) {
    items.push({ label: '语种', value: data.language, linkType: 'language' });
  }

  // 译名
  if (data.transName) {
    items.push({ label: '译名', value: data.transName });
  }

  // 发布时间
  if (data.publishTime) {
    items.push({ label: '发布时间', value: formatTime(data.publishTime) });
  }

  // 唱片公司
  if (data.company) {
    items.push({ label: '唱片公司', value: data.company });
  }

  // 碟号
  if (data.disc) {
    items.push({ label: '碟号', value: data.disc });
  }

  // 是否原唱
  if (data.originalCover !== null && data.originalCover !== undefined) {
    items.push({
      label: '是否原唱',
      value: data.originalCover === 1 ? '是' : '翻唱',
    });
  }

  // 歌手列表
  const artists = formatArtistNames(data.artistRepVos);
  if (artists) {
    items.push({
      label: '歌手列表',
      value: artists,
      linkType: 'artist',
      linkIds: pickArtistIds(data.artistRepVos),
      linkNames: pickArtistNames(data.artistRepVos),
    });
  }

  // 作词人
  const lyricists = formatArtistNames(data.lyricArtists);
  if (lyricists) {
    items.push({
      label: '作词人',
      value: lyricists,
      linkType: 'artist',
      linkIds: pickArtistIds(data.lyricArtists),
      linkNames: pickArtistNames(data.lyricArtists),
    });
  }

  // 作曲人
  const composers = formatArtistNames(data.composeArtists);
  if (composers) {
    items.push({
      label: '作曲人',
      value: composers,
      linkType: 'artist',
      linkIds: pickArtistIds(data.composeArtists),
      linkNames: pickArtistNames(data.composeArtists),
    });
  }

  // 编曲人
  const arrangers = formatArtistNames(data.arrangeArtists);
  if (arrangers) {
    items.push({
      label: '编曲人',
      value: arrangers,
      linkType: 'artist',
      linkIds: pickArtistIds(data.arrangeArtists),
      linkNames: pickArtistNames(data.arrangeArtists),
    });
  }

  // 角色演唱
  if (data.roleArtists && Array.isArray(data.roleArtists) && data.roleArtists.length) {
    const roles = data.roleArtists
      .map((a: any) => a.artistName)
      .filter(Boolean)
      .join(' / ');
    if (roles) {
      items.push({
        label: '角色演唱',
        value: roles,
        linkType: 'artist',
        linkIds: pickArtistIds(data.roleArtists),
        linkNames: pickArtistNames(data.roleArtists),
      });
    }
  }

  // 歌曲标签
  if (data.songTags) {
    const tags = Array.isArray(data.songTags)
      ? data.songTags.join(' / ')
      : String(data.songTags);
    if (tags) {
      items.push({ label: '歌曲标签', value: tags });
    }
  }

  // 所属专辑
  if (data.albumRepVo?.albumName) {
    items.push({
      label: '所属专辑',
      value: data.albumRepVo.albumName,
      linkType: 'album',
      linkIds: [data.albumRepVo.albumId].filter(Boolean),
      linkNames: [data.albumRepVo.albumName],
    });
  }

  return items;
}

function openArtist(artistId: number) {
  if (artistId > 0) {
    emit('open-artist', { id: artistId, artistId });
    close();
  }
}

function openAlbum(albumId: number) {
  if (albumId > 0) {
    emit('open-album', albumId);
    close();
  }
}

function openLanguage(language: string) {
  if (language) {
    emit('open-language', language);
    close();
  }
}

async function fetchEncyclopedia(id: number) {
  const token = ++fetchToken;
  loading.value = true;
  error.value = '';
  wikiItems.value = [];

  try {
    const cookie = userStore.loginCookie || undefined;
    const res = await getSongEncyclopedia(id, cookie);
    if (token !== fetchToken) return;

    const body = res?.data || {};
    if (body.code !== 200 && body.code !== undefined) {
      error.value = `请求失败 (${body.code || '未知错误'})`;
      return;
    }

    const encyclopediaData = body.data || body;
    wikiItems.value = extractEncyclopediaItems(encyclopediaData);
  } catch (e: any) {
    if (token !== fetchToken) return;
    error.value = e?.message || '百科信息加载失败';
  } finally {
    if (token === fetchToken) {
      loading.value = false;
    }
  }
}

watch(
  () => props.songId,
  (id) => {
    if (id && id > 0) {
      open.value = true;
      window.addEventListener('keydown', onEscClose);
      void fetchEncyclopedia(id);
    } else {
      open.value = false;
      window.removeEventListener('keydown', onEscClose);
    }
  },
  { immediate: false },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscClose);
});
</script>

<style scoped>
.enc-fade-enter-active,
.enc-fade-leave-active {
  transition: opacity 0.2s ease;
}
.enc-fade-enter-from,
.enc-fade-leave-to {
  opacity: 0;
}

.enc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: color-mix(in srgb, var(--bg-solid) 32%, transparent);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 16px;
}

.enc-shell {
  width: min(520px, 92vw);
  max-height: 70vh;
  overflow: hidden;
  border-radius: 20px;
  background: var(--bg-solid);
  border: 1px solid var(--border);
  box-shadow: 0 24px 48px color-mix(in srgb, var(--text-main) 18%, transparent);
  display: flex;
  flex-direction: column;
}

.enc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

.enc-title {
  margin: 0;
  font-size: var(--text-body-md);
  font-weight: 700;
  color: var(--text-main);
}

.enc-close {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-main);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.12s ease;
}
.enc-close:hover {
  background: var(--bg-muted);
}

.enc-body {
  padding: 16px 18px 20px;
  overflow-y: auto;
  flex: 1;
}

.enc-loading,
.enc-error,
.enc-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-sub);
  font-size: var(--text-label-md);
}

.enc-error {
  color: #fca5a5;
}

.enc-wiki-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.enc-wiki-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.enc-wiki-label {
  flex-shrink: 0;
  min-width: 80px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.03em;
}

.enc-wiki-value {
  font-size: var(--text-label-md);
  line-height: 1.5;
  color: var(--text-main);
  word-break: break-word;
}

.enc-link {
  display: inline;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--text-label-md);
  line-height: 1.5;
  color: var(--accent);
  cursor: pointer;
  transition: opacity 0.12s ease;
  text-align: left;
}
.enc-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
.enc-link:active {
  opacity: 0.6;
}

.enc-link-sep {
  display: inline;
  padding: 0 2px;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--text-label-md);
  line-height: 1.5;
  color: var(--text-sub);
  cursor: default;
}
</style>