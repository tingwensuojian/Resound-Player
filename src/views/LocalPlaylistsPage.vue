<template>
  <section class="local-page">
    <div class="local-page-actions ui-safe-group">
      <button class="play-all" @click="showCreateDialog = true">
        + 新建歌单
      </button>
    </div>
    <PlaylistSettingsModal
      :open="showSettingsModal"
      :playlist="settingsPlaylist"
      @save="onSettingsSave"
      @cancel="showSettingsModal = false"
      @update:open="showSettingsModal = $event"
    />

    <div v-if="!localMusicStore.state.playlists.length" class="local-empty">
      <p>还没有本地歌单，点击"新建歌单"创建</p>
    </div>

    <div v-if="localMusicStore.state.playlists.length" class="playlist-grid an-stagger-media">
      <div
        v-for="(pl, idx) in localMusicStore.state.playlists"
        :key="pl.id"
        class="playlist-card"
        :style="{ '--i': idx }"
        @click="openPlaylist(pl.id)"
      >
        <div class="playlist-card-cover">
          <img v-if="pl.customCoverUrl" :src="pl.customCoverUrl" class="playlist-card-single-cover hover-scale-image" alt="" loading="lazy" />
          <div v-else class="cover-mosaic" :class="'mosaic-' + Math.min(pl.coverUrls?.length || 0, 6)">
            <img
              v-for="(url, i) in (pl.coverUrls || []).slice(0, 6)"
              :key="i"
              :src="url"
              class="mosaic-cell"
              :class="{ 'mosaic-empty': !url }"
              alt=""
              loading="lazy"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
        </div>
        <div class="playlist-card-info">
          <span class="playlist-card-name" :title="pl.name">{{ pl.name }}</span>
          <LocalMetadataStatusBadge
            v-if="playlistStatusOf(pl)"
            :result="playlistStatusOf(pl)"
            compact
          />
          <span class="playlist-card-count">{{ pl.tracks?.length || 0 }} 首</span>
        </div>
        <button class="playlist-card-settings" @click.stop="openSettings(pl)" title="歌单设置">⚙</button>
        <button class="playlist-card-delete" @click.stop="handleDelete(pl.id, pl.name)" title="删除歌单">
          ✕
        </button>
      </div>
    </div>

    <!-- 新建歌单对话框 -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
        <div class="dialog-panel">
          <h3 class="dialog-title">新建歌单</h3>
          <input
            ref="inputRef"
            v-model="newName"
            class="dialog-input"
            placeholder="请输入歌单名称"
            @keyup.enter="submitCreate"
          />
          <div class="dialog-actions">
            <button class="button-surface" @click="showCreateDialog = false">取消</button>
            <button class="button-primary" @click="submitCreate" :disabled="!newName.trim()">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
import LocalMetadataStatusBadge from '../components/ui/LocalMetadataStatusBadge.vue'
const localMusicStore = useLocalMusicStore()
import PlaylistSettingsModal from '../components/ui/PlaylistSettingsModal.vue'

const showCreateDialog = ref(false)
const newName = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const showSettingsModal = ref(false)
const settingsPlaylist = ref<any>(null)

watch(showCreateDialog, async (val) => {
  if (val) {
    newName.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
})

async function submitCreate() {
  const name = newName.value.trim()
  if (!name) return
  showCreateDialog.value = false
  await localMusicStore.createPlaylist(name)
}

onMounted(() => {
  if (localMusicStore.hasLocalSupport) {
    localMusicStore.loadPlaylists()
    const playlistTracks = localMusicStore.state.playlists.flatMap((playlist: any) => playlist?.tracks || [])
    if (playlistTracks.length) {
      localMusicStore.refreshMetadataStatuses(playlistTracks)
    }
  }
})

function playlistStatusOf(playlist: any) {
  for (const track of playlist?.tracks || []) {
    const status = localMusicStore.metadataStatusOf(track)
    if (status) return status
  }
  return null
}

function openSettings(pl: any) {
  settingsPlaylist.value = pl
  showSettingsModal.value = true
}

async function onSettingsSave(id: string, updates: { name?: string; customCoverUrl?: string }) {
  await localMusicStore.updatePlaylist(id, updates)
  settingsPlaylist.value = null
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`确定删除歌单「${name}」？此操作不可撤销。`)) return
  await localMusicStore.deletePlaylist(id)
}

function openPlaylist(id: string) {
  localMusicStore.openPlaylist(id)
}
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-page-actions { display: flex; gap: var(--space-2); align-items: center; }
.play-all {
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 70%, var(--border));
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent) 92%, #fff),
    color-mix(in srgb, var(--accent) 74%, #000)
  );
  color: var(--text-main);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 34%, transparent), var(--glass-highlight);
  cursor: pointer;
  font-size: var(--text-label-sm);
  font-weight: 600;
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.play-all:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 40%, transparent), var(--glass-highlight);
}
.local-empty { text-align: center; padding: var(--space-8); color: var(--text-soft); }

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
}
.playlist-card {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.playlist-card:hover {
  background: var(--bg-muted);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.playlist-card-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.playlist-card-single-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-mosaic {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 2px;
}
.mosaic-1 { grid-template: 1fr / 1fr; }
.mosaic-2 { grid-template: 1fr 1fr / 1fr; }
.mosaic-3,
.mosaic-4 { grid-template: 1fr 1fr / 1fr 1fr; }
.mosaic-5,
.mosaic-6 { grid-template: 1fr 1fr 1fr / 1fr 1fr; }

.mosaic-cell {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mosaic-empty { display: none; }
.playlist-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.playlist-card-name {
  font-size: var(--text-body-sm);
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-card-count {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
}
.playlist-card-delete {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.4);
  color: #fff;
  font-size: var(--text-label-xs);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.playlist-card:hover .playlist-card-delete { opacity: 1; }
.playlist-card-delete:hover { background: var(--danger); }
.playlist-card-settings {
  position: absolute;
  top: var(--space-2);
  right: calc(var(--space-2) + 30px);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.4);
  color: #fff;
  font-size: var(--text-label-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.playlist-card:hover .playlist-card-settings { opacity: 1; }
.playlist-card-settings:hover { background: var(--accent); }
</style>

<!-- 非 scoped 样式：对话框遮罩 -->
<style>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.dialog-panel {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border, #ddd);
  border-radius: var(--radius-md, 12px);
  padding: var(--space-5, 20px);
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.dialog-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-headline-md);
  font-weight: 600;
  color: var(--text-main);
}
.dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
  color: var(--text-main);
  font-size: var(--text-body-md);
  outline: none;
  margin-bottom: var(--space-3);
}
.dialog-input:focus {
  border-color: var(--accent);
}
.dialog-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
