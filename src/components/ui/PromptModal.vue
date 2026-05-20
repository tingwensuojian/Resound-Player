<template>
  <transition name="prompt-fade">
    <div v-if="open" class="prompt-backdrop" @click.self="handleCancel">
      <section class="prompt-shell" role="dialog" aria-modal="true">
        <header class="prompt-header">
          <h3 class="prompt-title">{{ title }}</h3>
          <button class="prompt-close" type="button" aria-label="关闭" @click="handleCancel">×</button>
        </header>
        <div class="prompt-body">
          <input
            ref="inputRef"
            v-model="inputValue"
            class="prompt-input"
            :placeholder="placeholder"
            @keydown.enter.prevent="handleConfirm"
            @keydown.esc.prevent="handleCancel"
          />
        </div>
        <footer class="prompt-footer">
          <button class="button-ghost" @click="handleCancel">取消</button>
          <button class="button-primary" :disabled="!inputValue.trim()" @click="handleConfirm">确定</button>
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
    title?: string
    placeholder?: string
    defaultValue?: string
  }>(),
  { title: '请输入', placeholder: '', defaultValue: '' },
)

const emit = defineEmits<{
  (e: 'confirm', value: string): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const inputValue = ref(props.defaultValue)

watch(() => props.open, (val) => {
  if (val) {
    inputValue.value = props.defaultValue
    nextTick(() => inputRef.value?.focus())
  }
})

function handleConfirm() {
  const val = inputValue.value.trim()
  if (!val) return
  emit('confirm', val)
  emit('update:open', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}
</script>

<style scoped>
.prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.prompt-shell {
  background: var(--bg-surface, #1c1c1e);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
  width: 380px;
  max-width: 90vw;
  overflow: hidden;
}
.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4, 16px) var(--space-4, 16px) 0;
}
.prompt-title {
  margin: 0;
  font-size: var(--text-body-md, 16px);
  font-weight: 600;
  color: var(--text-main, #e7e5e4);
}
.prompt-close {
  background: none;
  border: none;
  color: var(--text-soft, #93a5bb);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.prompt-body {
  padding: var(--space-4, 16px);
}
.prompt-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-md, 10px);
  background: var(--bg-muted, rgba(255,255,255,0.05));
  color: var(--text-main, #e7e5e4);
  font-size: var(--text-body-md, 16px);
  outline: none;
  transition: border-color 0.2s;
}
.prompt-input:focus {
  border-color: var(--accent, #4f9cf7);
}
.prompt-input::placeholder {
  color: var(--text-soft, #93a5bb);
}
.prompt-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px) var(--space-4, 16px);
}
.button-ghost {
  padding: 8px 16px;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--text-main, #e7e5e4);
  font-size: var(--text-body-sm, 14px);
  cursor: pointer;
  transition: background 0.2s;
}
.button-ghost:hover {
  background: var(--bg-muted, rgba(255,255,255,0.08));
}
.button-primary {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: var(--accent, #4f9cf7);
  color: #fff;
  font-size: var(--text-body-sm, 14px);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.button-primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.button-primary:not(:disabled):hover {
  opacity: 0.85;
}

.prompt-fade-enter-active,
.prompt-fade-leave-active {
  transition: opacity 0.2s ease;
}
.prompt-fade-enter-from,
.prompt-fade-leave-to {
  opacity: 0;
}
</style>