<template>
  <div class="song-actions" @click.stop>
    <TooltipWrapper text="播放">
      <button class="sa-btn" @click.stop="$emit('play')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
    </TooltipWrapper>
    <TooltipWrapper text="下一首播放">
      <button class="sa-btn" @click.stop="$emit('play-next')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>
      </button>
    </TooltipWrapper>
    <TooltipWrapper text="收藏至歌单">
      <button class="sa-btn" @click.stop="$emit('add-to-playlist')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      </button>
    </TooltipWrapper>
    <TooltipWrapper text="更多操作">
      <button
        ref="moreTriggerRef"
        class="sa-btn"
        :class="{ active: moreMenuOpen }"
        @click="toggleMoreMenu"
        @mouseenter="onMoreEnter"
        @mouseleave="onMoreLeave"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
    </TooltipWrapper>
  </div>

  <Teleport to="body">
    <div
      v-if="moreMenuOpen"
      ref="moreMenuRef"
      class="more-menu"
      :style="moreMenuStyle"
      @mouseenter="onMenuEnter"
      @mouseleave="onMenuLeave"
    >
      <button class="more-menu__item" type="button" @click="emitAction('show-in-folder')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>定位到目录</span>
      </button>
      <button class="more-menu__item" type="button" @click="emitAction('match-metadata')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>匹配歌词/标签</span>
      </button>
      <button class="more-menu__item" type="button" @click="emitAction('show-local-album')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        <span>查看本地专辑</span>
      </button>
      <button class="more-menu__item" type="button" @click="emitAction('show-online-album')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>查看在线专辑</span>
      </button>
      <button class="more-menu__item" type="button" @click="emitAction('upload-to-cloud')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
        <span>上传至云盘</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TooltipWrapper from './TooltipWrapper.vue'

const emit = defineEmits<{
  play: []
  'play-next': []
  'add-to-playlist': []
  'show-in-folder': []
  'match-metadata': []
  'show-local-album': []
  'show-online-album': []
  'upload-to-cloud': []
}>()

// ---- 更多操作下拉菜单 ----
const moreMenuOpen = ref(false)
const moreTriggerRef = ref<HTMLElement | null>(null)
const moreMenuRef = ref<HTMLElement | null>(null)
const moreMenuStyle = ref<Record<string, string>>({})
let moreHoverTimer: ReturnType<typeof setTimeout> | null = null

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value
  if (moreMenuOpen.value) updateMoreMenuPosition()
}

function updateMoreMenuPosition() {
  const el = moreTriggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 6
  const estimatedHeight = 5 * 42 + 12
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  let top: number

  if (spaceBelow >= estimatedHeight) {
    top = rect.bottom + gap
  } else if (spaceAbove >= estimatedHeight) {
    top = rect.top - estimatedHeight - gap
  } else {
    if (spaceAbove > spaceBelow) {
      top = Math.max(gap, rect.top - estimatedHeight - gap)
    } else {
      top = rect.bottom + gap
    }
  }

  let left = rect.left
  const menuWidth = 180
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8)
  }

  moreMenuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${menuWidth}px`,
    zIndex: '10000',
  }
}

function onMoreEnter() {
  if (moreHoverTimer) clearTimeout(moreHoverTimer)
  moreMenuOpen.value = true
  updateMoreMenuPosition()
}

function onMoreLeave() {
  moreHoverTimer = setTimeout(() => {
    moreMenuOpen.value = false
  }, 150)
}

function onMenuEnter() {
  if (moreHoverTimer) clearTimeout(moreHoverTimer)
}

function onMenuLeave() {
  moreMenuOpen.value = false
}

function emitAction(key: string) {
  emit(key as any)
  moreMenuOpen.value = false
}
</script>

<style scoped>
.song-actions {
  opacity: 0;
  visibility: hidden;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  z-index: 2;
}

.sa-btn {

  animation: anFadeUp var(--an-duration-fast) var(--an-ease) both;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-soft);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition:
    color 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease,
    border-color 0.12s ease;
  box-shadow: var(--glass-highlight);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.sa-btn:hover {
  background: var(--bg-muted);
  color: var(--text-main);
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
}

.sa-btn:active {
  transform: translateY(0);
}

.sa-btn.active {
  background: var(--bg-muted);
  color: var(--text-main);
}

/* 更多菜单（dropdown） */
.more-menu {
  position: fixed;
  background: var(--bg-solid);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: var(--space-1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2), var(--glass-highlight);
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.more-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 38px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background 0.12s ease;
}

.more-menu__item:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-solid));
}

.more-menu__item svg {
  flex-shrink: 0;
  color: var(--text-soft);
}
</style>

<style>
/* 全局 hover 显隐规则：与 SongActions 完全一致的机制 */
.local-song-row:hover .song-actions {
  opacity: 1;
  visibility: visible;
}
</style>
