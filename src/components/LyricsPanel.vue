<template>
  <div
    class="right-zone"
    :class="{
      'l-center': lyricsSettings.state.centerAlign,
      'l-no-cover': !lyricsSettings.state.showCover,
      'l-hidden': !lyricsSettings.state.showLyrics,
      'l-record': vinylMode,
      'l-fullscreen': fullscreen,
    }"
    :style="[lyricVars, zoneStyle]"
    @wheel.passive="onLyricScroll"
    @touchmove.passive="onLyricScroll"
    @mouseenter="onZoneEnter"
    @mouseleave="onZoneLeave"
  >
    <!-- 隐藏歌词时：空占位 -->
    <template v-if="!lyricsSettings.state.showLyrics">
      <div v-if="lyricsSettings.state.useAmllRenderer" class="amll-status" />
    </template>
    <!-- 显示歌词时 -->
    <template v-else>
      <!-- 加载中 / 暂无歌词：统一状态 -->
      <div v-if="isLoading" class="amll-status">歌词加载中...</div>
      <div v-else-if="!lyricLines.length && podcastDescription" class="podcast-desc" v-html="podcastDescriptionHtml" @click="onPodcastDescClick"></div>
      <div v-else-if="!lyricLines.length" class="amll-status">暂无歌词</div>
      <!-- 有歌词数据：双渲染器层叠，v-show 保持两个组件始终挂载 -->
      <div v-else class="renderer-stack">
        <div v-if="lyricsSettings.state.useAmllRenderer" class="renderer-layer">
          <LyricPlayer
            ref="amllPlayerCompRef"
            :lyricLines="amllLines"
            :currentTime="amllCurrentTime"
            :alignAnchor="amllAnchor.anchor"
            :alignPosition="amllAnchor.position"
            :hidePassedLines="lyricsSettings.state.hidePlayed"
            :enableBlur="true"
            :enableScale="true"
            :enableSpring="true"
            :wordFadeWidth="0.5"
            class="amll-player"
            @lineClick="onAmllLineClick"
          />
        </div>
        <div v-show="!lyricsSettings.state.useAmllRenderer" class="renderer-layer">
          <div ref="lyricBoxRef" class="lyric-box" :style="lyricBoxStyle" @scroll.passive="onLyricScroll">
            <div v-for="(line, idx) in lyricLines" :key="`${idx}-${line.time}`" :ref="(el) => setLyricLineRef(el, idx)" class="line-wrap" :class="{ active: idx === currentLyricIndex, 'hide-played': lyricsSettings.state.hidePlayed && idx < currentLyricIndex }" :style="lineWrapStyle(idx, currentLyricIndex)" @click="seekToLine(idx)">
              <p class="line" :class="{ active: idx === currentLyricIndex, passed: idx < currentLyricIndex }" :style="lineStyle(idx, line)">
                <template v-if="line.words && line.words.length">
                  <span v-for="(word, wIdx) in line.words" :key="`${idx}-${wIdx}`" class="word" :style="getWordStyle(idx, word, currentLyricIndex, effectiveTime, lyricColorOpts)">{{ word.text }}<span v-if="word.space">&nbsp;</span></span>
                </template>
                <template v-else>{{ line.text || '...' }}</template>
              </p>
              <p v-if="line.translation && lyricsSettings.state.showTranslation" class="line-sub" :class="{ active: idx === currentLyricIndex, passed: idx < currentLyricIndex }" :style="translationStyle(idx, line)">{{ line.translation }}</p>
              <p v-if="line.romalrc && lyricsSettings.state.showRomalrc" class="line-sub line-roma" :class="{ active: idx === currentLyricIndex, passed: idx < currentLyricIndex }" :style="translationStyle(idx, line)">{{ line.romalrc }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { getTrackPlaybackKey, usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
import { useLyrics, getLineWrapStyle, getLineStyle, getWordStyle, getTranslationStyle, getAnchorRatio } from '../composables/useLyrics';
import { convertToAmmlLyrics, mapAnchorPos } from '../composables/useAmllAdapter';

const LyricPlayer = defineAsyncComponent({
  loader: async () => {
    await import('@applemusic-like-lyrics/core/style.css');
    const mod = await import('@applemusic-like-lyrics/vue');
    return mod.LyricPlayer;
  },
});

const props = defineProps<{
  vinylMode?: boolean;
  fullscreen?: boolean;
  accentColor?: string;
}>();
const lyricColorOpts = computed(() => {
  if (!lyricsSettings.state.followCoverColor || !props.accentColor) return {};
  const accent = props.accentColor;
  return {
    baseColor: accent.replace('rgb', 'rgba').replace(')', ',0.35)'),
    activeColor: accent,
  };
});

const { lyricLines, currentLyricIndex, displayTime, effectiveTime, isLoading, lyricBoxRef, setLyricLineRef, startTick, loadLyrics, scrollToCurrentLine, seekToLine: origSeekToLine } = useLyrics();

const fontSizeMap = ['20px','22px','24px','26px','28px','30px','32px','34px','36px','38px','40px'];
const letterSpacingMap = ['-0.03em','-0.02em','-0.01em','0','0.01em','0.02em','0.03em','0.04em','0.05em','0.06em','0.08em'];
const fontWeightMap = ['300','400','500','600','700','800','900','950','950','950','950'];
const lineHeightMap = ['1.1','1.15','1.2','1.25','1.28','1.32','1.36','1.4','1.45','1.5','1.6'];

/* 播客动态歌词区显示的简介 */
const isCurrentPodcast = computed(() => playerStore.state.currentTrack?.source === 'podcast');
const podcastDescription = computed(() => {
  if (!isCurrentPodcast.value) return '';
  return playerStore.state.currentTrack?.description || '';
});

/** 将简介文本中的时间标签（MM:SS / H:MM:SS）替换为可点击 span */
const timestampRe = /(\b\d{1,2}:\d{2})(?::(\d{2}))?\b/g;
function parseTimestampToSeconds(text: string): number {
  // text 可能是 "MM:SS" 或 "H:MM:SS"
  const parts = text.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
const podcastDescriptionHtml = computed(() => {
  const desc = podcastDescription.value;
  if (!desc) return '';
  // HTML-escape 原始文本，再对时间戳做替换
  const escaped = desc
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped.replace(timestampRe, (match) => {
    const sec = parseTimestampToSeconds(match);
    return `<span class="podcast-ts" data-sec="${sec}">${match}</span>`;
  });
});

function onPodcastDescClick(e: MouseEvent) {
  const target = (e.target as HTMLElement)?.closest?.('.podcast-ts');
  if (!target) return;
  const sec = Number(target.getAttribute('data-sec'));
  if (isNaN(sec) || sec < 0) return;
  playerStore.seek(sec);
  // 如果处于暂停状态则自动恢复播放
  if (!playerStore.state.isPlaying) {
    nextTick(() => playerStore.togglePlay());
  }
}

const lyricVars = computed(() => {
  const fs = fontSizeMap[lyricsSettings.state.fontSize] || fontSizeMap[1];
  const ls = letterSpacingMap[lyricsSettings.state.letterSpacing] || letterSpacingMap[1];
  const fw = fontWeightMap[lyricsSettings.state.fontWeight] || fontWeightMap[4];
  const lh = lineHeightMap[lyricsSettings.state.lineHeight] || lineHeightMap[4];
  const amllColor = lyricColorOpts.value.activeColor;
  return {
    // CSS 变量：自定义渲染器通过 var() 读取
    '--l-font-size': fs,
    '--l-letter-spacing': ls,
    '--l-font-weight': fw,
    '--l-line-height': lh,
    // AMLL 专属 CSS 变量
    '--amll-lp-font-size': fs,
    '--amll-lp-color': amllColor || 'white',
    // 实际 CSS 属性：两个渲染器均通过继承 + getComputedStyle() 读取
    'font-size': fs,
    'letter-spacing': ls,
    'font-weight': fw,
    'line-height': lh,
  };
});

const zoneStyle = computed(() => ({
  boxSizing: 'border-box',
  transform: `translateX(${lyricsSettings.state.lyricOffsetX}%)`,
}));

const lyricBoxStyle = computed(() => {
  const ratio = getAnchorRatio(lyricsSettings.state.anchorPos);
  const topPad = lyricsSettings.state.showCover && lyricsSettings.state.displayMode !== 'fullscreen' ? '42%' : '0';
  return { paddingTop: topPad, paddingBottom: `calc(${ratio * 100}vh - 80px)` };
});

/* 鼠标悬停或滚动时取消 blur/opacity */
const isHovering = ref(false);

/* 点击行跳转后立即退出浏览模式 */
function seekToLine(idx: number) {
  isUserScrolling.value = false;
  if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
  origSeekToLine(idx);
  // 暂停状态时点击跳转后自动恢复播放
  if (lyricsSettings.state.autoPlayOnSeek && !playerStore.state.isPlaying) {
    nextTick(() => playerStore.togglePlay());
  }
}

function onZoneEnter() {
  isHovering.value = true;
}
function onZoneLeave() {
  isHovering.value = false;
  // 鼠标离开时立即恢复跟随，不等 3s 计时器
  isUserScrolling.value = false;
  if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
  nextTick(() => scrollToCurrentLine('smooth'));
}

function lineWrapStyle(idx: number, currentIdx: number) {
  if (isHovering.value || isUserScrolling.value) return {};
  return getLineWrapStyle(idx, currentIdx);
}

function lineStyle(idx: number, line: any) {
  const next = lyricLines.value[idx + 1];
  return getLineStyle(idx, line, currentLyricIndex.value, effectiveTime.value, next, lyricColorOpts.value);
}
function translationStyle(idx: number, line: any) {
  const next = lyricLines.value[idx + 1];
  return getTranslationStyle(idx, line, currentLyricIndex.value, effectiveTime.value, next, lyricColorOpts.value);
}

/* ---- AMLL 相关 ---- */
const amllLines = computed(() => convertToAmmlLyrics(lyricLines.value));
const amllCurrentTime = computed(() => Math.round(effectiveTime.value * 1000));
const amllAnchor = computed(() => mapAnchorPos(lyricsSettings.state.anchorPos));

function onAmllLineClick(ev: any) {
  // ev.detail.lineIndex 包含被点击的行索引
  const idx = ev?.detail?.lineIndex ?? ev?.lineIndex;
  if (typeof idx === 'number' && idx >= 0) seekToLine(idx);
}

const amllPlayerCompRef = ref<any>(null);
watch(() => lyricsSettings.state.useAmllRenderer, (useAmll) => {
  if (!useAmll || !lyricLines.value.length) return;
  nextTick(() => {
    amllPlayerCompRef.value?.lyricPlayer?.setCurrentTime(amllCurrentTime.value, true);
  });
});

/* ---- AMLL hidePassedLines 补丁：翻译/音译子行同步隐藏 ---- */
// AMLL 的 hidePassedLines 只设置 mainLine (children[0]) 的 opacity，
// 不处理 subLine (children[1]/[2]，翻译/音译)，需手动同步。
let amllSubLineRaf: number | null = null;

function syncAmllSubLines() {
  if (!lyricsSettings.state.hidePlayed || !lyricsSettings.state.useAmllRenderer) {
    amllSubLineRaf = null;
    return;
  }
  const player = amllPlayerCompRef.value?.lyricPlayer;
  if (player?.currentLyricLineObjects) {
    const currentIdx = player.scrollToIndex;
    for (let i = 0; i < player.currentLyricLineObjects.length; i++) {
      const line = player.currentLyricLineObjects[i];
      if (!line?.element?.children) continue;
      const shouldHide = i < currentIdx;
      for (let j = 1; j < line.element.children.length; j++) {
        const child = line.element.children[j] as HTMLElement;
        if (child.style.opacity !== (shouldHide ? '0' : '')) {
          child.style.opacity = shouldHide ? '0' : '';
        }
      }
    }
  }
  amllSubLineRaf = requestAnimationFrame(syncAmllSubLines);
}

function resetAmllSubLines() {
  const player = amllPlayerCompRef.value?.lyricPlayer;
  if (!player?.currentLyricLineObjects) return;
  for (const line of player.currentLyricLineObjects) {
    if (!line?.element?.children) continue;
    for (let j = 1; j < line.element.children.length; j++) {
      (line.element.children[j] as HTMLElement).style.opacity = '';
    }
  }
}

watch([() => lyricsSettings.state.hidePlayed, () => lyricsSettings.state.useAmllRenderer], ([hide, useAmll]) => {
  if (hide && useAmll) {
    if (!amllSubLineRaf) amllSubLineRaf = requestAnimationFrame(syncAmllSubLines);
  } else {
    resetAmllSubLines();
  }
}, { immediate: true });

/* 用户手动滑动歌词时暂停高亮跟随，3s 无操作恢复 */
const isUserScrolling = ref(false);
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

function onLyricScroll() {
  isUserScrolling.value = true;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    isUserScrolling.value = false;
    scrollTimer = null;
    nextTick(() => scrollToCurrentLine('smooth'));
  }, 3000);
}

onMounted(() => {
  // 监听已通过模板 @scroll/@wheel/@touchmove 完成
});
onBeforeUnmount(() => {
  if (scrollTimer) clearTimeout(scrollTimer);
  if (amllSubLineRaf) { cancelAnimationFrame(amllSubLineRaf); amllSubLineRaf = null; }
});

watch(currentLyricIndex, async (idx, prev) => {
  if (idx < 0) return;
  if (isUserScrolling.value) return;
  await nextTick();
  scrollToCurrentLine(prev === -1 ? 'auto' : 'smooth');
});

const currentPlaybackKey = computed(() => getTrackPlaybackKey(playerStore.state.currentTrack));

watch(currentPlaybackKey, async (key) => {
  if (!key) return;
  await loadLyrics(playerStore.state.currentTrack);
  await nextTick();
  if (currentLyricIndex.value >= 0) scrollToCurrentLine('auto');
}, { immediate: true });

startTick();
</script>

<style scoped>
.right-zone { min-height: 0; display: flex; flex-direction: column; height: 100%; isolation: isolate; animation: anFadeUp var(--an-duration-base) var(--an-ease) both; }
.right-zone.l-center .line-wrap { text-align: center; }
.right-zone:not(.l-center) .line-wrap { text-align: left; padding-left: var(--space-4); padding-right: var(--space-4); }
.right-zone.l-no-cover { max-width: min(700px, 85%); margin: 0 auto; width: 100%; }
.right-zone.l-fullscreen { max-width: min(700px, 85%); margin: 0 auto; width: 100%; }
.right-zone.l-hidden { display: grid; place-items: center; }
.lyric-box { flex: 1; overflow-y: auto; overflow-x: hidden; border-radius: 0; padding: 42% 60px 0; background: transparent; border: 0; box-shadow: none; scroll-behavior: smooth; }
.lyric-box::-webkit-scrollbar { width: 0; }
.line-wrap { margin: var(--space-3) 0; text-align: center; cursor: pointer; border-radius: 12px; padding: var(--space-2) var(--space-3); transition: background-color 140ms ease, box-shadow 140ms ease; }
.line-wrap:hover { background: rgba(255,255,255,0.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2); }
.line-wrap.hide-played { visibility: hidden; opacity: 0; pointer-events: none; }
.line { margin: 0; color: rgba(255,255,255,0.55); font-size: var(--l-font-size, 30px); font-weight: var(--l-font-weight, 700); line-height: var(--l-line-height, 1.28); letter-spacing: var(--l-letter-spacing, 0); overflow-wrap: break-word; word-break: break-word; }
.line-sub { margin: var(--space-1) 0 0; color: rgba(255,255,255,0.62); font-size: calc(var(--l-font-size, 30px) * 0.66); font-weight: 500; line-height: var(--l-line-height, 1.28); }
.line-sub.active { color: rgba(255,255,255,0.9); }
.line-roma { font-style: italic; }
.word { display: inline; }
.amll-status { flex: 1; display: grid; place-items: center; color: rgba(255,255,255,0.4); font-size: 15px; }
.podcast-desc {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6) var(--space-5);
  color: rgba(255,255,255,0.75);
  font-size: var(--text-label-md);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.podcast-desc::-webkit-scrollbar { display: none; }
.podcast-desc :deep(.podcast-ts),
:deep(.podcast-ts) { cursor: pointer; color: var(--accent, #c39c76); font-weight: 600; border-bottom: 1px dashed color-mix(in srgb, var(--accent, #c39c76) 40%, transparent); transition: all 120ms ease; }
.podcast-desc :deep(.podcast-ts:hover),
:deep(.podcast-ts:hover) { background: color-mix(in srgb, var(--accent, #c39c76) 12%, transparent); border-bottom-color: var(--accent, #c39c76); }
.podcast-desc :deep(.podcast-ts:active),
:deep(.podcast-ts:active) { background: color-mix(in srgb, var(--accent, #c39c76) 22%, transparent); }
.renderer-stack { flex: 1; min-height: 0; display: flex; flex-direction: column; mask-image: linear-gradient(to bottom, transparent 0%, transparent 4%, black 14%, black 86%, transparent 96%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 4%, black 14%, black 86%, transparent 96%, transparent 100%); }
.renderer-layer { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.amll-player { flex: 1; min-height: 0; }
.amll-player :deep(.amll-lyric-player.dom) { line-height: var(--l-line-height, 1.28) !important; }
.amll-player :deep(.UagxCq_interludeDots),
.amll-player :deep(.B6JzaG_interludeDots) {
  left: 0;
  right: 0;
  width: fit-content;
  margin: 0 auto;
}
.right-zone.l-center .amll-player :deep(.amll-lyric-player) { text-align: center; }
</style>
