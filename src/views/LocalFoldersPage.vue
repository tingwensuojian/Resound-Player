<template>
  <section class="local-page">
    <VirtualSongList
      v-if="tracks.length"
      :tracks="tracks"
      :now-playing-id="nowPlayingId"
      :highlighted-id="localMusicStore.state.locatedTrackId"
      @play="playTrack"
      @play-next="playNext"
      @add-to-playlist="addToPlaylist"
      @show-local-album="showLocalAlbum"
      @show-online-album="showOnlineAlbum"
      @upload-to-cloud="uploadToCloud"
    />
    <div v-if="!tracks.length" class="local-empty">暂无目录数据</div>

    <!-- 选择歌单对话框 -->
    <Teleport to="body">
      <div v-if="showPlaylistPicker" class="dialog-overlay" @click.self="cancelPlaylistPicker">
        <div class="dialog-panel">
          <h3 class="dialog-title">选择歌单</h3>
          <div class="playlist-picker-list">
            <button
              v-for="pl in localMusicStore.state.playlists"
              :key="pl.id"
              class="playlist-picker-item"
              @click="confirmPlaylistPicker(pl.id)"
            >
              {{ pl.name }}
              <span class="playlist-picker-count">{{ pl.trackCount || 0 }} 首</span>
            </button>
          </div>
          <div class="dialog-actions">
            <button class="button-surface" @click="cancelPlaylistPicker">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore()
import { useLoginModalStore } from '../stores/loginModal'
const loginModalStore = useLoginModalStore()
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { platform } from '../utils/platform'
import { searchMusic, importToCloud } from '../api/music'
import VirtualSongList from '../components/VirtualSongList.vue'

const nowPlayingId = computed(() => playerStore.state.currentTrack?.id ?? null)
const tracks = computed(() => localMusicStore.selectedFolderTracks)

function playTrack(track: any, index: number) {
  // 清除定位高亮
  localMusicStore.state.locatedTrackId = ''
  const playlist = tracks.value.map((t: any) => ({
    id: t.id, name: t.title,
    ar: [{ name: t.artist }],
    al: { name: t.album, picUrl: t.coverUrl },
    source: 'local' as const, path: t.path,
  }))
  playerStore.setPlaylist(playlist as any, index)
  playerStore.playByIndex(index)
}

/** 下一首播放：插入到当前播放之后 */
function playNext(track: any) {
  const song = {
    id: track.id, name: track.title,
    ar: [{ name: track.artist }],
    al: { name: track.album, picUrl: track.coverUrl },
    source: 'local' as const, path: track.path,
  }
  const idx = playerStore.state.currentIndex + 1
  playerStore.state.playlist.splice(idx, 0, song)
  loginModalStore.showGlobalToast('已加入播放队列', 'success', 3000)
}

/** 添加到歌单 */
const showPlaylistPicker = ref(false)
const pendingTrackForPlaylist = ref<any>(null)

async function addToPlaylist(track: any) {
  if (!localMusicStore.state.playlists.length) {
    await localMusicStore.loadPlaylists()
  }
  if (!localMusicStore.state.playlists.length) {
    const create = confirm('还没有本地歌单，是否创建一个？')
    if (!create) return
    const pl = await localMusicStore.createPlaylist('新歌单')
    if (pl) {
      await localMusicStore.addTrackToPlaylist(pl.id, track.id)
      loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
    }
    return
  }
  pendingTrackForPlaylist.value = track
  showPlaylistPicker.value = true
}

async function confirmPlaylistPicker(playlistId: string) {
  const track = pendingTrackForPlaylist.value
  if (!track) return
  showPlaylistPicker.value = false
  pendingTrackForPlaylist.value = null
  await localMusicStore.addTrackToPlaylist(playlistId, track.id)
  loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
}

function cancelPlaylistPicker() {
  showPlaylistPicker.value = false
  pendingTrackForPlaylist.value = null
}

/** 查看本地专辑：切换到专辑标签页，选中该专辑并高亮当前歌曲 */
function showLocalAlbum(track: any) {
  localMusicStore.state.selectedAlbum = track.album
  localMusicStore.state.locatedTrackId = track.id
  localMusicStore.state.activeView = 'albums'
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

/** 查看在线专辑：先搜歌曲名+歌手找匹配歌曲，取其专辑 ID；失败则回退搜专辑名 */
async function showOnlineAlbum(track: any) {
  try {
    // 阶段 1：按歌曲名+歌手搜，匹配到的歌曲自带 album.id
    const songKw = [track.title, track.artist].filter(Boolean).join(' ')
    const songRes = await searchMusic(songKw, { type: 1, limit: 3 })
    const song = songRes?.result?.songs?.[0]
    let albumId = song?.al?.id || song?.album?.id

    // 阶段 2：歌曲匹配失败，回退按专辑名+歌手搜
    if (!albumId) {
      const albumKw = [track.artist, track.album].filter(Boolean).join(' ')
      const albumRes = await searchMusic(albumKw, { type: 10, limit: 1 })
      albumId = albumRes?.result?.albums?.[0]?.id
    }

    if (albumId) {
      window.dispatchEvent(new CustomEvent('open-album-detail', { detail: { albumId } }))
      loginModalStore.showGlobalToast('已跳转到在线专辑，若信息有误请使用搜索查找', 'warning', 4000)
    } else {
      loginModalStore.showGlobalToast('未找到在线专辑', 'warning', 3000)
    }
  } catch {
    loginModalStore.showGlobalToast('搜索专辑失败', 'error', 3000)
  }
}

/** 上传至云盘：读取本地文件信息，通过 API 导入云盘 */
async function uploadToCloud(track: any) {
  if (!platform.localApi) return
  if (!userStore.isLogin) { loginModalStore.showLoginModal('none'); return }
  if (userStore.loginMode !== 'cookie' && userStore.loginMode !== 'qr') {
    loginModalStore.showGlobalToast('搜索用户方式登录不支持上传云盘功能，请使用扫码或 Cookie 登录', 'warning', 5000)
    return
  }
  try {
    const info = await platform.localApi.computeFileMd5(track.path)
    if (!info) { loginModalStore.showGlobalToast('无法读取文件信息', 'error'); return }
    const ext = track.path.split('.').pop()?.toLowerCase() || 'mp3'
    const fileType = ext === 'flac' ? 'flac' : 'mp3'
    const bitrate = track.duration > 0 ? Math.round((info.size * 8) / track.duration / 1000) : 128
    const { data } = await importToCloud({
      song: track.title,
      fileType,
      fileSize: info.size,
      bitrate,
      md5: info.md5,
      artist: track.artist || '未知歌手',
      album: track.album || '未知专辑',
      cookie: userStore.loginCookie || undefined,
    })
    if ((data as any)?.body?.code === 200 || (data as any)?.code === 200) {
      loginModalStore.showGlobalToast('已上传至云盘', 'success', 3000)
    } else {
      loginModalStore.showGlobalToast('上传失败，请稍后重试', 'warning', 3000)
    }
  } catch {
    loginModalStore.showGlobalToast('上传至云盘失败', 'error', 3000)
  }
}
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-empty { text-align: center; padding: var(--space-6); color: var(--text-soft); font-size: var(--text-body-sm); }
</style>