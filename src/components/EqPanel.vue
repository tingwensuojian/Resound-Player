<template>
  <Teleport to="body">
    <transition name="popover-fade">
      <div v-if="visible" class="eq-mask" @click="close" @touchstart.passive="close">
        <div class="eq-panel" :style="panelStyle" @click.stop @touchstart.passive.stop>
          <header class="eq-head">
            <div class="eq-head-left">
              <h3>均衡器</h3>
              <FancySwitch :model-value="eq.enabled" @update:model-value="toggleEq" />
            </div>
            <button class="eq-close" type="button" @click="close" aria-label="关闭均衡器">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          <!-- 预设选择 -->
          <HorizontalScrollRail content-layout="flex" content-class="preset-rail" :hide-controls-on-mobile="false">
            <button
              v-for="p in presets"
              :key="p.name"
              type="button"
              class="preset-chip"
              :class="{
                active: eq.currentPreset === p.name,
                'preset-chip--custom': eq.isCustomPreset(p.name),
              }"
              @click="selectPreset(p)"
            >{{ p.name }}</button>
          </HorizontalScrollRail>

          <!-- 10 段均衡滑块 -->
          <div class="eq-bands">
            <div v-for="(freq, i) in freqLabels" :key="freq" class="eq-band-col">
              <div class="eq-slider-wrap">
                <input
                  type="range"
                  class="eq-slider"
                  :min="-12"
                  :max="12"
                  :step="0.5"
                  :value="eq.gains[i]"
                  :disabled="!eq.enabled"
                  @input="onBandInput(i, $event)"
                />
              </div>
              <div class="eq-db-value">{{ eq.gains[i] > 0 ? '+' : '' }}{{ eq.gains[i].toFixed(1) }} dB</div>
              <div class="eq-freq-label">{{ freq }} Hz</div>
            </div>
          </div>

          <div v-if="isSaveEditorOpen" class="eq-save-row">
            <input
              v-model.trim="saveDraftName"
              class="eq-save-input"
              type="text"
              maxlength="24"
              placeholder="输入预设名称"
              @keydown.enter="confirmSavePreset"
              @keydown.esc="cancelSavePreset"
            />
            <button class="eq-action button-surface" type="button" @click="confirmSavePreset">保存</button>
            <button class="eq-action button-surface" type="button" @click="cancelSavePreset">取消</button>
            <p v-if="saveError" class="eq-save-error">{{ saveError }}</p>
          </div>

          <div class="eq-footer ui-safe-group">
            <button class="eq-action button-surface" type="button" :disabled="!eq.enabled" @click="openSavePreset">保存预设</button>
            <button
              v-if="isSelectedCustomPreset"
              class="eq-action button-surface"
              type="button"
              :disabled="!eq.enabled"
              @click="overwritePreset"
            >覆盖</button>
            <button
              v-if="isSelectedCustomPreset"
              class="eq-action button-surface button-surface--danger"
              type="button"
              @click="deletePreset"
            >删除</button>
            <button class="eq-reset button-surface" type="button" :disabled="!eq.enabled" @click="resetGains">重置</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { eqSettings, EQ_FREQ_LABELS, type EqPreset } from '../stores/eqSettings';
import { playerStore } from '../stores/player';
import FancySwitch from './ui/FancySwitch.vue';
import HorizontalScrollRail from './ui/HorizontalScrollRail.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const eq = eqSettings;
const presets = computed(() => eq.getAllPresets());
const freqLabels = EQ_FREQ_LABELS;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const isSelectedCustomPreset = computed(() => eq.isCustomPreset(eq.currentPreset));
const isSaveEditorOpen = ref(false);
const saveDraftName = ref('');
const saveError = ref('');

function close() { emit('close'); }

const panelStyle = computed(() => {
  const panelWidth = 480;
  const panelHeight = 400;
  const style: Record<string, string> = {
    position: 'fixed',
    left: '50%',
    top: '50%',
    width: `${panelWidth}px`,
    transform: 'translate(-50%, -50%)',
  };
  // 避免溢出
  if (panelWidth > window.innerWidth - 32) {
    style.left = '16px';
    style.width = `${window.innerWidth - 32}px`;
    style.transform = '';
  }
  return style;
});

function toggleEq(value: boolean) {
  eq.enabled = value;
  playerStore.enableEq(value);
  eq.save();
}

function selectPreset(preset: EqPreset) {
  eq.currentPreset = preset.name;
  eq.gains = [...preset.gains];
  eq.save();
  if (eq.enabled) {
    playerStore.setEqGains(eq.gains);
  }
}

function onBandInput(index: number, event: Event) {
  const val = Number((event.target as HTMLInputElement).value);
  eq.gains[index] = val;
  if (!isSelectedCustomPreset.value) {
    eq.currentPreset = '自定义';
  }
  if (eq.enabled) {
    playerStore.setEqGains(eq.gains);
  }
  // 拖拽停止后再持久化，避免连续 input 频繁写 localStorage。
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => eq.save(), 300);
}

function openSavePreset() {
  saveDraftName.value = isSelectedCustomPreset.value ? eq.currentPreset : '';
  saveError.value = '';
  isSaveEditorOpen.value = true;
}

function cancelSavePreset() {
  isSaveEditorOpen.value = false;
  saveDraftName.value = '';
  saveError.value = '';
}

function confirmSavePreset() {
  const result = eq.upsertCustomPreset(saveDraftName.value);
  if (!result.ok) {
    saveError.value = result.reason || '保存失败';
    return;
  }
  cancelSavePreset();
}

function overwritePreset() {
  if (!isSelectedCustomPreset.value) return;
  eq.upsertCustomPreset(eq.currentPreset);
}

function deletePreset() {
  if (!isSelectedCustomPreset.value) return;
  eq.removeCustomPreset(eq.currentPreset);
}

function resetGains() {
  const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  eq.gains = flat;
  eq.currentPreset = '原声';
  eq.save();
  if (eq.enabled) {
    playerStore.setEqGains(eq.gains);
  }
}
</script>

<style scoped>
.eq-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: transparent;
}
.eq-panel {
  background:
    radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 100%),
    radial-gradient(ellipse 60% 30% at 50% 100%, rgba(0,0,0,0.05) 0%, transparent 100%),
    color-mix(in srgb, var(--expanded-panel-bg, var(--bg-solid)) 80%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--expanded-line-muted, var(--border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  max-height: min(85vh, 520px);
  overflow: hidden;
  transform-origin: center center;
}
.eq-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-soft);
}
.eq-head-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.eq-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.eq-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm, 6px);
  transition: color 120ms ease, background 120ms ease;
}
.eq-close:hover {
  color: var(--text-main);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-solid));
}
.preset-rail {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-soft);
}
.preset-chip {
  flex-shrink: 0;
  padding: 4px 14px;
  border-radius: var(--button-radius-pill, 999px);
  border: 1px solid var(--button-surface-border);
  background: var(--button-surface-bg);
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 120ms ease;
}
.preset-chip:hover {
  background: var(--button-surface-hover-bg);
  border-color: var(--button-surface-hover-border);
  color: var(--text-main);
}
.preset-chip.active {
  background: var(--theme-primary-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
}
.eq-bands {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: var(--space-3) var(--space-4);
  overflow-y: auto;
  min-height: 0;
}
.eq-band-col {
  flex: 1;
  display: grid;
  grid-template-rows: 1fr auto auto;
  align-items: center;
  justify-items: center;
  gap: 4px;
  min-width: 0;
}
.eq-slider-wrap {
  display: grid;
  place-items: center;
  height: 180px;
  width: 100%;
  position: relative;
}
.eq-slider {
  -webkit-appearance: none;
  appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 100%;
  height: 100%;
  background: transparent !important;
  cursor: pointer;
  margin: 0;
  padding: 0;
}
.eq-slider:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.eq-slider::-webkit-slider-runnable-track {
  width: 4px;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 28%, var(--bg-muted));
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-soft));
}
.eq-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-solid);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent), 0 2px 6px rgba(0, 0, 0, 0.2);
  margin-left: -6px;
}
.eq-slider::-moz-range-track {
  width: 4px;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 28%, var(--bg-muted));
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-soft));
}
.eq-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-solid);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent), 0 2px 6px rgba(0, 0, 0, 0.2);
}
.eq-db-value {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-soft);
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 1;
  min-height: 14px;
}
.eq-freq-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-soft);
  text-align: center;
  line-height: 1;
  white-space: nowrap;
}
.eq-save-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) 0;
  border-top: 1px solid var(--border-soft);
}
.eq-save-input {
  min-width: 0;
  height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--button-surface-border);
  border-radius: var(--button-radius-pill, 999px);
  background: var(--bg-solid);
  color: var(--text-main);
  font-size: var(--text-label-sm);
  outline: none;
}
.eq-save-input:focus {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}
.eq-save-error {
  grid-column: 1 / -1;
  margin: -2px 0 0;
  color: var(--danger, #ef4444);
  font-size: var(--text-label-xs);
  font-weight: 600;
}
.eq-footer {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) var(--space-3);
  border-top: 1px solid var(--border-soft);
}
.eq-action,
.eq-reset {
  min-height: 28px;
  padding: 5px 16px;
  font-size: var(--text-label-sm);
  font-weight: 600;
  border-radius: var(--button-radius-pill, 999px);
}
.eq-action:disabled,
.eq-reset:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease;
}
.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
}
</style>