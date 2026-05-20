<template>
  <section class="local-page" v-if="localMusicStore.activePlaylistDetail">
    <PromptModal
      :open="showRenameModal"
      title="重命名歌单"
      placeholder="请输入新名称"
      :default-value="localMusicStore.activePlaylistDetail?.name || ''"
      @confirm="onRenameConfirm"
      @cancel="showRenameModal = false"
      @update:open="showRenameModal = $event"
    />
    <PromptModal
      :open="showAddTrackModal"
      title="从曲库添加"
      placeholder="搜索歌名、歌手或专辑关键词"
      @confirm="onAddTrackConfirm"
      @cancel="showAddTrackModal = false"
      @update:open="showAddTrackModal = $event"
    />
    <div class="local-page-hero">
      <h2 class="local-page-title">{{ localMusicStore.activePlaylistDetail.name }}</h2>
      <p class="local-page-count">
        {{ localMusicStore.activePlaylistDetail.tracks?.length || 0 }} 首歌曲
      </p>
    </div>

    <div class="local-page-actions">
      <button class="button-surface" @click="goBack">← 返回歌单</button>
      <button class="button-surface" @click="handlePlayAll" :disabled="!tracks.length">
        播放全部
      </button>
      <button class="button-surface" @click="handleRename">重命名</button>
      <button class="button-surface" @click="handleAddTrack">从曲库添加</button>
    </div>

    <div v-if="!tracks.length" class="local-empty">
      <p>歌单为空，点击"从曲库添加"添加歌曲</p>
    </div>

    <div v-if="tracks.length" class="local-song-list">
      <div class="local-song-header">
        <span class="local-song-idx">#</span>
        <span class="local-song-cover"></span>
        <span class="local-song-title">标题</span>
        <span class="local-song-artist">歌手</span>
        <span class="local-song-album">专辑</span>
        <span class="local-song-action"></span>
        <span class="local-song-duration">时长</span>
      </div>
      <div
        v-for="(track, idx) in tracks"
        :key="track.id"
        class="local-song-row"
        :class="{ playing: nowPlayingId === track.id }"
        @dblclick="playTrack(track, idx)"
      >
        <span class="local-song-idx">{{ idx + 1 }}</span>
        <span class="local-song-cover">
          <img v-if="track.coverUrl" :src="track.coverUrl" class="local-cover-img" alt="" />
          <span v-else class="local-cover-placeholder"></span>
        </span>
        <span class="local-song-title" :title="track.title">
          <span v-if="track.hasLyrics" class="local-lyric-icon" title="有歌词">♪</span>
          {{ track.title }}
        </span>
        <span class="local-song-artist" :title="track.artist">{{ track.artist }}</span>
        <span class="local-song-album" :title="track.album">{{ track.album }}</span>
        <button class="local-song-remove" @click.stop="handleRemoveTrack(idx)" title="从歌单移除">✕</button>
        <span class="local-song-duration">{{ localMusicStore.formatDuration(track.duration) }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { localMusicStore, type LocalTrack } from '../stores/localMusic'
import { playerStore } from '../stores/player'
import { platform } from '../utils/platform'
import PromptModal from '../components/ui/PromptModal.vue'

const nowPlayingId = computed(() => playerStore.currentTrack?.id ?? null)
const tracks = computed(() => localMusicStore.activePlaylistDetail?.tracks || [])

const showRenameModal = ref(false)
const showAddTrackModal = ref(false)

function goBack() {
  localMusicStore.activeView = 'playlists'
  localMusicStore.activePlaylistDetail = null
  localMusicStore.activePlaylistId = ''
}

function handleRename() {
  showRenameModal.value = true
}

async function onRenameConfirm(name: string) {
  const pl = localMusicStore.activePlaylistDetail
  if (!pl) return
  await localMusicStore.renamePlaylist(pl.id, name.trim())
}

function handleAddTrack() {
  showAddTrackModal.value = true
}

async function onAddTrackConfirm(kw: string) {
  const pl = localMusicStore.activePlaylistDetail
  if (!pl) return

  if (!platform.localApi) return

  try {
    const results = await platform.localApi.search(kw.trim())
    if (!results?.length) {
      alert('未找到匹配的歌曲')
      return
    }
    // 去重并让用户确认
    const newTracks = results.filter((t: any) =>
      !tracks.value.some((pt: any) => pt.id === t.id)
    )
    if (!newTracks.length) {
      alert('搜索结果已全部在歌单中')
      return
    }
    if (!confirm(`找到 ${newTracks.length} 首未添加的歌曲，确定全部加入歌单？`)) return

    for (const t of newTracks) {
      await localMusicStore.addTrackToPlaylist(pl.id, t.id)
    }
    alert(`已添加 ${newTracks.length} 首歌曲到歌单`)
  } catch (e) {
    console.error('[localPlaylist] add track error:', e)
  }
}

async function handleRemoveTrack(index: number) {
  const pl = localMusicStore.activePlaylistDetail
  const track = tracks.value[index]
  if (!pl || !track) return
  if (!confirm(`确定从歌单移除「${track.title}」？`)) return
  await localMusicStore.removeTrackFromPlaylist(pl.id, track.id)
}

function playTrack(track: any, index: number) {
  const playlist = tracks.value.map((t: any) => ({
    id: t.id, name: t.title,
    ar: [{ name: t.artist }],
    al: { name: t.album, picUrl: t.coverUrl },
    source: 'local' as const, path: t.path,
  }))
  playerStore.setPlaylist(playlist as any, index)
  playerStore.playByIndex(index)
}

function handlePlayAll() {
  if (!tracks.value.length) return
  playTrack(tracks.value[0], 0)
}
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-page-hero { display: flex; flex-direction: column; gap: var(--space-1); }
.local-page-title { margin: 0; font-size: var(--text-headline-lg); font-weight: 700; color: var(--text-main); }
.local-page-count { margin: 0; font-size: var(--text-body-sm); color: var(--text-soft); }
.local-page-actions { display: flex; gap: var(--space-2); align-items: center; }
.local-empty { text-align: center; padding: var(--space-8); color: var(--text-soft); }
.local-song-list { display: grid; gap: 2px; }
.local-song-header,
.local-song-row {
  display: grid;
  grid-template-columns: 32px 36px minmax(160px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 32px 60px;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  font-size: var(--text-body-sm);
}
.local-song-header {
  color: var(--text-soft); font-size: var(--text-label-xs); text-transform: uppercase;
  border-bottom: 1px solid var(--border); padding-bottom: var(--space-1);
}
.local-song-row {
  border-radius: var(--radius-sm); cursor: default; transition: background 0.15s;
}
.local-song-row:hover { background: var(--bg-muted); }
.local-song-row.playing { background: var(--accent-soft); }
.local-song-row.playing .local-song-title { color: var(--accent); }
.local-song-idx { color: var(--text-soft); text-align: right; font-size: var(--text-label-sm); }
.local-song-cover { display: flex; align-items: center; justify-content: center; }
.local-cover-img { width: 30px; height: 30px; border-radius: 4px; object-fit: cover; }
.local-cover-placeholder { display: block; width: 30px; height: 30px; border-radius: 4px; background: var(--bg-muted); }
.local-song-title { color: var(--text-main); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
.local-lyric-icon { font-size: 13px; color: var(--accent); flex-shrink: 0; }
.local-song-artist { color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-song-album { color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-song-remove { background: none; border: none; cursor: pointer; color: var(--text-soft); padding: 0; font-size: 12px; }
.local-song-row:hover .local-song-remove { color: var(--danger); }
.local-song-duration { color: var(--text-soft); text-align: right; font-size: var(--text-label-sm); }
</style>