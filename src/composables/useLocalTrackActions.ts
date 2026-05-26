import { computed, ref, type ComputedRef } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useLocalMusicStore } from '../stores/localMusic'
import { useLoginModalStore } from '../stores/loginModal'
import { useUserStore } from '../stores/user'
import { platform } from '../utils/platform'
import { searchMusic, importToCloud } from '../api/music'

/**
 * 共享的 VirtualSongList 事件处理逻辑。
 * 适用于 Artists / Albums / Folders 三个子视图页面。
 *
 * @param tracks - 当前视图的曲目列表（响应式 computed）
 */
export function useLocalTrackActions(tracks: ComputedRef<any[]>) {
  const playerStore = usePlayerStore()
  const localMusicStore = useLocalMusicStore()
  const loginModalStore = useLoginModalStore()
  const userStore = useUserStore()

  const nowPlayingId = computed(() => playerStore.state.currentTrack?.id ?? null)

  // ── play ──
  function playTrack(_track: any, index: number) {
    const playlist = tracks.value.map((t: any) => ({
      id: t.id,
      name: t.title,
      ar: [{ name: t.artist }],
      al: { name: t.album, picUrl: t.coverUrl },
      source: 'local' as const,
      path: t.path,
      duration: t.duration,
    }))
    playerStore.setPlaylist(playlist as any, index)
    playerStore.playByIndex(index)
  }

  // ── play-next ──
  function playNext(track: any) {
    const song = {
      id: track.id,
      name: track.title,
      ar: [{ name: track.artist }],
      al: { name: track.album, picUrl: track.coverUrl },
      source: 'local' as const,
      path: track.path,
      duration: track.duration,
    }
    playerStore.insertNext(song)
    loginModalStore.showGlobalToast('已加入播放队列', 'success', 3000)
  }

  // ── add-to-playlist ──
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
        await localMusicStore.addTrackToPlaylist(pl.id, track)
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
    try {
      await localMusicStore.addTrackToPlaylist(playlistId, track)
      loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
    } catch {
      loginModalStore.showGlobalToast('添加失败，请重试', 'error', 3000)
    }
  }

  function cancelPlaylistPicker() {
    showPlaylistPicker.value = false
    pendingTrackForPlaylist.value = null
  }

  // ── show-local-album ──
  function showLocalAlbum(track: any) {
    localMusicStore.state.selectedAlbum = track.album
    localMusicStore.state.locatedTrackId = track.id
    localMusicStore.state.activeView = 'albums'
    window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
  }

  // ── show-online-album ──
  async function showOnlineAlbum(track: any) {
    try {
      const songKw = [track.title, track.artist].filter(Boolean).join(' ')
      const songRes = await searchMusic(songKw, { type: 1, limit: 3 })
      const song = songRes?.result?.songs?.[0]
      let albumId = song?.al?.id || song?.album?.id
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

  // ── show-in-folder ──
  function showInFolder(track: any) {
    if (!track.path) {
      loginModalStore.showGlobalToast('未找到对应目录，文件可能已被移动或删除', 'warning', 3000)
      return
    }
    const parentDir = track.path.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
    localMusicStore.expandFolderAncestors(parentDir)
    localMusicStore.state.selectedFolderPath = parentDir
    localMusicStore.state.locatedTrackId = track.id
    localMusicStore.state.activeView = 'folders'
    window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
  }

  // ── upload-to-cloud ──
  async function uploadToCloud(track: any) {
    if (!platform.localApi) return
    if (!userStore.state.isLogin) {
      loginModalStore.showLoginModal('none')
      return
    }
    if (userStore.state.loginMode !== 'cookie' && userStore.state.loginMode !== 'qr') {
      loginModalStore.showGlobalToast(
        '搜索用户方式登录不支持上传云盘功能，请使用扫码或 Cookie 登录',
        'warning',
        5000,
      )
      return
    }
    try {
      const info = await platform.localApi.computeFileMd5(track.path)
      if (!info) {
        loginModalStore.showGlobalToast('无法读取文件信息', 'error')
        return
      }
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
        cookie: userStore.state.loginCookie || undefined,
      })
      if ((data as any)?.duplicate === true) {
        loginModalStore.showGlobalToast('文件已在云盘', 'info', 3000)
      } else if ((data as any)?.body?.code === 200 || (data as any)?.code === 200) {
        loginModalStore.showGlobalToast('已上传至云盘', 'success', 3000)
      } else {
        loginModalStore.showGlobalToast('上传失败，请稍后重试', 'warning', 3000)
      }
    } catch {
      loginModalStore.showGlobalToast('上传至云盘失败', 'error', 3000)
    }
  }

  return {
    nowPlayingId,
    playTrack,
    playNext,
    addToPlaylist,
    showPlaylistPicker,
    pendingTrackForPlaylist,
    confirmPlaylistPicker,
    cancelPlaylistPicker,
    showInFolder,
    showLocalAlbum,
    showOnlineAlbum,
    uploadToCloud,
  }
}
