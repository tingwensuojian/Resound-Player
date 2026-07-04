<template>
  <div class="shortcut-setting-root">
    <!-- 冲突对话框 -->
    <Teleport to="body">
    <transition name="dialog-fade">
      <div v-if="conflictDialog.show" class="conflict-backdrop" @click.self="cancelConflict">
        <div class="conflict-dialog" role="dialog" aria-modal="true">
          <h3 class="conflict-title">快捷键冲突</h3>
          <p class="conflict-body">
            该快捷键组合已被「{{ conflictDialog.conflictName }}」使用，确定替换？
          </p>
          <div class="conflict-actions">
            <button class="conflict-btn ghost" @click="cancelConflict">取消</button>
            <button class="conflict-btn primary" @click="confirmConflict">替换</button>
          </div>
        </div>
      </div>
    </transition>
    </Teleport>

    <!-- 恢复默认确认 -->
    <Teleport to="body">
    <transition name="dialog-fade">
      <div v-if="showResetConfirm" class="conflict-backdrop" @click.self="showResetConfirm = false">
        <div class="conflict-dialog" role="dialog" aria-modal="true">
          <h3 class="conflict-title">确认重置</h3>
          <p class="conflict-body">将重置所有快捷键为系统默认值，确定继续？</p>
          <div class="conflict-actions">
            <button class="conflict-btn ghost" @click="showResetConfirm = false">取消</button>
            <button class="conflict-btn primary" @click="confirmReset">确定重置</button>
          </div>
        </div>
      </div>
    </transition>
    </Teleport>

    <!-- 快捷键表格 -->
    <div class="shortcut-table">
      <div class="st-header">
        <span class="st-hcol st-hcol-func">功能说明</span>
        <span class="st-hcol st-hcol-shortcut">应用内快捷键</span>
        <span class="st-hcol st-hcol-shortcut">全局快捷键</span>
      </div>

      <div
        v-for="actionId in actionOrder"
        :key="actionId"
        class="st-row"
      >
        <span class="st-cell st-cell-func">{{ store.state.shortcuts[actionId]?.name || '' }}</span>

        <div class="st-cell st-cell-shortcut">
          <ShortcutInput
            :modelValue="store.state.shortcuts[actionId]?.appShortcut ?? null"
            :platform="platformType"
            @update:modelValue="(c) => onShortcutChange(actionId, 'app', c)"
          />
        </div>

        <div class="st-cell st-cell-shortcut">
          <ShortcutInput
            :modelValue="store.state.shortcuts[actionId]?.globalShortcut ?? null"
            :platform="platformType"
            @update:modelValue="(c) => onShortcutChange(actionId, 'global', c)"
          />
        </div>
      </div>
    </div>

    <!-- 底部配置 -->
    <div class="shortcut-footer">
      <label class="footer-row">
        <div class="footer-label-wrap">
          <span class="footer-label">启用全局快捷键</span>
          <span class="footer-desc">Resound-Player 在后台时也能响应</span>
        </div>
        <div class="footer-control">
          <FancySwitch v-model="globalEnabled" @update:modelValue="onGlobalToggle" />
        </div>
      </label>
      <label class="footer-row">
        <div class="footer-label-wrap">
          <span class="footer-label">使用系统媒体快捷键</span>
          <span class="footer-desc">播放/暂停、上一首、下一首、停止</span>
        </div>
        <div class="footer-control">
          <FancySwitch v-model="mediaKeysEnabled" @update:modelValue="onMediaKeysToggle" />
        </div>
      </label>
    </div>

    <!-- 恢复默认按钮 -->
    <div class="shortcut-toolbar">
      <button class="reset-btn" @click="showResetConfirm = true">恢复默认</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useShortcutStore } from '../../stores/shortcutStore'
import { SHORTCUT_ACTION_ORDER, SHORTCUT_ACTION_NAMES } from '../../types/shortcut'
console.log('[ShortcutSetting] component init')
import { platform } from '../../utils/platform'
import type { PlatformType } from '../../types/shortcut'

/** macOS 显示符号，Windows 显示文本 */
const platformType: PlatformType = platform.isMacOS ? 'darwin' : 'win32' 
import type { ShortcutActionId, ShortcutCombo } from '../../types/shortcut'
import ShortcutInput from '../../components/ShortcutInput.vue'
import FancySwitch from '../../components/ui/FancySwitch.vue'

const store = useShortcutStore()
const actionOrder = SHORTCUT_ACTION_ORDER

// ── 开关状态绑定 ──
const globalEnabled = computed({
  get: () => store.state.globalEnabled,
  set: (v) => store.setGlobalEnabled(v),
})

const mediaKeysEnabled = computed({
  get: () => store.state.mediaKeysEnabled,
  set: (v) => store.setMediaKeysEnabled(v),
})

async function onGlobalToggle(v: boolean): Promise<void> {
  await store.setGlobalEnabled(v)
}

async function onMediaKeysToggle(v: boolean): Promise<void> {
  await store.setMediaKeysEnabled(v)
}

// ── 冲突检测 ──

interface PendingAction {
  actionId: ShortcutActionId
  type: 'app' | 'global'
  combo: ShortcutCombo | null
  previous: ShortcutCombo | null
}

const conflictDialog = reactive<{
  show: boolean
  conflictName: string
  pending: PendingAction | null
}>({
  show: false,
  conflictName: '',
  pending: null,
})

function onShortcutChange(actionId: ShortcutActionId, type: 'app' | 'global', combo: ShortcutCombo | null): void {
  // 获取修改前的值
  const item = store.state.shortcuts[actionId]
  if (!item) return
  const previous = type === 'app' ? item.appShortcut : item.globalShortcut

  // 检查冲突
  const conflictId = store.checkConflict(combo, type, actionId)
  if (conflictId) {
    conflictDialog.show = true
    conflictDialog.conflictName = SHORTCUT_ACTION_NAMES[conflictId] || conflictId
    conflictDialog.pending = { actionId, type, combo, previous }
    return
  }

  // 无冲突，直接保存
  store.saveShortcut(actionId, type, combo)
}

function confirmConflict(): void {
  if (!conflictDialog.pending) return
  const { actionId, type, combo } = conflictDialog.pending
  store.saveShortcut(actionId, type, combo)
  conflictDialog.show = false
  conflictDialog.pending = null
}

function cancelConflict(): void {
  if (!conflictDialog.pending) return
  // 回滚到之前的值
  const { actionId, type, previous } = conflictDialog.pending
  store.saveShortcut(actionId, type, previous)
  conflictDialog.show = false
  conflictDialog.pending = null
}

// ── 恢复默认 ──

const showResetConfirm = ref(false)

async function confirmReset(): Promise<void> {
  showResetConfirm.value = false
  await store.resetDefaults()
}

// ── 生命周期 ──

onMounted(() => {
  if (platform.isDesktop) {
  }
})

onUnmounted(() => {
})
</script>

<style scoped>
.shortcut-setting-root {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-1) 0;
}

/* ── 冲突/确认对话框 ── */
.conflict-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.conflict-dialog {
  background:
    radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 100%),
    radial-gradient(ellipse 60% 30% at 50% 100%, rgba(0,0,0,0.05) 0%, transparent 100%),
    color-mix(in srgb, var(--expanded-panel-bg, var(--bg-solid)) 80%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--expanded-line-muted, var(--border));
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  width: 360px;
  max-width: 90vw;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.conflict-title {
  margin: 0;
  font-size: var(--text-body-md);
  font-weight: 700;
  color: var(--text-main);
}

.conflict-body {
  margin: 0;
  font-size: var(--text-body-sm);
  color: var(--text-sub);
  line-height: 1.5;
}

.conflict-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.conflict-btn {
  height: 34px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-label-md);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  border: 1px solid var(--border);
}

.conflict-btn.ghost {
  background: transparent;
  color: var(--text-sub);
  border-color: var(--border);
}

.conflict-btn.ghost:hover {
  background: var(--bg-muted);
}

.conflict-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.conflict-btn.primary:hover {
  opacity: 0.85;
}

/* ── 快捷键表格 ── */
.shortcut-table {
  display: grid;
  grid-template-columns: 180px 1fr 1fr;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.st-header {
  display: contents;
}

.st-hcol {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 var(--space-3);
  font-size: var(--text-label-sm);
  font-weight: 600;
  color: var(--text-soft);
  background: var(--bg-muted);
  border-bottom: 1px solid var(--border);
}

.st-hcol-func {
  border-right: 1px solid var(--border);
}

.st-hcol-shortcut {
  border-right: 1px solid var(--border);
}

.st-hcol-shortcut:last-child {
  border-right: none;
}

.st-row {
  display: contents;
}

.st-cell {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 6px var(--space-3);
  border-bottom: 1px solid var(--border-soft);
}

.st-row:last-child .st-cell {
  border-bottom: none;
}

.st-cell-func {
  font-size: var(--text-label-md);
  font-weight: 500;
  color: var(--text-main);
  border-right: 1px solid var(--border);
}

.st-cell-shortcut {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-soft);
}

.st-cell-shortcut:last-child {
  border-right: none;
}

/* ── 底部配置 ── */
.shortcut-footer {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  overflow: hidden;
}

.footer-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  border-top: 1px solid var(--border-soft);
}

.footer-row:first-child {
  border-top: none;
}

.footer-label-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.footer-label {
  font-size: var(--text-label-md);
  font-weight: 600;
  color: var(--text-main);
}

.footer-desc {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
}

.footer-control {
  min-width: 120px;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* ── 工具栏 ── */
.shortcut-toolbar {
  display: flex;
  justify-content: flex-end;
}

.reset-btn {
  height: 34px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, #ef4444 30%, var(--border));
  background: color-mix(in srgb, #ef4444 10%, var(--bg-surface));
  color: color-mix(in srgb, #ef4444 80%, var(--text-main));
  font-size: var(--text-label-md);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.reset-btn:hover {
  opacity: 0.8;
}

/* ── 对话框动画 ── */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
