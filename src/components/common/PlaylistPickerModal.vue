<template>
  <Teleport to="body">
    <div v-if="visible" class="pp-mask" @click.self="$emit('update:visible', false)">
      <div class="pp-popup">
        <h3 class="pp-title">{{ title }}</h3>
        <ul class="pp-list">
          <li
            v-for="p in playlists"
            :key="p.id"
            class="pp-item"
            :class="{ 'pp-item--selected': selectedId === p.id }"
            @click="$emit('select', p.id)"
          >
            <img
              v-if="p.coverImgUrl"
              class="pp-cover"
              :src="resolveSizedImageUrl(p.coverImgUrl, 40)"
              alt=""
              loading="lazy"
            />
            <span class="pp-name">{{ p.name }}</span>
          </li>
          <li v-if="!playlists.length" class="pp-empty">暂无可用歌单</li>
        </ul>
        <div class="pp-actions">
          <button class="pp-close" @click="$emit('update:visible', false)">取消</button>
          <button
            class="pp-confirm"
            :disabled="!selectedId"
            @click="$emit('confirm')"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { resolveSizedImageUrl } from '../../utils/image';

defineProps<{
  visible: boolean;
  playlists: any[];
  selectedId: number | null;
  title?: string;
}>();

defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'select', playlistId: number): void;
  (e: 'confirm'): void;
}>();
</script>

<style scoped>
.pp-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
}

.pp-popup {
  width: min(380px, calc(100vw - 40px));
  max-height: 60vh;
  background: var(--bg-solid);
  border-radius: 16px;
  padding: var(--space-3);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-2);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.pp-title {
  margin: 0;
  color: var(--text-main);
  font-size: 15px;
  font-weight: 700;
  padding: var(--space-1) var(--space-2);
}

.pp-list {
  overflow-y: auto;
  display: grid;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pp-list::-webkit-scrollbar {
  display: none;
}

.pp-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.12s ease;
}

.pp-item:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-solid));
}

.pp-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
}

.pp-name {
  color: var(--text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
}

.pp-close {
  padding: 8px;
  border: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-solid));
  color: var(--text-sub);
  cursor: pointer;
  font-size: 13px;
}

.pp-close:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-solid));
  color: var(--text-main);
}

.pp-actions {
  display: flex;
  gap: var(--space-2);
}

.pp-actions > * {
  flex: 1;
}

.pp-confirm {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 10px;
  background: var(--accent, #5c6bc0);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.pp-confirm:disabled {
  opacity: 0.35;
  cursor: default;
}

.pp-confirm:not(:disabled):hover {
  opacity: 0.85;
}

.pp-item--selected {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-solid));
}

.pp-item--selected .pp-name {
  color: var(--text-main);
}
</style>
