<template>
  <transition name="ps-fade">
    <div v-if="open" class="ps-backdrop" @click.self="handleCancel">
      <section class="ps-shell" role="dialog" aria-modal="true">
        <header class="ps-header">
          <h3 class="ps-title">歌单设置</h3>
          <button class="ps-close" type="button" aria-label="关闭" @click="handleCancel">×</button>
        </header>

        <div class="ps-body">
          <!-- 封面预览 -->
          <div class="ps-cover-section">
            <div class="ps-cover-preview">
              <img v-if="customCoverData" :src="customCoverData" class="ps-cover-img" alt="" />
              <div v-else class="ps-cover-placeholder">🎵</div>
            </div>
            <div class="ps-cover-actions">
              <button class="button-surface" @click="triggerFilePick">选择图片</button>
              <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFilePicked" />
            </div>
          </div>

          <!-- 封面 URL / base64 输入 -->
          <label class="ps-field">
            <span class="ps-label">封面图片 URL 或 base64</span>
            <input v-model="coverUrlInput" class="ps-input" placeholder="粘贴图片链接或 base64 数据" @input="onCoverUrlInput" />
          </label>

          <!-- 歌单名称 -->
          <label class="ps-field">
            <span class="ps-label">歌单名称</span>
            <input v-model="nameInput" class="ps-input" placeholder="请输入歌单名称" />
          </label>
        </div>

        <footer class="ps-footer">
          <button class="button-ghost" @click="handleCancel">取消</button>
          <button class="button-primary" :disabled="!nameInput.trim()" @click="handleSave">保存</button>
        </footer>
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    playlist?: { id: string; name: string; customCoverUrl?: string } | null
  }>(),
  { playlist: null },
)

const emit = defineEmits<{
  (e: 'save', id: string, updates: { name?: string; customCoverUrl?: string }): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const nameInput = ref('')
const coverUrlInput = ref('')
const customCoverData = ref('')

watch(() => props.open, (val) => {
  if (val && props.playlist) {
    nameInput.value = props.playlist.name
    coverUrlInput.value = props.playlist.customCoverUrl || ''
    customCoverData.value = props.playlist.customCoverUrl || ''
  }
})

function triggerFilePick() {
  fileInput.value?.click()
}

function onFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    customCoverData.value = reader.result as string
    coverUrlInput.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

function onCoverUrlInput() {
  // 如果输入的是 URL 或 base64，更新预览
  if (coverUrlInput.value.startsWith('data:') || coverUrlInput.value.startsWith('http')) {
    customCoverData.value = coverUrlInput.value
  }
}

function handleSave() {
  if (!props.playlist || !nameInput.value.trim()) return
  const updates: { name?: string; customCoverUrl?: string } = {
    name: nameInput.value.trim(),
  }
  if (coverUrlInput.value) {
    updates.customCoverUrl = coverUrlInput.value
  } else {
    updates.customCoverUrl = '' // 清空自定义封面
  }
  emit('save', props.playlist.id, updates)
  emit('update:open', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}
</script>

<style scoped>
.ps-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.ps-shell {
  background: var(--bg-surface, #1c1c1e);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
}
.ps-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4, 16px) var(--space-4, 16px) 0;
}
.ps-title { margin: 0; font-size: var(--text-body-md, 16px); font-weight: 600; color: var(--text-main, #e7e5e4); }
.ps-close { background: none; border: none; color: var(--text-soft, #93a5bb); font-size: 20px; cursor: pointer; padding: 0; line-height: 1; }
.ps-body { padding: var(--space-4, 16px); display: flex; flex-direction: column; gap: var(--space-3, 12px); }
.ps-field { display: flex; flex-direction: column; gap: var(--space-1, 4px); }
.ps-label { font-size: var(--text-label-sm, 12px); font-weight: 600; color: var(--text-sub, #b8c6d8); }
.ps-input {
  width: 100%; box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-md, 10px);
  background: var(--bg-muted, rgba(255,255,255,0.05));
  color: var(--text-main, #e7e5e4);
  font-size: var(--text-body-sm, 14px);
  outline: none;
  transition: border-color 0.2s;
}
.ps-input:focus { border-color: var(--accent, #4f9cf7); }
.ps-cover-section { display: flex; gap: var(--space-3, 12px); align-items: center; }
.ps-cover-preview {
  width: 80px; height: 80px; flex-shrink: 0;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-muted, rgba(255,255,255,0.05));
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.ps-cover-img { width: 100%; height: 100%; object-fit: cover; }
.ps-cover-placeholder { font-size: 28px; }
.ps-cover-actions { display: flex; gap: var(--space-2, 8px); }
.ps-footer {
  display: flex; justify-content: flex-end; gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px) var(--space-4, 16px);
}
.button-ghost {
  padding: 8px 16px; border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-md, 10px); background: transparent;
  color: var(--text-main, #e7e5e4); font-size: var(--text-body-sm, 14px); cursor: pointer;
}
.button-ghost:hover { background: var(--bg-muted, rgba(255,255,255,0.08)); }
.button-primary {
  padding: 8px 16px; border: none;
  border-radius: var(--radius-md, 10px); background: var(--accent, #4f9cf7);
  color: #fff; font-size: var(--text-body-sm, 14px); font-weight: 600; cursor: pointer;
}
.button-primary:disabled { opacity: 0.4; cursor: default; }
.button-primary:not(:disabled):hover { opacity: 0.85; }
.ps-fade-enter-active, .ps-fade-leave-active { transition: opacity 0.2s ease; }
.ps-fade-enter-from, .ps-fade-leave-to { opacity: 0; }
</style>