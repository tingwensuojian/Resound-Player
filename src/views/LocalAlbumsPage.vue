<template>
  <section class="local-page">
    <VirtualSongList
      v-if="tracks.length"
      :tracks="tracks"
      :metadata-status-map="localMusicStore.state.metadataStatusMap"
      :now-playing-id="nowPlayingId"
      :highlighted-id="localMusicStore.state.locatedTrackId"
      @play="playTrack"
      @play-next="playNext"
      @add-to-playlist="addToPlaylist"
      @show-in-folder="showInFolder"
      @match-metadata="openLyricMatch"
      @show-local-album="showLocalAlbum"
      @show-online-album="showOnlineAlbum"
      @upload-to-cloud="uploadToCloud"
    />
    <div v-if="!tracks.length" class="local-empty">暂无专辑数据</div>

    <PlaylistPickerDialog
      :visible="showPlaylistPicker"
      :playlists="localMusicStore.state.playlists"
      @confirm="confirmPlaylistPicker"
      @cancel="cancelPlaylistPicker"
    />
    <LocalLyricMatchDialog
      :visible="showLyricMatchDialog"
      :track="pendingMetadataTrack"
      @close="closeMetadataDialogs"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import VirtualSongList from '../components/VirtualSongList.vue'
import PlaylistPickerDialog from '../components/PlaylistPickerDialog.vue'
import LocalLyricMatchDialog from '../components/LocalLyricMatchDialog.vue'
import { useLocalTrackActions } from '../composables/useLocalTrackActions'

const tracks = computed(() => localMusicStore.selectedAlbumTracks)

const {
  nowPlayingId,
  playTrack,
  playNext,
  addToPlaylist,
  showPlaylistPicker,
  confirmPlaylistPicker,
  cancelPlaylistPicker,
  showInFolder,
  openLyricMatch,
  closeMetadataDialogs,
  showLyricMatchDialog,
  pendingMetadataTrack,
  showLocalAlbum,
  showOnlineAlbum,
  uploadToCloud,
} = useLocalTrackActions(tracks)
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-empty { text-align: center; padding: var(--space-6); color: var(--text-soft); font-size: var(--text-body-sm); }
</style>
