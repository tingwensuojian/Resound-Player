<template>
  <Teleport to="body">
    <transition name="match-fade">
      <div v-if="visible" class="match-backdrop metadata-backdrop" @click.self="close">
        <section class="match-modal metadata-modal">
          <header class="match-head">
            <div class="match-title-block">
              <h3>补全缺失标签</h3>
              <p>{{ trackTitle }} · {{ trackArtist }}</p>
            </div>
            <button class="match-close" type="button" aria-label="关闭" @click="close">×</button>
          </header>

          <div class="match-body">
            <p v-if="loading" class="status">正在分析本地标签...</p>
            <p v-else-if="errorText" class="status error">{{ errorText }}</p>
            <template v-else-if="preview">
              <div v-if="metadataStatus" class="summary">
                <strong>当前状态</strong>
                <span>{{ metadataStatus.message }}</span>
              </div>
              <div v-if="successText" class="summary success">{{ successText }}</div>
              <div v-if="preview.duplicate" class="summary success">这个文件已按相同内容补全过，本次会直接跳过。</div>
              <div v-else-if="!preview.writePlan?.canWrite" class="summary">当前没有可补全的缺失字段。</div>

              <div class="preview-block">
                <h4>手动编辑后写入</h4>
                <div class="edit-grid">
                  <label class="edit-field">
                    <span>歌曲名称</span>
                    <input v-model.trim="form.title" type="text" placeholder="歌曲名称" />
                  </label>
                  <label class="edit-field">
                    <span>歌手</span>
                    <input v-model.trim="form.artists" type="text" placeholder="多个歌手用 / 分隔" />
                  </label>
                  <label class="edit-field">
                    <span>专辑</span>
                    <input v-model.trim="form.album" type="text" placeholder="专辑名称" />
                  </label>
                  <label class="edit-field">
                    <span>专辑歌手</span>
                    <input v-model.trim="form.albumArtist" type="text" placeholder="专辑歌手" />
                  </label>
                  <label class="edit-field">
                    <span>风格</span>
                    <input v-model.trim="form.genre" type="text" placeholder="风格" />
                  </label>
                  <label class="edit-field">
                    <span>年份</span>
                    <input v-model.trim="form.year" type="number" min="0" placeholder="年份" />
                  </label>
                  <label class="edit-field">
                    <span>音轨号</span>
                    <input v-model.trim="form.trackNo" type="number" min="0" placeholder="音轨号" />
                  </label>
                  <label class="edit-field">
                    <span>碟号</span>
                    <input v-model.trim="form.discNo" type="number" min="0" placeholder="碟号" />
                  </label>
                  <label class="edit-field edit-field--full">
                    <span>歌词</span>
                    <textarea v-model="form.lyrics" rows="8" placeholder="可手动调整歌词内容后再写入" />
                  </label>
                </div>
              </div>

              <div class="preview-block">
                <h4>将写入</h4>
                <div v-if="preview.writePlan?.toWrite?.length" class="preview-list">
                  <div v-for="item in preview.writePlan.toWrite" :key="item.key" class="preview-item">
                    <strong>{{ item.label }}</strong>
                    <span>{{ formatValue(item.value) }}</span>
                  </div>
                </div>
                <p v-else class="empty-text">没有需要写入的字段</p>
              </div>

              <div class="preview-block">
                <h4>将跳过</h4>
                <div v-if="preview.writePlan?.skipped?.length" class="preview-list">
                  <div v-for="item in preview.writePlan.skipped" :key="item.key" class="preview-item">
                    <strong>{{ item.label }}</strong>
                    <span>{{ item.reason }}</span>
                  </div>
                </div>
                <p v-else class="empty-text">没有跳过的字段</p>
              </div>
            </template>
          </div>

          <footer class="match-foot">
            <span class="hint">仅补文件里缺失的标签，不会覆盖你已有的标题、歌手、歌词和封面。</span>
            <button type="button" class="primary" :disabled="loading || writing || !canWrite" @click="confirmWrite">
              {{ writing ? '写入中...' : '确认写入' }}
            </button>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocalMusicStore } from '../stores/localMusic'
import { useLoginModalStore } from '../stores/loginModal'

const props = defineProps<{
  visible: boolean
  track: any
}>()

const emit = defineEmits<{ close: []; written: [] }>()

const localMusicStore = useLocalMusicStore()
const loginModalStore = useLoginModalStore()

const loading = ref(false)
const writing = ref(false)
const errorText = ref('')
const preview = ref<any | null>(null)
const metadataStatus = ref<any | null>(null)
const successText = ref('')
const form = ref({
  title: '',
  artists: '',
  album: '',
  albumArtist: '',
  genre: '',
  year: '',
  trackNo: '',
  discNo: '',
  lyrics: '',
})

const trackTitle = computed(() => props.track?.name || props.track?.title || '本地歌曲')
const trackArtist = computed(() => {
  const ar = Array.isArray(props.track?.ar) ? props.track.ar.map((a: any) => a?.name).filter(Boolean).join(' ') : ''
  return ar || props.track?.artist || '未知歌手'
})

const canWrite = computed(() => {
  if (!preview.value) return false
  if (preview.value.duplicate) return false
  return Boolean(preview.value.writePlan?.canWrite)
})

function close() {
  emit('close')
}

function formatValue(value: any): string {
  if (Array.isArray(value)) return value.join(' / ')
  if (value && typeof value === 'object' && value.buffer) return '云端封面'
  return String(value ?? '')
}

function summarizeWrittenFields(result: any): string {
  const labels = Array.isArray(result?.writePlan?.toWrite)
    ? result.writePlan.toWrite
        .map((item: any) => String(item?.label || '').trim())
        .filter(Boolean)
    : []
  if (!labels.length) return '缺失标签已写入文件'
  return `已写入：${labels.join('、')}`
}

function buildOverrides() {
  return {
    title: form.value.title,
    artists: form.value.artists,
    album: form.value.album,
    albumArtist: form.value.albumArtist,
    genre: form.value.genre,
    year: form.value.year,
    trackNo: form.value.trackNo,
    discNo: form.value.discNo,
    lyrics: form.value.lyrics,
  }
}

function hydrateFormFromPreview(previewData: any) {
  const normalized = previewData?.normalizedMetadata || {}
  form.value = {
    title: String(normalized.title || ''),
    artists: Array.isArray(normalized.artists) ? normalized.artists.join('/') : '',
    album: String(normalized.album || ''),
    albumArtist: String(normalized.albumArtist || ''),
    genre: String(normalized.genre || ''),
    year: normalized.year ? String(normalized.year) : '',
    trackNo: normalized.trackNo ? String(normalized.trackNo) : '',
    discNo: normalized.discNo ? String(normalized.discNo) : '',
    lyrics: String(normalized.lyrics || ''),
  }
}

async function loadPreview() {
  if (!props.track?.path) return
  loading.value = true
  errorText.value = ''
  successText.value = ''
  preview.value = null
  try {
    metadataStatus.value = await localMusicStore.getMetadataStatus(props.track)
    preview.value = await localMusicStore.previewMetadataWrite(props.track)
    hydrateFormFromPreview(preview.value)
    preview.value = await localMusicStore.previewMetadataWrite(props.track, buildOverrides())
    if (preview.value?.duplicate) {
      successText.value = '这个文件之前已经按相同内容补全过，本次不会重复写入。'
    } else if (!preview.value?.writePlan?.canWrite) {
      successText.value = '当前文件没有可补全的缺失字段。'
    }
  } catch (error: any) {
    errorText.value = error?.message || '预览失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

async function confirmWrite() {
  if (!props.track?.path) return
  writing.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const result = await localMusicStore.writeMetadata(props.track, buildOverrides())
    if (result?.skipped) {
      successText.value = result.reason || '没有需要补全的字段'
      loginModalStore.showGlobalToast(successText.value, 'info', 2200)
    } else {
      const summary = summarizeWrittenFields(result)
      successText.value = `${summary}，当前歌曲状态已更新。`
      loginModalStore.showGlobalToast(summary, 'success', 2800)
    }
    emit('written')
    metadataStatus.value = await localMusicStore.getMetadataStatus(props.track)
    preview.value = await localMusicStore.previewMetadataWrite(props.track, buildOverrides())
    window.setTimeout(() => {
      close()
    }, 550)
  } catch (error: any) {
    errorText.value = error?.message || '写入失败，请稍后再试'
  } finally {
    writing.value = false
  }
}

watch(() => props.visible, (open) => {
  if (open) loadPreview()
  else {
    loading.value = false
    writing.value = false
    errorText.value = ''
    successText.value = ''
    preview.value = null
    metadataStatus.value = null
    form.value = {
      title: '',
      artists: '',
      album: '',
      albumArtist: '',
      genre: '',
      year: '',
      trackNo: '',
      discNo: '',
      lyrics: '',
    }
  }
}, { immediate: true })

watch(form, async () => {
  if (!props.visible || loading.value || writing.value || errorText.value) return
  try {
    preview.value = await localMusicStore.previewMetadataWrite(props.track, buildOverrides())
  } catch {
    /* keep last valid preview */
  }
}, { deep: true })
</script>

<style scoped>
.match-backdrop.metadata-backdrop {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: grid;
  place-items: center;
  background: rgba(12, 10, 18, 0.42);
  backdrop-filter: blur(10px) saturate(120%);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
}
.match-modal.metadata-modal {
  width: min(620px, calc(100vw - 36px));
  max-height: min(78vh, 720px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--border-soft, rgba(255,255,255,0.12));
  background:
    radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 100%),
    color-mix(in srgb, var(--expanded-panel-bg, var(--bg-solid)) 88%, transparent);
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.28);
}
.match-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-soft, rgba(255,255,255,0.08));
}
.match-title-block {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.match-title-block h3 {
  margin: 0;
  color: var(--text-main);
  font-size: var(--text-body-md);
  font-weight: 700;
}
.match-title-block p {
  margin: 0;
  color: var(--text-soft);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: var(--text-headline-md);
  line-height: 1;
  cursor: pointer;
}
.match-close:hover {
  color: var(--text-main);
  background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 90%, transparent);
}
.match-body {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px 18px;
}
.preview-block { display: grid; gap: 10px; }
.preview-block h4 { margin: 0; color: var(--text-main); font-size: 13px; font-weight: 700; }
.edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}
.edit-field {
  display: grid;
  gap: 6px;
}
.edit-field--full {
  grid-column: 1 / -1;
}
.edit-field span {
  color: var(--text-soft);
  font-size: var(--text-label-sm);
  font-weight: 600;
}
.edit-field input,
.edit-field textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(255,255,255,0.1));
  background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 88%, transparent);
  color: var(--text-main);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}
.edit-field textarea {
  resize: vertical;
  min-height: 120px;
}
.edit-field input:focus,
.edit-field textarea:focus {
  border-color: color-mix(in srgb, var(--accent, #c39c76) 68%, var(--border) 32%);
}
.preview-list { display: grid; gap: 8px; }
.preview-item { display: grid; gap: 3px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--bg-muted, rgba(255,255,255,0.06)) 88%, transparent); border: 1px solid var(--border-soft, rgba(255,255,255,0.1)); }
.preview-item strong { color: var(--text-main); font-size: 13px; }
.preview-item span { color: var(--text-soft); font-size: var(--text-label-sm); line-break: anywhere; }
.summary { margin: 0; padding: 11px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent, #c39c76) 10%, var(--bg-muted, transparent)); color: var(--text-soft); font-size: 13px; }
.summary.success { color: #7dd3a7; }
.empty-text { margin: 0; color: var(--text-soft); font-size: var(--text-label-sm); }
.status.error { color: #ffb4b4; }
.status {
  margin: 0;
  color: var(--text-soft);
  font-size: 13px;
}
.match-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px 18px;
  border-top: 1px solid var(--border-soft, rgba(255,255,255,0.08));
}
.hint {
  color: var(--text-soft);
  font-size: var(--text-label-sm);
  line-height: 1.45;
}
.primary {
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: var(--accent, #c39c76);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (max-width: 720px) {
  .edit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
