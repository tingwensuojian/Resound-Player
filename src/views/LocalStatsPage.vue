<template>
  <section class="local-page">
    <!-- 扫描目录管理 -->
    <div class="section-header">
      <h3 class="section-title">扫描目录</h3>
    </div>
    <div v-if="!localMusicStore.state.directories.length" class="local-empty">
      <p>还没有添加扫描目录</p>
    </div>
    <div v-else class="dir-list">
      <div v-for="dir in localMusicStore.state.directories" :key="dir" class="dir-item">
        <span class="dir-path" :title="dir">{{ dir }}</span>
        <button class="dir-remove" @click="removeDir(dir)" title="移除目录">✕</button>
      </div>
    </div>
    <div class="dir-actions">
      <button class="button-surface" @click="addDir">+ 添加目录</button>
      <button class="button-surface" @click="handleScan" :disabled="localMusicStore.state.scanning">
        {{ localMusicStore.state.scanning ? '扫描中…' : '扫描' }}
      </button>
      <button class="button-danger" @click="clearAllData">清除所有数据</button>
    </div>

    <div v-if="localMusicStore.state.scanning" class="local-scanning">
      正在扫描… {{ localMusicStore.state.progress.current }} / {{ localMusicStore.state.progress.total }}
    </div>

    <!-- 最近添加 -->
    <div class="section-header">
      <h3 class="section-title">最近添加</h3>
    </div>
    <div v-if="!recent.length" class="local-empty">
      <p>暂无最近添加的歌曲</p>
    </div>
    <div v-else class="recent-list">
      <div v-for="track in recent" :key="track.id" class="recent-row" @dblclick="playTrack(track)">
        <span class="recent-cover">
          <img v-if="track.coverUrl" :src="track.coverUrl" class="recent-img" alt="" />
          <span v-else class="recent-placeholder"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor"/></svg></span>
        </span>
        <span class="recent-title" :title="track.title">{{ track.title }}</span>
        <span class="recent-artist" :title="track.artist">{{ track.artist }}</span>
        <span class="recent-date">{{ formatDate(track.createdAt) }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore()
import { platform } from '../utils/platform'

const recent = ref<any[]>([])

onMounted(async () => {
  // 从 localStorage 恢复已保存的扫描目录
  if (!localMusicStore.state.directories.length) localMusicStore.loadDirectories()

  if (!platform.localApi) return
  try {
    recent.value = (await platform.localApi.getRecent(10)) || []
    // 懒加载封面
    for (const t of recent.value) {
      if (t.path) {
        platform.localApi.getCover(t.path).then(url => { if (url) t.coverUrl = url })
      }
    }
  } catch (e) {
    console.error('[localStats] load failed:', e)
  }
})

// 曲目变化时重新加载最近添加列表
watch(() => localMusicStore.state.tracks.length, () => {
  if (!platform.localApi) return
  platform.localApi.getRecent(10).then(list => {
    recent.value = list || []
    for (const t of recent.value) {
      if (t.path) {
        platform.localApi.getCover(t.path).then(url => { if (url) t.coverUrl = url })
      }
    }
  }).catch(() => {})
})

function addDir() {
  localMusicStore.addDirectory()
}

function handleScan() {
  if (!localMusicStore.state.directories.length) {
    localMusicStore.addDirectory()
  } else {
    localMusicStore.scanAll()
  }
}

async function clearAllData() {
  if (!confirm('确定清除所有本地歌曲数据？扫描目录和歌曲信息将全部删除。此操作不可撤销。')) return
  await localMusicStore.clearAll()
  recent.value = []
}

async function removeDir(dir: string) {
  const label = getDirLabel(dir)
  if (!confirm(`确定移除扫描目录「${label}」？该目录下的歌曲将从数据库同步删除。`)) return
  try {
    if (platform.localApi) {
      await platform.localApi.deleteTracksByDirectory(dir)
    }
  } catch (e) {
    console.error('[localStats] delete tracks failed:', e)
  }
  localMusicStore.removeDirectoryPath(dir)
  // 先更新 localStorage 中的目录列表，防止 saveDirectories 合并旧数据加回来
  try {
    const saved: string[] = JSON.parse(localStorage.getItem('local_music_dirs') || '[]')
    localStorage.setItem('local_music_dirs', JSON.stringify(saved.filter((d: string) => d !== dir)))
  } catch { /* ignore */ }
  await localMusicStore.loadTracks()
  localMusicStore.saveDirectories()
  // 重新加载最近添加列表
  if (platform.localApi) {
    try {
      recent.value = (await platform.localApi.getRecent(10)) || []
    } catch { /* ignore */ }
  }
}

function getDirLabel(dirPath: string): string {
  const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || dirPath
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${month}-${day}`
}

function playTrack(track: any) {
  const idx = recent.value.findIndex(t => t.id === track.id)
  const playlist = recent.value.map((t: any) => ({
    id: t.id, name: t.title,
    ar: [{ name: t.artist }],
    al: { name: t.album, picUrl: t.coverUrl },
    source: 'local' as const, path: t.path,
  }))
  playerStore.setPlaylist(playlist as any, idx)
  playerStore.playByIndex(idx)
}
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }

.section-header { margin-top: var(--space-2); }
.section-title { margin: 0; font-size: var(--text-headline-md); font-weight: 600; color: var(--text-main); }

.dir-list { display: grid; gap: var(--space-1); }
.dir-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.dir-actions .button-surface,
.dir-actions .button-danger {
  height: 34px;
  padding: 0 var(--space-3);
  font-size: var(--text-label-sm);
  border-radius: var(--radius-sm);
}
.dir-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.dir-path { font-size: var(--text-body-sm); color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.dir-remove { background: none; border: none; cursor: pointer; color: var(--text-soft); padding: 0 0 0 var(--space-2); font-size: 12px; }
.dir-remove:hover { color: var(--danger); }

.local-scanning { padding: var(--space-3); background: var(--accent-soft); border-radius: var(--radius-sm); color: var(--accent); font-size: var(--text-label-sm); }

.recent-list { display: grid; gap: var(--space-1); }
.recent-row {
  display: grid;
  grid-template-columns: 30px minmax(160px, 2fr) minmax(100px, 1fr) 60px;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  cursor: default;
  font-size: var(--text-body-sm);
  transition: background 0.15s;
}
.recent-row:hover { background: var(--bg-muted); }
.recent-cover { display: flex; align-items: center; }
.recent-img { width: 28px; height: 28px; border-radius: 4px; object-fit: cover; }
.recent-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg-muted) 70%, var(--border));
  color: var(--text-soft);
}
.recent-placeholder svg {
  width: 14px;
  height: 14px;
  display: block;
}
.recent-title { color: var(--text-main); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-artist { color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-date { color: var(--text-soft); font-size: var(--text-label-xs); text-align: right; }
.local-empty { text-align: center; padding: var(--space-4); color: var(--text-soft); font-size: var(--text-body-sm); }
</style>