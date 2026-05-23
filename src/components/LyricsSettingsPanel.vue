<template>
  <Teleport to="body">
    <transition name="popover-fade">
      <div v-if="visible" class="popover-backdrop" @click="close" @touchstart.passive="close">
        <div class="settings-popover" :style="popoverStyle" @click.stop @touchstart.passive.stop>
          <header class="popover-head">
            <h3>歌词设置</h3>
            <button class="popover-close" type="button" @click="close" aria-label="关闭设置">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="tabs-nav">
            <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
          </div>
          <div class="popover-body">
            <div v-show="activeTab === 'display'" class="tab-content">
              <div class="radio-row">
                <span class="radio-label">播放器样式</span>
                <div class="radio-group">
                  <button v-for="opt in displayModeOptions" :key="opt.value" type="button" class="radio-chip" :class="{ active: s.displayMode === opt.value }" @click="setDisplayMode(opt.value)">{{ opt.label }}</button>
                </div>
              </div>
              <div class="sw-row"><span class="sw-label">隐藏封面</span><FancySwitch :model-value="!s.showCover" @update:model-value="setShowCover($event)" /></div>
              <div class="sw-row"><span class="sw-label">居中显示</span><FancySwitch :model-value="s.centerAlign" @update:model-value="set('centerAlign', $event)" /></div>
              <div class="sw-row"><span class="sw-label">隐藏歌词</span><FancySwitch :model-value="!s.showLyrics" @update:model-value="setShowLyrics($event)" /></div>
              <div class="sw-row"><span class="sw-label">播放栏切换</span><FancySwitch :model-value="s.showMiniBar" @update:model-value="set('showMiniBar', $event)" /></div>
              <div class="sw-row"><span class="sw-label">隐藏已播歌词</span><FancySwitch :model-value="s.hidePlayed" @update:model-value="set('hidePlayed', $event)" /></div>
              <div class="sw-row"><span class="sw-label">AMLL 歌词渲染</span><FancySwitch :model-value="s.useAmllRenderer" @update:model-value="set('useAmllRenderer', $event)" /></div>
              <p class="custom-hint">AMLL 渲染需要较高性能设备，可能影响续航与发热</p>
              <div class="sw-row"><span class="sw-label">歌词颜色跟随封面</span><FancySwitch :model-value="s.followCoverColor" @update:model-value="set('followCoverColor', $event)" /></div>
            </div>
            <div v-show="activeTab === 'interface'" class="tab-content">
            </div>
            <div v-show="activeTab === 'typography'" class="tab-content">
              <div class="sw-row"><span class="sw-label">暂停时点击跳转自动播放</span><FancySwitch :model-value="s.autoPlayOnSeek" @update:model-value="set('autoPlayOnSeek', $event)" /></div>
              <StepSliderRow label="字体大小" :value="s.fontSize" :steps="['小', '中', '大']" @update:value="set('fontSize', $event)" />
              <StepSliderRow label="字间距" :value="s.letterSpacing" :steps="['紧凑', '默认', '宽松']" @update:value="set('letterSpacing', $event)" />
              <StepSliderRow label="字体粗细" :value="s.fontWeight" :steps="['细', '常规', '粗']" @update:value="set('fontWeight', $event)" />
              <StepSliderRow label="行高" :value="s.lineHeight" :steps="['紧凑', '默认', '宽松']" @update:value="set('lineHeight', $event)" />
              <StepSliderRow label="高亮位置" :value="s.anchorPos" :min="0" :max="10" :step="1" :steps="['靠上', '', '', '', '中上', '居中', '中下', '', '', '', '靠下']" @update:value="set('anchorPos', $event)" />
            </div>
            <div v-show="activeTab === 'background'" class="tab-content">
              <div class="radio-row">
                <span class="radio-label">背景模式</span>
                <div class="radio-group">
                  <button v-for="opt in bgModeOptions" :key="opt.value" type="button" class="radio-chip" :class="{ active: localBgMode === opt.value }" @click="(localBgMode = opt.value), setBgMode(opt.value)">{{ opt.label }}</button>
                </div>
              </div>
              <template v-if="localBgMode === 'basic'"><RadioRow label="主题" :value="s.bgTheme" :options="bgThemeOptions" @update:value="set('bgTheme', $event)" /></template>
              <template v-else>
                <RadioRow label="类型" :value="s.bgCustomMode" :options="bgCustomModeOptions" @update:value="setBgCustomMode($event)" />
                <p class="custom-hint">自定义背景需要较高性能设备，可能影响续航与发热</p>
                <template v-if="s.bgCustomMode === 'iridescence'">
                  <div v-for="(label, i) in ['主色', '辅色', '点缀']" :key="i" class="color-row">
                    <label class="color-label">{{ label }}</label>
                    <div class="color-control">
                      <input type="color" :value="s.iriColors[i] || '#3A29FF'" @input="updateIriColor(i, ($event.target as HTMLInputElement).value)" class="color-picker" />
                      <input type="text" :value="s.iriColors[i] || '#3A29FF'" class="color-text" @input="updateIriColor(i, ($event.target as HTMLInputElement).value)" />
                    </div>
                  </div>
                  <StepSliderRow label="流速" :value="s.iriSpeed" :min="0" :max="10" :step="1" :steps="['慢', '', '中', '', '快']" @update:value="set('iriSpeed', $event)" />
                  <StepSliderRow label="强度" :value="s.iriScale" :min="0" :max="10" :step="1" :steps="['弱', '', '中', '', '强']" @update:value="set('iriScale', $event)" />
                  <StepSliderRow label="模糊" :value="s.iriBlur" :min="0" :max="10" :step="1" :steps="['无', '微', '', '中', '', '强']" @update:value="set('iriBlur', $event)" />
                </template>
              </template>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
import FancySwitch from './ui/FancySwitch.vue';
import StepSliderRow from './ui/StepSliderRow.vue';
import RadioRow from './ui/RadioRow.vue';

const props = defineProps<{ visible: boolean; anchor?: { top: number; right: number }; accentColor?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
function close() { emit('close'); }

const s = lyricsSettings.state;
function set(key: string, value: any) { (s as any)[key] = value; lyricsSettings.save(); }

// 本地驱动状态 — 绕过 Teleport 下 reactive proxy 依赖追踪失效的问题
const localBgMode = ref(s.bgMode);
function setBgMode(v: string) { s.bgMode = v; lyricsSettings.save(); }
const localBgCustomMode = ref(s.bgCustomMode);
function setBgCustomMode(v: string) { s.bgCustomMode = v as any as any; lyricsSettings.save(); localBgCustomMode.value = v; }
function setShowCover(v: boolean) { s.showCover = !v; if (v) { s.showLyrics = true; s.showMiniBar = true; } lyricsSettings.save(); }
function setShowLyrics(v: boolean) { s.showLyrics = !v; if (v) s.showCover = true; lyricsSettings.save(); }

const displayModeOptions = [
  { value: 'cover', label: '封面模式' },
  { value: 'record', label: '唱片模式' },
  { value: 'fullscreen', label: '全屏封面' },
];
function setDisplayMode(v: string) { s.displayMode = v as any; lyricsSettings.save(); }

const popoverStyle = computed(() => {
  const a = props.anchor || { top: 80, right: 24 };
  const popoverWidth = 380;
  const estimatedHeight = Math.min(window.innerHeight * 0.8, 600);
  const style: Record<string, string> = {};

  // Vertical: prefer below, flip above if not enough space
  const spaceAbove = a.top;
  const spaceBelow = window.innerHeight - a.top;
  if (spaceBelow >= estimatedHeight + 20 || spaceBelow >= spaceAbove) {
    style.top = `${a.top}px`;
  } else {
    style.bottom = `${window.innerHeight - a.top}px`;
  }

  // Horizontal: prevent right edge overflow
  if (a.right + popoverWidth > window.innerWidth) {
    style.right = `${Math.max(8, window.innerWidth - popoverWidth - 8)}px`;
  } else {
    style.right = `${a.right}px`;
  }

  if (props.accentColor) style['--accent'] = props.accentColor;
  return style;
});

const activeTab = ref('display');
const tabs = [
  { key: 'display', label: '显示' },
  { key: 'typography', label: '歌词' },
  { key: 'background', label: '背景' },
];
const bgModeOptions = [
  { value: 'basic', label: '基础模式' },
  { value: 'custom', label: '自定义模式' },
];
const bgThemeOptions = [
  { value: 'default', label: '默认' },
];
const bgCustomModeOptions = [
  { value: 'iridescence', label: '虹彩' },
  { value: 'soft-gradient', label: '柔光渐变' },
  { value: 'three-scene', label: '3D 光晕' },
  { value: 'paper-shaders', label: '纹理波动' },
  { value: 'mist', label: '雾霭' },
  { value: 'digital-loom', label: '数码织机' },
  { value: 'silk', label: '丝绸' },
  { value: 'aurora', label: '极光' },
  { value: 'amll-fluid', label: 'AMLL 流体' },
];

function updateIriColor(idx: number, val: string) {
  const colors = [...s.iriColors];
  colors[idx] = val;
  s.iriColors = colors;
  lyricsSettings.save();
}
</script>

<style scoped>
.popover-backdrop { position: fixed; inset: 0; z-index: 100; background: transparent; }
.settings-popover {
  position: fixed; width: 380px; max-height: min(80vh, 600px); height: auto;
  background: var(--bg-solid, rgba(26,28,40,0.97));
  backdrop-filter: blur(12px) saturate(120%);
  -webkit-backdrop-filter: blur(12px) saturate(120%);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-lg, 14px);
  display: grid; grid-template-rows: auto auto 1fr;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  overflow: hidden;
  transform-origin: right center;
}
.popover-head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-soft, rgba(255,255,255,0.06)); }
.popover-head h3 { margin: 0; color: var(--text-main,#fff); font-size: 15px; font-weight: 700; }
.popover-close { width: 28px; height: 28px; border: none; background: transparent; color: var(--text-soft, rgba(255,255,255,0.5)); cursor: pointer; display: grid; place-items: center; border-radius: var(--radius-sm,6px); transition: color 120ms ease, background 120ms ease; }
.popover-close:hover { color: var(--text-main,#fff); background: var(--control-hover, rgba(255,255,255,0.08)); }
.tabs-nav { display: flex; gap: 0; padding: var(--space-2) var(--space-4) 0; border-bottom: 1px solid var(--border-soft, rgba(255,255,255,0.06)); }
.tab-btn { flex: 1; padding: 6px 0 8px; border: none; border-bottom: 2px solid transparent; background: transparent; color: var(--text-soft, rgba(255,255,255,0.45)); font-size: var(--text-label-sm); font-weight: 600; cursor: pointer; transition: color 120ms ease, border-color 120ms ease; }
.tab-btn.active { color: var(--accent) !important; }
.tab-btn:hover:not(.active) { color: var(--text-sub, rgba(255,255,255,0.7)); }
.popover-body { overflow-y: auto; padding: var(--space-3) var(--space-4) var(--space-4); }
.tab-content { display: grid; gap: var(--space-3); }
.sw-row { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }
.sw-label { color: var(--text-main, rgba(255,255,255,0.82)); font-size: 13px; }
.slider-row { display: grid; gap: var(--space-1); }
.slider-label { color: var(--text-main, rgba(255,255,255,0.82)); font-size: 13px; }
.slider-control { display: flex; align-items: center; gap: var(--space-2); }
.slider-control input[type='range'] { flex: 1; accent-color: var(--accent, #c39c76); }
.slider-value { color: var(--text-soft, rgba(255,255,255,0.5)); font-size: var(--text-label-xs); min-width: 32px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.color-row { display: grid; gap: var(--space-1); }
.color-label { color: var(--text-main, rgba(255,255,255,0.82)); font-size: 13px; }
.color-control { display: flex; align-items: center; gap: var(--space-2); }
.color-picker { width: 32px; height: 32px; border: 1px solid var(--border-soft, rgba(255,255,255,0.1)); border-radius: var(--radius-sm,6px); cursor: pointer; padding: 0; background: none; }
.color-text { flex: 1; background: var(--bg-muted, rgba(255,255,255,0.06)); border: 1px solid var(--border-soft, rgba(255,255,255,0.1)); border-radius: var(--radius-sm,6px); padding: 5px 8px; color: var(--text-main, rgba(255,255,255,0.8)); font-size: var(--text-label-sm); font-family: var(--font-mono,'SF Mono','Fira Code',monospace); outline: none; transition: border-color 120ms ease; }
.color-text:focus { border-color: var(--accent, #c39c76); }
.popover-fade-enter-active, .popover-fade-leave-active { transition: opacity 0.15s ease; }
.popover-fade-enter-from, .popover-fade-leave-to { opacity: 0; }
/* 内联 radio-chip 样式，与 RadioRow 组件保持一致 */
.radio-row { display: grid; gap: var(--space-1, 4px); }
.radio-group { display: flex; flex-wrap: wrap; gap: var(--space-1, 4px); }
.radio-chip {
  padding: 5px 14px; border-radius: var(--button-radius-pill, 999px);
  border: 1px solid var(--border-soft, rgba(255,255,255,0.12));
  background: transparent; color: var(--text-soft, rgba(255,255,255,0.7));
  font-size: var(--text-label-sm); font-weight: 600; cursor: pointer;
  transition: all 120ms ease;
}
.radio-chip.active {
  background: color-mix(in srgb, var(--accent) 88%, var(--bg-surface));
  border-color: transparent; color: #fff;
}
.radio-chip:hover:not(.active) {
  border-color: var(--border, rgba(255,255,255,0.3));
  color: var(--text-main, #fff);
}
.custom-hint { color: var(--text-soft, rgba(255,255,255,0.4)); font-size: var(--text-label-xs); line-height: 1.4; margin: 0; padding: 2px 0; }
</style>
