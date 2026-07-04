<template>
  <div
    class="shortcut-input"
    :class="{
      recording,
      'has-value': !!modelValue,
      'is-empty': !modelValue && !recording,
      conflict,
    }"
    @click="focusInput"
  >
    <input
      ref="inputRef"
      class="shortcut-input-field"
      :value="displayText"
      :placeholder="placeholder"
      readonly
      :disabled="disabled"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      aria-label="快捷键录入"
    />
    <button
      v-if="modelValue && !recording && !disabled"
      class="shortcut-clear-btn"
      @mousedown.prevent="clear"
      tabindex="-1"
      aria-label="清除快捷键"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PlatformType, ShortcutCombo } from '../types/shortcut'
import { formatShortcut, eventToShortcutCombo } from '../utils/shortcutPlatformUtil'

console.log('[ShortcutInput] component init')
const props = withDefaults(defineProps<{
  modelValue: ShortcutCombo | null
  platform?: PlatformType
  disabled?: boolean
  conflict?: boolean
}>(), {
  platform: 'darwin' as PlatformType,
  disabled: false,
  conflict: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: ShortcutCombo | null]
  conflict: [actionId: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const recording = ref(false)
/** 进入录制前的值，供 Escape 取消时恢复 */
const pendingReset = ref<ShortcutCombo | null>(null)

const displayText = computed(() => {
  if (recording.value) return ''
  return formatShortcut(props.modelValue, props.platform)
})

const placeholder = computed(() => {
  if (recording.value) return '按下快捷键...'
  return '-'
})

function focusInput(): void {
  if (!props.disabled) {
    inputRef.value?.focus()
  }
}

function onFocus(): void {
  if (props.disabled) return
  recording.value = true
  pendingReset.value = props.modelValue
}

function onBlur(): void {
  recording.value = false
  pendingReset.value = null
}

function onKeydown(event: KeyboardEvent): void {
  console.log('[ShortcutInput] onKeydown', event.code, 'recording=', recording.value)
  if (!recording.value) return

  event.preventDefault()
  event.stopPropagation()

  const key = event.key

  // Escape → 取消录制，恢复旧值
  if (key === 'Escape') {
    recording.value = false
    emit('update:modelValue', pendingReset.value)
    inputRef.value?.blur()
    return
  }

  // Backspace/Delete → 清空
  if (key === 'Backspace' || key === 'Delete') {
    recording.value = false
    emit('update:modelValue', null)
    inputRef.value?.blur()
    return
  }

  // Tab → 保持录制，不处理
  if (key === 'Tab') return

  // 纯修饰键 → 等待下一个按键
  if (['Alt', 'Control', 'Meta', 'Shift'].includes(key)) return

  // 有效快捷键组合 → 录制完成
  const combo = eventToShortcutCombo(event.code, event.altKey, event.ctrlKey, event.metaKey, event.shiftKey)
  recording.value = false
  emit('update:modelValue', combo)
  inputRef.value?.blur()
}

function clear(): void {
  recording.value = false
  emit('update:modelValue', null)
  pendingReset.value = null
}
</script>

<style scoped>
.shortcut-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  max-width: 200px;
}


.shortcut-input-field {
  width: 100%;
  height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-muted);
  color: var(--text-main);
  font-size: 16px;
  font-family: -apple-system, 'SF Pro Text', 'PingFang SC', sans-serif;
  text-align: center;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}

.shortcut-input-field::placeholder {
  color: var(--text-soft);
  font-family: -apple-system, 'SF Pro Text', 'PingFang SC', sans-serif;
}

/* 空值红色边框 */
.is-empty .shortcut-input-field {
  border-color: color-mix(in srgb, var(--danger, #ef4444) 50%, var(--border));
}

/* 录制模式高亮 */
.recording .shortcut-input-field {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-muted));
}

/* 有值态 */
.has-value .shortcut-input-field {
  border-color: var(--border);
}

/* hover */
.shortcut-input-field:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
}

/* disabled */
.shortcut-input-field:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.shortcut-clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  color: var(--text-sub);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.shortcut-clear-btn:hover {
  background: color-mix(in srgb, var(--border) 80%, transparent);
  color: var(--text-main);
}

.conflict .shortcut-input-field {
  border-color: var(--danger) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 15%, transparent);
}

</style>
