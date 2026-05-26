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
            <div class="match-layout">
              <aside class="cover-panel">
                <div class="cover-card">
                  <img v-if="previewCoverUrl" :src="previewCoverUrl" class="cover-image" alt="匹配封面预览" />
                  <div v-else class="cover-empty">
                    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor" /></svg>
                  </div>
                  <div class="cover-meta">
                    <strong>{{ previewSongName }}</strong>
                    <span>{{ previewArtists }}</span>
                    <span>{{ previewAlbum }}</span>
                  </div>
                </div>
              </aside>

              <div class="match-main">
                <div v-if="existingMatch" class="current-match">
                  <span class="match-label">当前匹配</span>
                  <strong>{{ existingMatch.cloudSongName }}</strong>
                  <span>{{ existingMatch.cloudArtists || '未知歌手' }} · {{ existingMatch.cloudAlbum || '未知专辑' }}</span>
                  <div class="current-match-status">
                    <span class="status-line">云端匹配状态：{{ existingMatch ? '已匹配云端信息' : '未匹配' }}</span>
                    <span class="status-line">文件标签状态：{{ metadataStatusText }}</span>
                  </div>
                  <div class="current-match-actions">
                    <button type="button" class="ghost" :disabled="busy" @click="openMetadataDialog">补全缺失标签</button>
                    <button type="button" class="ghost danger" :disabled="busy" @click="removeMatch">取消匹配</button>
                  </div>
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
                    <span class="result-cover">
                      <img v-if="albumCover(song)" :src="albumCover(song)" alt="" loading="lazy" />
                      <span v-else class="result-cover-placeholder">
                        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor" /></svg>
                      </span>
                    </span>
                    <span class="result-text">
                      <span class="song-main">
                        {{ song.name }}
                      </span>
                      <span class="song-meta">
                        {{ artistNames(song) || '未知歌手' }} · {{ albumName(song) || '未知专辑' }}
                      </span>
                    </span>
                    <span class="song-duration">{{ songDurationText(song) }}</span>
                  </button>
                </div>
              </div>
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
    <LocalMetadataWriteDialog
      :visible="showMetadataDialog"
      :track="track"
      @close="showMetadataDialog = false"
      @written="handleMetadataWritten"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { getSongDetail, getSongLyric, getSongLyricNew, searchMusic } from '../api/music';
import { useLocalMusicStore } from '../stores/localMusic';
import { useLoginModalStore } from '../stores/loginModal';
import { notifyLocalLyricMatchUpdated, parseLyrics, parseLyricsNew } from '../composables/useLyrics';
import { formatTime } from '../utils/formatTime';
import { usePlayerStore } from '../stores/player';
import LocalMetadataWriteDialog from './LocalMetadataWriteDialog.vue';

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
const showMetadataDialog = ref(false);
const metadataStatus = ref<any | null>(null);

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
const previewTarget = computed(() => selectedSong.value || existingMatch.value || null);
const previewCoverUrl = computed(() => previewTarget.value ? albumCover(previewTarget.value) || String(previewTarget.value?.cloudAlbumPicUrl || '').trim() : '');
const previewSongName = computed(() => String(previewTarget.value?.name || previewTarget.value?.cloudSongName || trackTitle.value));
const previewArtists = computed(() => {
  if (!previewTarget.value) return trackArtist.value;
  return artistNames(previewTarget.value) || String(previewTarget.value?.cloudArtists || trackArtist.value || '未知歌手');
});
const previewAlbum = computed(() => {
  if (!previewTarget.value) return '未选择匹配结果';
  return albumName(previewTarget.value) || String(previewTarget.value?.cloudAlbum || '未知专辑');
});
const metadataStatusText = computed(() => metadataStatus.value?.message || '当前未写入文件标签');

function artistNames(song: any): string {
  const artists = Array.isArray(song?.ar) ? song.ar : Array.isArray(song?.artists) ? song.artists : [];
  return artists.map((a: any) => a?.name).filter(Boolean).join('/');
}

function albumName(song: any): string {
  return song?.al?.name || song?.album?.name || '';
}

function albumCover(song: any): string {
  return song?.al?.picUrl || song?.album?.picUrl || song?.picUrl || '';
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
  metadataStatus.value = await localMusicStore.getMetadataStatus(props.track);
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
    statusText.value = '正在整理云端元信息...';
    const detailRes = await getSongDetail(songId);
    const detailSong = detailRes?.data?.songs?.[0] || selectedSong.value;
    const lyricRes = await getSongLyric(songId);
    let lyricNewData: any = null;
    try {
      lyricNewData = (await getSongLyricNew(songId)).data;
    } catch {
      lyricNewData = null;
    }
    const payload = {
      localTrackId: String(props.track.id),
      localPath: String(props.track.path),
      cloudSongId: songId,
      cloudSongName: detailSong?.name || selectedSong.value.name || '',
      cloudArtists: artistNames(detailSong || selectedSong.value),
      cloudAlbum: albumName(detailSong || selectedSong.value),
      cloudAlbumId: Number(detailSong?.al?.id || detailSong?.album?.id || 0),
      cloudAlbumPicUrl: albumCover(detailSong) || albumCover(selectedSong.value) || '',
      cloudDuration: (detailSong?.dt || detailSong?.duration || selectedSong.value.dt || selectedSong.value.duration || 0) / 1000,
      cloudTrackNo: Number(detailSong?.no || detailSong?.trackNo || 0),
      cloudDiscNo: Number(detailSong?.cd || detailSong?.disc || 0),
      cloudYear: Number(detailSong?.publishTime ? new Date(detailSong.publishTime).getFullYear() : 0),
      cloudGenre: Array.isArray(detailSong?.al?.tns) ? String(detailSong.al.tns[0] || '') : '',
      cloudLyrics: lyricRes?.data?.lrc?.lyric || '',
      cloudSyncedLyrics: lyricNewData?.yrc?.lyric || '',
      cloudTranslationLyrics: lyricRes?.data?.tlyric?.lyric || lyricNewData?.tlyric?.lyric || '',
      cloudRomanizedLyrics: lyricRes?.data?.romalrc?.lyric || lyricNewData?.romalrc?.lyric || '',
      sourceVersion: String(detailSong?.version || detailSong?.mv || songId),
      confidence: hasSameDisplayDuration(selectedSong.value) ? 1 : 0.85,
      matchMode: 'manual',
    };
    const result = await localMusicStore.saveLyricMatch(payload);
    if (!result.success) throw new Error(result.error || '保存失败');
    existingMatch.value = { ...payload };
    localMusicStore.applyLyricMatchCover(props.track, payload);
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

function openMetadataDialog() {
  showMetadataDialog.value = true;
}

function handleMetadataWritten() {
  localMusicStore.refreshMetadataStatus(props.track).then((status) => { metadataStatus.value = status })
  emit('matched');
}

async function removeMatch() {
  busy.value = true;
  statusText.value = '';
  try {
    const revertResult = await localMusicStore.revertMetadata(props.track);
    const result = await localMusicStore.removeLyricMatch(props.track);
    if (!result.success) throw new Error(result.error || '取消失败');
    existingMatch.value = null;
    selectedSong.value = null;
    if (revertResult?.partial) {
      loginModalStore.showGlobalToast('已取消匹配，部分标签因文件已变更未回滚', 'info', 2600);
    } else if (revertResult?.skipped) {
      loginModalStore.showGlobalToast('已取消匹配，当前未检测到写入过文件标签；现在移除的是云端匹配与封面来源', 'info', 3200);
    } else {
      loginModalStore.showGlobalToast('已取消匹配，并回滚本次补全标签', 'success', 2400);
    }
    metadataStatus.value = await localMusicStore.getMetadataStatus(props.track);
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
  width: min(860px, calc(100vw - 36px));
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
.match-layout { display: grid; grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); gap: 18px; align-items: start; }
.cover-panel { position: sticky; top: 0; align-self: start; }
.cover-card { display: grid; gap: 12px; padding: 12px; border-radius: 18px; border: 1px solid var(--border-soft, rgba(255,255,255,0.12)); background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.05)) 84%, transparent); }
.cover-image, .cover-empty { width: 100%; aspect-ratio: 1 / 1; border-radius: 16px; object-fit: cover; background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.08)) 72%, var(--border)); }
.cover-empty { display: flex; align-items: center; justify-content: center; color: var(--text-soft); }
.cover-empty svg { width: 64px; height: 64px; display: block; }
.cover-meta { display: grid; gap: 5px; min-width: 0; }
.cover-meta strong { color: var(--text-main); font-size: 15px; line-height: 1.35; }
.cover-meta span { color: var(--text-soft); font-size: 12px; line-height: 1.4; }
.match-main { min-width: 0; display: grid; gap: 14px; }
.current-match { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 12px 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--accent, #c39c76) 28%, var(--border)); background: color-mix(in srgb, var(--accent, #c39c76) 10%, var(--bg-surface, transparent)); }
.current-match strong { color: var(--text-main); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.current-match span:not(.match-label) { color: var(--text-soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-label { grid-column: 1 / -1; color: var(--accent, #c39c76); font-size: 12px; font-weight: 700; }
.current-match-status { grid-column: 1; display: grid; gap: 2px; }
.status-line { color: var(--text-soft); font-size: 12px; }
.current-match-actions { grid-row: 2 / 4; grid-column: 2; display: grid; gap: 8px; }
.ghost { grid-row: 2 / 4; grid-column: 2; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-soft, rgba(255,255,255,0.14)); background: transparent; color: var(--text-sub, var(--text-soft)); cursor: pointer; }
.current-match-actions .ghost { grid-row: auto; grid-column: auto; }
.ghost.danger:hover { color: #ffb4b4; border-color: rgba(255,120,120,0.42); background: rgba(255,80,80,0.1); }
.search-line { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.search-line input { min-width: 0; height: 38px; border-radius: 999px; border: 1px solid var(--border-soft, rgba(255,255,255,0.14)); background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 86%, transparent); color: var(--text-main); padding: 0 15px; outline: none; }
.search-line input::placeholder { color: var(--text-soft); opacity: 0.72; }
.search-line input:focus { border-color: color-mix(in srgb, var(--accent, #c39c76) 68%, var(--border) 32%); }
.search-line button, .primary { height: 38px; padding: 0 18px; border: none; border-radius: 999px; background: var(--accent, #c39c76); color: #fff; font-weight: 700; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.status { margin: 0; color: var(--text-soft); font-size: 13px; text-align: center; }
.result-list { display: grid; gap: 6px; }
.result-row { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px 12px; align-items: center; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; position: relative; overflow: hidden; }
.result-row:hover, .result-row.selected { background: color-mix(in srgb, var(--accent, #c39c76) 9%, var(--bg-muted, transparent)); border-color: var(--border-soft, rgba(255,255,255,0.12)); }
.result-row.selected { border-color: color-mix(in srgb, var(--accent, #c39c76) 70%, transparent); }
.result-cover, .result-cover-placeholder { width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0; overflow: hidden; }
.result-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.result-cover-placeholder { display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 76%, var(--border)); color: var(--text-soft); }
.result-cover-placeholder svg { width: 18px; height: 18px; display: block; }
.result-text { min-width: 0; display: grid; gap: 3px; }
.song-main { color: var(--text-main); font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 8px; min-width: 0; }
.song-meta { color: var(--text-soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-duration { color: var(--text-soft); font-size: 12px; font-variant-numeric: tabular-nums; }
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
@media (max-width: 860px) {
  .match-modal { width: min(620px, calc(100vw - 24px)); }
  .match-layout { grid-template-columns: 1fr; }
  .cover-panel { position: static; }
}
@media (max-width: 560px) {
  .match-foot { align-items: stretch; flex-direction: column; }
  .primary { width: 100%; }
}
</style>
