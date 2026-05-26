<template>
  <Teleport to="body">
    <transition name="match-fade">
      <div v-if="visible" class="match-backdrop" @click.self="close" @keydown.esc="close" tabindex="-1" ref="backdropRef">
        <section class="match-modal">
          <header class="match-head">
            <div class="match-title-block">
              <h3>歌词匹配</h3>
              <p>{{ trackTitle }} · {{ trackArtist }}</p>
            </div>
            <button class="match-close" type="button" aria-label="关闭" @click="close">×</button>
          </header>

          <div class="match-body">
            <div v-if="existingMatch" class="current-match">
              <span class="match-label">当前匹配</span>
              <strong>{{ existingMatch.cloudSongName }}</strong>
              <span>{{ existingMatch.cloudArtists || '未知歌手' }} · {{ existingMatch.cloudAlbum || '未知专辑' }}</span>
              <button type="button" class="ghost danger" :disabled="busy" @click="removeMatch">取消匹配</button>
            </div>

            <form class="search-line" @submit.prevent="search">
              <input v-model.trim="keyword" type="search" placeholder="搜索云端歌曲，例如：歌曲名 歌手" autocomplete="off" />
              <button type="submit" :disabled="busy || !keyword">搜索</button>
            </form>

            <p v-if="statusText" class="status">{{ statusText }}</p>

            <div v-if="results.length" class="result-list">
              <button
                v-for="song in results"
                :key="song.id"
                type="button"
                class="result-row"
                :class="{ selected: selectedSong?.id === song.id, 'duration-exact': hasSameDisplayDuration(song) }"
                @click="selectedSong = song"
              >
                <span class="song-main">
                  {{ song.name }}
                </span>
                <span class="song-meta">
                  {{ artistNames(song) || '未知歌手' }} · {{ albumName(song) || '未知专辑' }}
                </span>
                <span class="song-duration">{{ songDurationText(song) }}</span>
              </button>
            </div>
          </div>

          <footer class="match-foot">
            <span class="hint">本地外部歌词优先；没有本地歌词时使用这里保存的云端歌词。</span>
            <button type="button" class="primary" :disabled="busy || !selectedSong" @click="confirmMatch">
              {{ existingMatch ? '重新匹配' : '保存匹配' }}
            </button>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { getSongLyric, getSongLyricNew, searchMusic } from '../api/music';
import { useLocalMusicStore } from '../stores/localMusic';
import { useLoginModalStore } from '../stores/loginModal';
import { notifyLocalLyricMatchUpdated, parseLyrics, parseLyricsNew } from '../composables/useLyrics';
import { formatTime } from '../utils/formatTime';
import { usePlayerStore } from '../stores/player';

const props = defineProps<{
  visible: boolean
  track: any
}>();

const emit = defineEmits<{ close: []; matched: [] }>();

const localMusicStore = useLocalMusicStore();
const loginModalStore = useLoginModalStore();
const playerStore = usePlayerStore();
const backdropRef = ref<HTMLElement | null>(null);
const keyword = ref('');
const results = ref<any[]>([]);
const selectedSong = ref<any | null>(null);
const existingMatch = ref<any | null>(null);
const busy = ref(false);
const statusText = ref('');

const trackTitle = computed(() => props.track?.name || props.track?.title || '本地歌曲');
const localDuration = computed(() => {
  const trackDuration = Number(props.track?.duration || 0);
  if (trackDuration > 0) return trackDuration;
  return Number(playerStore.state.duration || 0);
});
const localDurationText = computed(() => localDuration.value ? formatTime(localDuration.value) : '');
const trackArtist = computed(() => {
  const ar = Array.isArray(props.track?.ar) ? props.track.ar.map((a: any) => a?.name).filter(Boolean).join(' ') : '';
  return ar || props.track?.artist || '未知歌手';
});

function artistNames(song: any): string {
  const artists = Array.isArray(song?.ar) ? song.ar : Array.isArray(song?.artists) ? song.artists : [];
  return artists.map((a: any) => a?.name).filter(Boolean).join('/');
}

function albumName(song: any): string {
  return song?.al?.name || song?.album?.name || '';
}

function songDuration(song: any): number {
  const raw = Number(song?.dt || song?.duration || 0);
  return raw > 10000 ? raw / 1000 : raw;
}

function songDurationText(song: any): string {
  return formatTime(songDuration(song));
}

function hasSameDisplayDuration(song: any): boolean {
  return Boolean(localDurationText.value && songDurationText(song) === localDurationText.value);
}

function buildDefaultKeyword() {
  return [trackTitle.value, trackArtist.value === '未知歌手' ? '' : trackArtist.value].filter(Boolean).join(' ');
}

function close() {
  emit('close');
}

async function loadExistingMatch() {
  existingMatch.value = await localMusicStore.getLyricMatch(props.track);
  if (!existingMatch.value?.cloudSongId) return;
  statusText.value = '正在校验当前匹配...';
  const valid = await hasCloudLyric(Number(existingMatch.value.cloudSongId));
  statusText.value = valid ? '' : '当前保存的云端匹配暂无可解析歌词，请重新选择一个结果';
}

async function search() {
  if (!keyword.value) return;
  busy.value = true;
  statusText.value = '搜索中...';
  selectedSong.value = null;
  try {
    const data = await searchMusic(keyword.value, { type: 1, limit: 12 });
    const songs = data?.result?.songs || data?.data?.songs || [];
    results.value = Array.isArray(songs) ? songs : [];
    statusText.value = results.value.length ? '' : '没有找到可匹配的歌曲';
  } catch {
    results.value = [];
    statusText.value = '搜索失败，请稍后再试';
  } finally {
    busy.value = false;
  }
}

async function hasCloudLyric(songId: number): Promise<boolean> {
  try {
    const res = await getSongLyricNew(songId);
    if (parseLyricsNew(res.data).length) return true;
  } catch { /* fallback */ }
  try {
    const res = await getSongLyric(songId);
    return parseLyrics(res.data).length > 0;
  } catch {
    return false;
  }
}

function dispatchUpdated() {
  notifyLocalLyricMatchUpdated({
    localTrackId: String(props.track?.id || ''),
    localPath: String(props.track?.path || ''),
  });
}

async function confirmMatch() {
  if (!selectedSong.value || !props.track?.id || !props.track?.path) return;
  busy.value = true;
  statusText.value = '检查歌词中...';
  try {
    const songId = Number(selectedSong.value.id);
    if (!await hasCloudLyric(songId)) {
      statusText.value = '该搜索结果暂无可用歌词，请选择其他结果';
      return;
    }
    const payload = {
      localTrackId: String(props.track.id),
      localPath: String(props.track.path),
      cloudSongId: songId,
      cloudSongName: selectedSong.value.name || '',
      cloudArtists: artistNames(selectedSong.value),
      cloudAlbum: albumName(selectedSong.value),
      cloudDuration: (selectedSong.value.dt || selectedSong.value.duration || 0) / 1000,
      matchMode: 'manual',
    };
    const result = await localMusicStore.saveLyricMatch(payload);
    if (!result.success) throw new Error(result.error || '保存失败');
    existingMatch.value = { ...payload };
    statusText.value = '匹配已保存';
    loginModalStore.showGlobalToast('歌词匹配已保存', 'success', 2200);
    dispatchUpdated();
    emit('matched');
  } catch (e: any) {
    statusText.value = e?.message || '保存匹配失败';
  } finally {
    busy.value = false;
  }
}

async function removeMatch() {
  busy.value = true;
  statusText.value = '';
  try {
    const result = await localMusicStore.removeLyricMatch(props.track);
    if (!result.success) throw new Error(result.error || '取消失败');
    existingMatch.value = null;
    selectedSong.value = null;
    loginModalStore.showGlobalToast('已取消歌词匹配', 'success', 2200);
    dispatchUpdated();
    emit('matched');
  } catch (e: any) {
    statusText.value = e?.message || '取消匹配失败';
  } finally {
    busy.value = false;
  }
}

watch(() => props.visible, async (open) => {
  if (!open) return;
  keyword.value = buildDefaultKeyword();
  results.value = [];
  selectedSong.value = null;
  statusText.value = '';
  await loadExistingMatch();
  await nextTick();
  backdropRef.value?.focus();
}, { immediate: true });
</script>

<style scoped>
.match-backdrop { position: fixed; inset: 0; z-index: 210; display: grid; place-items: center; background: transparent; }
.match-modal {
  width: min(560px, calc(100vw - 36px));
  max-height: min(74vh, 640px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border-radius: var(--radius-lg, 14px);
  border: 1px solid var(--expanded-line-muted, var(--border));
  background:
    radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 100%),
    radial-gradient(ellipse 60% 30% at 50% 100%, rgba(0,0,0,0.05) 0%, transparent 100%),
    color-mix(in srgb, var(--expanded-panel-bg, var(--bg-solid)) 80%, transparent);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
.match-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-soft); }
.match-title-block { min-width: 0; display: grid; gap: 4px; }
.match-title-block h3 { margin: 0; color: var(--text-main); font-size: 15px; font-weight: 700; }
.match-title-block p { margin: 0; color: var(--text-soft); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-close { width: 28px; height: 28px; border-radius: var(--radius-sm, 6px); border: none; background: transparent; color: var(--text-soft); font-size: 22px; line-height: 1; cursor: pointer; transition: color 120ms ease, background 120ms ease; }
.match-close:hover { color: var(--text-main,#fff); background: var(--control-hover, rgba(255,255,255,0.08)); }
.match-body { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 14px; padding: 16px 20px; }
.current-match { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 12px 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--accent, #c39c76) 28%, var(--border)); background: color-mix(in srgb, var(--accent, #c39c76) 10%, var(--bg-surface, transparent)); }
.current-match strong { color: var(--text-main); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.current-match span:not(.match-label) { color: var(--text-soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-label { grid-column: 1 / -1; color: var(--accent, #c39c76); font-size: 12px; font-weight: 700; }
.ghost { grid-row: 2 / 4; grid-column: 2; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-soft, rgba(255,255,255,0.14)); background: transparent; color: var(--text-sub, var(--text-soft)); cursor: pointer; }
.ghost.danger:hover { color: #ffb4b4; border-color: rgba(255,120,120,0.42); background: rgba(255,80,80,0.1); }
.search-line { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.search-line input { min-width: 0; height: 38px; border-radius: 999px; border: 1px solid var(--border-soft, rgba(255,255,255,0.14)); background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 86%, transparent); color: var(--text-main); padding: 0 15px; outline: none; }
.search-line input::placeholder { color: var(--text-soft); opacity: 0.72; }
.search-line input:focus { border-color: color-mix(in srgb, var(--accent, #c39c76) 68%, var(--border) 32%); }
.search-line button, .primary { height: 38px; padding: 0 18px; border: none; border-radius: 999px; background: var(--accent, #c39c76); color: #fff; font-weight: 700; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.status { margin: 0; color: var(--text-soft); font-size: 13px; text-align: center; }
.result-list { display: grid; gap: 6px; }
.result-row { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; align-items: center; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; position: relative; overflow: hidden; }
.result-row:hover, .result-row.selected { background: color-mix(in srgb, var(--accent, #c39c76) 9%, var(--bg-muted, transparent)); border-color: var(--border-soft, rgba(255,255,255,0.12)); }
.result-row.selected { border-color: color-mix(in srgb, var(--accent, #c39c76) 70%, transparent); }
.song-main { color: var(--text-main); font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 8px; min-width: 0; }
.song-meta { color: var(--text-soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-duration { grid-row: 1 / 3; grid-column: 2; color: var(--text-soft); font-size: 12px; font-variant-numeric: tabular-nums; }
.result-row.duration-exact .song-duration {
  justify-self: end;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent, #c39c76) 48%, var(--border));
  background: color-mix(in srgb, var(--accent, #c39c76) 10%, transparent);
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.match-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 20px 18px; border-top: 1px solid var(--border-soft); }
.hint { color: var(--text-soft); font-size: 12px; line-height: 1.45; }
.match-fade-enter-active, .match-fade-leave-active { transition: opacity 0.18s ease; }
.match-fade-enter-from, .match-fade-leave-to { opacity: 0; }
@media (max-width: 560px) {
  .match-foot { align-items: stretch; flex-direction: column; }
  .primary { width: 100%; }
}
</style>
