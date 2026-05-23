<template>
  <section class="local-page">
    <VirtualSongList
      v-if="tracks.length"
      :tracks="tracks"
      :now-playing-id="nowPlayingId"
      :highlighted-id="localMusicStore.state.locatedTrackId"
      @play="playTrack"
    />
    <div v-if="!tracks.length" class="local-empty">暂无专辑数据</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore()
import VirtualSongList from '../components/VirtualSongList.vue'

const nowPlayingId = computed(() => playerStore.state.currentTrack?.id ?? null)
const tracks = computed(() => localMusicStore.selectedAlbumTracks)

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
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-empty { text-align: center; padding: var(--space-6); color: var(--text-soft); font-size: var(--text-body-sm); }
</style>