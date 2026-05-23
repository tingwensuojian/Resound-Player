<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="lyricsSelection.isOpen" class="sel-backdrop" @click.self="lyricsSelection.closeSelection" @keydown.esc="lyricsSelection.closeSelection" tabindex="-1" ref="backdropRef">
        <div class="sel-modal" :class="{ 'an-enter-card': true }" :style="{ '--rhythm-offset': 1, '--i': 0 }">
          <!-- header -->
          <div class="sel-head">
            <div class="sel-head-info">
              <h3 class="sel-title">{{ playerStore.currentTrack?.name || '选择歌词' }}</h3>
              <p class="sel-artist">{{ artistText }}</p>
            </div>
            <button class="sel-close" type="button" aria-label="关闭" @click="lyricsSelection.closeSelection"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <!-- 未加载 -->
          <div v-if="isLoading" class="sel-status">歌词加载中...</div>
          <!-- 无歌词 -->
          <div v-else-if="!lyricLines.length" class="sel-status">暂无歌词</div>
          <!-- 歌词列表 -->
          <template v-else>
            <div class="sel-body">
              <div v-for="(line, idx) in displayLines" :key="idx" class="sel-row" @click="lyricsSelection.toggleLine(idx)">
                <span class="sel-check" :class="{ checked: lyricsSelection.selectedIndices.has(idx) }">
                  <svg v-if="lyricsSelection.selectedIndices.has(idx)" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </span>
                <div class="sel-text">
                  <span class="sel-line">{{ line.text }}</span>
                  <span v-if="line.tag" class="sel-tag">{{ line.tag }}</span>
                  <span v-if="lyricsSelection.showTranslation && line.translation" class="sel-trans">{{ line.translation }}</span>
                </div>
              </div>
            </div>
            <!-- footer -->
            <div class="sel-foot">
              <div class="sel-foot-left">
                <button class="sel-btn" :class="{ active: lyricsSelection.showTranslation }" @click="lyricsSelection.toggleSelectionTranslation">译</button>
                <button class="sel-btn" @click="onSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
              </div>
              <div class="sel-foot-right">
                <span class="sel-count">已选 {{ lyricsSelection.selectedIndices.size }} 句</span>
                <button class="sel-btn sel-copy" :disabled="lyricsSelection.selectedIndices.size === 0" @click="onCopy">复制</button>
              </div>
            </div>
          </template>
          <!-- 复制成功提示 -->
          <transition name="copy-toast">
            <div v-if="copyFeedback" class="sel-toast">已复制选中歌词</div>
          </transition>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useLyrics } from '../composables/useLyrics';
import { useLyricsSelectionStore } from '../stores/lyricsSelection';
import { playerStore } from '../stores/player';
const lyricsSelection = useLyricsSelectionStore();

const { lyricLines, isLoading, loadLyrics } = useLyrics();
const backdropRef = ref<HTMLElement | null>(null);
const artistText = computed(() => { const ar = playerStore.currentTrack?.ar || []; return ar.length ? ar.map((a: any) => a.name).join('/') : ''; });

/* 加载歌词 */
watch(() => playerStore.currentTrack?.id, async (id) => {
  if (!id) return;
  await loadLyrics(playerStore.currentTrack);
}, { immediate: true });

/* ESC 关闭 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lyricsSelection.isOpen) lyricsSelection.closeSelection();
}
watch(() => lyricsSelection.isOpen, (open) => {
  if (open) nextTick(() => backdropRef.value?.focus());
});
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

/* 切歌时关闭浮窗重置状态 */
watch(() => playerStore.currentTrack?.id, (newId) => {
  if (lyricsSelection.isOpen) {
    lyricsSelection.currentTrackId = newId ?? null;
    lyricsSelection.selectedIndices = new Set();
    lyricsSelection.showTranslation = false;
  }
});

/* 展示行：歌曲名 + 歌手 + 歌词 */
const displayLines = computed(() => {
  const lines: { text: string; tag?: string; translation?: string }[] = [];
  if (playerStore.currentTrack?.name) lines.push({ text: playerStore.currentTrack.name, tag: '歌曲' });
  if (artistText.value) lines.push({ text: artistText.value, tag: '歌手' });
  for (const l of lyricLines.value) {
    lines.push({ text: l.text || '...', translation: l.translation });
  }
  return lines;
});
const lineCount = computed(() => displayLines.value.length);

/* 全选/取消全选 */
const allSelected = computed(() => lineCount.value > 0 && lyricsSelection.selectedIndices.size === lineCount.value);
function onSelectAll() {
  if (allSelected.value) {
    lyricsSelection.selectedIndices = new Set();
  } else {
    lyricsSelection.selectedIndices = new Set(displayLines.value.map((_, i) => i));
  }
}

/* 复制 */
const copyFeedback = ref(false);

async function onCopy() {
  const items = displayLines.value.filter((_, i) => lyricsSelection.selectedIndices.has(i));
  if (!items.length) return;
  const text = items.map((item) => {
    if (lyricsSelection.showTranslation && item.translation) {
      return `${item.text}\n${item.translation}`;
    }
    return item.text;
  }).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.value = true;
    setTimeout(() => { copyFeedback.value = false; }, 1500);
  } catch { /* ignore */ }
}
</script>

<style scoped>
.sel-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.45);
  display: grid; place-items: center;
}
.sel-modal {
  width: min(520px, calc(100vw - 40px));
  max-height: min(70vh, 600px);
  background: var(--bg-surface, rgba(26,28,40,0.97));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: 16px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  overflow: hidden;
}
.sel-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-soft, rgba(255,255,255,0.06));
}
.sel-head-info { min-width: 0; display: grid; gap: 2px; }
.sel-title { margin: 0; color: #fff; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sel-artist { margin: 0; color: rgba(255,255,255,0.55); font-size: var(--text-label-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sel-close {
  width: 28px; height: 28px; border: none; background: transparent;
  color: rgba(255,255,255,0.5); cursor: pointer;
  display: grid; place-items: center; border-radius: 6px;
  transition: color 120ms ease, background 120ms ease;
}
.sel-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
.sel-status { padding: var(--space-6); text-align: center; color: rgba(255,255,255,0.4); font-size: var(--text-label-md); }
.sel-body {
  overflow-y: auto; padding: var(--space-2) var(--space-3);
  display: grid; gap: 2px;
}
.sel-row {
  display: flex; align-items: flex-start; gap: var(--space-2);
  padding: var(--space-2) var(--space-2); border-radius: 8px;
  cursor: pointer; transition: background 120ms ease;
}
.sel-row:hover { background: rgba(255,255,255,0.06); }
.sel-check {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px;
  border: 2px solid rgba(255,255,255,0.25);
  display: grid; place-items: center; margin-top: 2px;
  transition: border-color 120ms ease, background 120ms ease;
}
.sel-check.checked {
  border-color: var(--accent, #c39c76);
  background: var(--accent, #c39c76);
}
.sel-check svg { color: #fff; }
.sel-text { min-width: 0; display: grid; gap: 2px; }
.sel-line { color: rgba(255,255,255,0.82); font-size: var(--text-label-md); line-height: 1.5; word-break: break-word; }
.sel-tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); font-size: var(--text-label-xs); line-height: 1.6; vertical-align: middle; }
.sel-trans { color: rgba(255,255,255,0.5); font-size: 13px; line-height: 1.4; word-break: break-word; }
.sel-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-soft, rgba(255,255,255,0.06));
}
.sel-foot-left, .sel-foot-right { display: flex; align-items: center; gap: var(--space-2); }
.sel-btn {
  padding: 6px 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15);
  background: transparent; color: rgba(255,255,255,0.7); font-size: var(--text-label-sm); font-weight: 600;
  cursor: pointer; transition: all 120ms ease;
}
.sel-btn:hover:not(:disabled) { color: #fff; border-color: rgba(255,255,255,0.3); }
.sel-btn.active { background: var(--accent, #c39c76); border-color: transparent; color: #fff; }
.sel-copy { background: var(--accent, #c39c76); border-color: transparent; color: #fff; }
.sel-copy:disabled { opacity: 0.4; cursor: not-allowed; }
.sel-count { color: rgba(255,255,255,0.4); font-size: var(--text-label-sm); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.sel-toast {
  position: fixed; bottom: 10%; left: 50%; transform: translateX(-50%);
  padding: 8px 20px; border-radius: 999px;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  color: #fff; font-size: 13px; font-weight: 500;
  pointer-events: none; z-index: 210;
}
.copy-toast-enter-active, .copy-toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.copy-toast-enter-from, .copy-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
