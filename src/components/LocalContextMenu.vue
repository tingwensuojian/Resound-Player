<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="local-context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <button
        v-for="item in items"
        :key="item.key"
        class="context-item"
        :class="{ danger: item.danger }"
        @click="handleAction(item.key)"
      >
        <span class="context-icon" v-html="iconSvg(item.icon)"></span>
        <span>{{ item.label }}</span>
      </button>
    </div>
    <div v-if="visible" class="context-backdrop" @click="close" @contextmenu.prevent="close"></div>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue'

const ICON_SVGS: Record<string, string> = {
  '▶': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  '⏭': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
  '➕': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  '📋': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  '📁': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
}

function iconSvg(icon?: string): string {
  return ICON_SVGS[icon || ''] || ''
}

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
}

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  action: [key: string]
  close: []
}>()

function handleAction(key: string) {
  emit('action', key)
  emit('close')
}

function close() {
  emit('close')
}

watch(() => props.visible, (v) => {
  if (v) {
    // 确保菜单不超出视口
    const el = document.querySelector('.local-context-menu') as HTMLElement | null
    if (!el) return
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth) el.style.left = (window.innerWidth - rect.width - 8) + 'px'
      if (rect.bottom > window.innerHeight) el.style.top = (window.innerHeight - rect.height - 8) + 'px'
    })
  }
})
</script>

<style scoped>
.local-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: var(--bg-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
  padding: var(--space-1);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.context-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.context-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-label-sm);
  color: var(--text-main);
  text-align: left;
  white-space: nowrap;
  transition: background 0.1s;
}
.context-item:hover {
  background: var(--bg-muted);
}
.context-item.danger {
  color: var(--danger);
}
.context-item.danger:hover {
  background: var(--danger-soft);
}
.context-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-sub);
}
</style>