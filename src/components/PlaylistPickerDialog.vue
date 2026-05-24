<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="$emit('cancel')">
      <div class="dialog-panel">
        <h3 class="dialog-title">选择歌单</h3>
        <div class="playlist-picker-list">
          <button
            v-for="pl in playlists"
            :key="pl.id"
            class="playlist-picker-item"
            @click="$emit('confirm', pl.id)"
          >
            {{ pl.name }}
            <span class="playlist-picker-count">{{ pl.tracks?.length || 0 }} 首</span>
          </button>
        </div>
        <div class="dialog-actions">
          <button class="button-surface" @click="$emit('cancel')">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  playlists: { id: string; name: string; tracks?: any[] }[]
}>()

defineEmits<{
  confirm: [playlistId: string]
  cancel: []
}>()
</script>

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
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.dialog-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-headline-md);
  font-weight: 600;
  color: var(--text-main);
}
.playlist-picker-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  max-height: 300px;
  overflow-y: auto;
}
.playlist-picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-muted) 70%, var(--border));
  color: var(--text-main);
  font-size: var(--text-body-sm);
  cursor: pointer;
  transition: background 0.12s;
}
.playlist-picker-item:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.playlist-picker-count {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
}
.dialog-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>