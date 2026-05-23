import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { getCloudLyric, getSongLyric, getSongLyricNew } from '../api/music';
import { playerStore } from '../stores/player';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LyricWord = {
  text: string;
  startTime: number;
  duration: number;
  space?: boolean;
};

export type LyricLine = {
  time: number;
  text: string;
  translation?: string;
  romalrc?: string;
  words?: LyricWord[];
};

/* ------------------------------------------------------------------ */
/*  Parsers – pure functions                                           */
/* ------------------------------------------------------------------ */

export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc?.trim()) return [];
  const rows = lrc.split('\n');
  const out: LyricLine[] = [];
  for (const row of rows) {
    const matches = [...row.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    const text = row.replace(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    for (const m of matches) {
      const min = Number(m[1] || 0);
      const sec = Number(m[2] || 0);
      const msRaw = m[3] || '0';
      const ms = Number(msRaw.padEnd(3, '0'));
      out.push({ time: min * 60 + sec + ms / 1000, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function parseYrc(yrc: string): LyricLine[] {
  if (!yrc?.trim()) return [];
  const lines = yrc.split('\n');
  const out: LyricLine[] = [];
  const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordRegex = /\((\d+),(\d+),\d+\)([^()]+)/g;
  for (const raw of lines) {
    const row = raw.trim();
    if (!row) continue;
    const lineMatch = row.match(lineRegex);
    if (!lineMatch) continue;
    const lineStartMs = Number(lineMatch[1] || 0);
    const body = lineMatch[3] || '';
    const words: LyricWord[] = [];
    let fullText = '';
    for (const m of body.matchAll(wordRegex)) {
      const offset = Number(m[1] || 0);
      const duration = Number(m[2] || 0);
      const rawWord = m[3] || '';
      const hasTrailingSpace = /\s$/.test(rawWord);
      const text = rawWord.trimEnd();
      if (!text && !hasTrailingSpace) continue;
      words.push({ text, startTime: lineStartMs + offset, duration, space: hasTrailingSpace });
      fullText += text + (hasTrailingSpace ? ' ' : '');
    }
    out.push({
      time: lineStartMs / 1000,
      text: fullText.trim() || body.replace(wordRegex, '$3').trim(),
      words,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function parseLyrics(payload: any): LyricLine[] {
  const yrcText = payload?.yrc?.lyric || '';
  const lrcText = typeof payload?.lrc === 'string' ? payload.lrc : (payload?.lrc?.lyric || '');
  const tlyricText = payload?.tlyric?.lyric || '';
  const romalrcText = payload?.romalrc?.lyric || '';
  const lrcLines = parseLrc(lrcText);
  const yrcLines = parseYrc(yrcText);
  let baseLines: LyricLine[] = [];
  if (lrcLines.length) {
    baseLines = lrcLines.map((line) => ({ ...line }));
    if (yrcLines.length) {
      baseLines = baseLines.map((line) => {
        let best: LyricLine | undefined;
        let minDiff = 1.2;
        for (const yLine of yrcLines) {
          const diff = Math.abs(yLine.time - line.time);
          if (diff <= minDiff) { minDiff = diff; best = yLine; }
        }
        if (!best) return line;
        return { ...line, text: best.text || line.text, words: best.words };
      });
    }
  } else {
    baseLines = yrcLines;
  }
  if (!baseLines.length) return [];
  const tLines = parseLrc(tlyricText);
  if (tLines.length) {
    if (tLines.length === baseLines.length) {
      baseLines = baseLines.map((line, index) => ({ ...line, translation: tLines[index]?.text || '' }));
    } else {
      baseLines = baseLines.map((line) => {
        let bestText = '';
        let bestDiff = Infinity;
        for (const tLine of tLines) {
          const diff = Math.abs(tLine.time - line.time);
          if (diff < bestDiff && diff <= 2) { bestDiff = diff; bestText = tLine.text; }
        }
        return { ...line, translation: bestText };
      });
    }
  }
  const rLines = parseLrc(romalrcText);
  if (rLines.length) {
    if (rLines.length === baseLines.length) {
      baseLines = baseLines.map((line, index) => ({ ...line, romalrc: rLines[index]?.text || '' }));
    } else {
      baseLines = baseLines.map((line) => {
        let bestText = '';
        let bestDiff = Infinity;
        for (const rLine of rLines) {
          const diff = Math.abs(rLine.time - line.time);
          if (diff < bestDiff && diff <= 2) { bestDiff = diff; bestText = rLine.text; }
        }
        return { ...line, romalrc: bestText };
      });
    }
  }
  return baseLines;
}

/* ------------------------------------------------------------------ */
/*  YRC v2 parsers — for /lyric/new API                                */
/* ------------------------------------------------------------------ */

/**
 * 解析 `/lyric/new` 返回的 YRC 格式。
 * 与旧版 parseYrc 的关键区别：
 * - 跳过 JSON 元数据行（以 {"t": 开头）
 * - 单词 duration 单位是 **厘秒 (0.01s)**，需 ×10 转毫秒
 */
export function parseYrcNew(yrcText: string): LyricLine[] {
  if (!yrcText?.trim()) return [];
  const lines = yrcText.split('\n');
  const out: LyricLine[] = [];
  const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordRegex = /\((\d+),(\d+),\d+\)([^()]+)/g;

  for (const raw of lines) {
    const row = raw.trim();
    if (!row) continue;
    // 跳过 JSON 元数据行
    if (row.startsWith('{"t":')) continue;

    const lineMatch = row.match(lineRegex);
    if (!lineMatch) continue;

    const lineStartMs = Number(lineMatch[1]);
    const body = lineMatch[3] || '';

    const words: LyricWord[] = [];
    let fullText = '';

    for (const m of body.matchAll(wordRegex)) {
      const absStart = Number(m[1]);
      const dur = Number(m[2]);              // 毫秒（实测与相邻单词间隔一致）
      const rawWord = m[3];
      const hasTrailingSpace = /\s$/.test(rawWord);
      const text = rawWord.trimEnd();

      if (!text && !hasTrailingSpace) continue;

      words.push({
        text,
        startTime: absStart,     // ms
        duration: dur,                          // ms
        space: hasTrailingSpace,
      });
      fullText += text + (hasTrailingSpace ? ' ' : '');
    }

    out.push({
      time: lineStartMs / 1000,
      text: fullText.trim() || body.replace(wordRegex, '$3').trim(),
      words,
    });
  }

  return out.sort((a, b) => a.time - b.time);
}

/**
 * 解析 `/lyric/new` 返回的完整 payload。
 * 逐字数据在 `yrc.lyric`，翻译在 `yrc.ytlyric`（或旧位置 `tlyric.lyric`）。
 */
export function parseLyricsNew(payload: any): LyricLine[] {
  const yrcText = payload?.yrc?.lyric || '';
  const tlyricText = payload?.yrc?.ytlyric || payload?.tlyric?.lyric || '';

  const mainLines = parseYrcNew(yrcText);
  if (!mainLines.length) return [];

  const tLines = parseLrc(tlyricText);
  if (!tLines.length) return mainLines;

  if (tLines.length === mainLines.length) {
    return mainLines.map((line, i) => ({ ...line, translation: tLines[i]?.text || '' }));
  }
  return mainLines.map((line) => {
    let best = '';
    let diff = Infinity;
    for (const tl of tLines) {
      const d = Math.abs(tl.time - line.time);
      if (d < diff && d <= 2) { diff = d; best = tl.text; }
    }
    return { ...line, translation: best };
  });
}

/* ------------------------------------------------------------------ */
/*  Style helpers                                                      */
/* ------------------------------------------------------------------ */

import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
const LYRIC_ANCHOR_RATIO = 0.30;
const LYRIC_BASE_COLOR = 'rgba(255,255,255,0.35)';

export type LyricStyleOptions = {
  baseColor?: string;
  activeColor?: string;
};

export function getLineWrapStyle(lineIndex: number, currentIndex: number) {
  if (currentIndex < 0) return { opacity: 1, filter: 'none' };
  const diff = currentIndex - lineIndex;
  const dist = Math.abs(diff);
  if (dist > 0) {
    return { opacity: Math.max(0.16, 1 - dist * 0.11), filter: `blur(${Math.min(2.4, dist * 0.2)}px)` };
  }
  return { opacity: 1, filter: 'none' };
}

export function getLineStyle(
  lineIndex: number, line: LyricLine, currentIndex: number, displayTime: number,
  nextLine?: LyricLine, opts: LyricStyleOptions = {},
) {
  const baseColor = opts.baseColor || LYRIC_BASE_COLOR;
  const activeColor = opts.activeColor || '#ffffff';
  if (line.words?.length) return { color: baseColor };
  const startMs = line.time * 1000;
  const endMs = (nextLine?.time ?? line.time + 3) * 1000;
  const currentMs = displayTime * 1000;
  // 已播放行 / 未播放行 → 统一使用 baseColor
  if (lineIndex < currentIndex || currentMs >= endMs) return { color: baseColor + ' !important', backgroundImage: 'none' };
  if (lineIndex > currentIndex || currentMs <= startMs) return { color: baseColor + ' !important', backgroundImage: 'none' };
  // 当前行 → 直接整行亮白，无逐字数据时不做渐变
  return { color: activeColor + ' !important', backgroundImage: 'none' };
}

export function getWordStyle(lineIndex: number, word: LyricWord, currentIndex: number, displayTime: number, opts: LyricStyleOptions = {}) {
  const baseColor = opts.baseColor || LYRIC_BASE_COLOR;
  const activeColor = opts.activeColor || '#ffffff';
  const currentMs = displayTime * 1000;
  // 已播放过的行 → 统一 baseColor
  if (lineIndex < currentIndex) {
    return { color: baseColor, backgroundImage: 'none' };
  }
  // 还未播放的行 → baseColor
  if (lineIndex > currentIndex) {
    return { color: baseColor, backgroundImage: 'none' };
  }
  // 当前行 → 逐字高亮
  const start = word.startTime;
  const end = word.startTime + Math.max(1, word.duration);
  if (currentMs >= end) {
    return { color: activeColor, backgroundImage: 'none' };
  }
  if (currentMs <= start) {
    return { color: baseColor, backgroundImage: 'none' };
  }
  const percent = Math.min(1, Math.max(0, (currentMs - start) / Math.max(1, end - start)));
  const pct = Math.round(percent * 100);
  return {
    backgroundImage: `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${pct}%, ${baseColor} ${pct}%, ${baseColor} 100%)`,
    backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent',
  };
}

export function getTranslationStyle(lineIndex: number, line: LyricLine, currentIndex: number, displayTime: number, nextLine?: LyricLine, opts: LyricStyleOptions = {}) {
  const baseColor = opts.baseColor || LYRIC_BASE_COLOR;
  const activeColor = opts.activeColor || 'rgba(255,255,255,0.94)';
  const currentMs = displayTime * 1000;
  if (lineIndex < currentIndex) return { color: baseColor + ' !important' };
  if (lineIndex > currentIndex) return { color: baseColor + ' !important' };
  // 无逐字数据时，当前行使用纯色高亮，不做渐变（与主歌词行对齐）
  if (!line.words?.length) return { color: activeColor + ' !important', backgroundImage: 'none' };
  const startMs = line.time * 1000;
  const nextStartMs = (nextLine?.time ?? line.time + 3) * 1000;
  const percent = Math.round((Math.min(1, Math.max(0, (currentMs - startMs) / Math.max(1, nextStartMs - startMs)))) * 100);
  return {
    backgroundImage: `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${percent}%, ${baseColor} ${percent}%, ${baseColor} 100%)`,
    backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent', opacity: 1,
  };
}

/** 将 lyricsSettings.state.anchorPos (0-10) 转换为高亮位置比例 (0-1) */
export function getAnchorRatio(anchorPos: number): number {
  return 0.15 + ((anchorPos ?? 3) / 10) * 0.7;
}

/**
 * 移除末尾所有无文本内容的空行。
 * 只裁剪尾部，不影响中间可能存在的间奏空行。
 */
function trimTrailingEmptyLines(lines: LyricLine[]): LyricLine[] {
  if (!lines.length) return lines;
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    const text = line.text?.trim() || '';
    const hasWords = (line.words || []).length > 0;
    if (!text && !hasWords) end--;
    else break;
  }
  return end < lines.length ? lines.slice(0, end) : lines;
}

export function scrollToLyricLine(container: HTMLElement | null, lineEls: HTMLElement[], index: number, behavior: ScrollBehavior = 'smooth') {
  if (index < 0 || !container) return;
  const lineEl = lineEls[index];
  if (!lineEl) return;
  const anchorRatio = getAnchorRatio(lyricsSettings.state.anchorPos);
  const anchorY = container.clientHeight * anchorRatio;
  const targetTop = lineEl.offsetTop + lineEl.clientHeight / 2 - anchorY;
  container.scrollTo({ top: Math.max(0, targetTop), behavior });
}

/* ------------------------------------------------------------------ */
/*  Composable                                                         */
/* ------------------------------------------------------------------ */

export function useLyrics() {
  const lyricLines = ref<LyricLine[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const displayTime = ref(0);
  const effectiveTime = computed(() => displayTime.value + playerStore.lyricsOffset);
  const lyricBoxRef = ref<HTMLElement | null>(null);
  const lyricLineRefs = ref<HTMLElement[]>([]);

  const currentLyricIndex = computed(() => {
    const lines = lyricLines.value;
    if (!lines.length) return -1;
    const t = effectiveTime.value;
    let idx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (t >= lines[i].time) idx = i;
      else break;
    }
    return idx;
  });

  const tickRunning = { value: false };

  function startTick() {
    if (tickRunning.value) return;
    tickRunning.value = true;

    function tick() {
      if (!tickRunning.value) return;
      if (playerStore.isPlaying) {
        // 直接读 audio.currentTime 高精度值（~16ms），远超 timeupdate 事件精度（~250ms）
        displayTime.value = playerStore.audio.currentTime || 0;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function stopTick() {
    tickRunning.value = false;
  }

  function setLyricLineRef(el: Element | null, idx: number) {
    if (!el) return;
    lyricLineRefs.value[idx] = el as HTMLElement;
  }

  async function loadLyrics(track: typeof playerStore.currentTrack) {
    const id = track?.id;
    if (!id) { lyricLines.value = []; return; }
    isLoading.value = true;
    error.value = null;
    lyricLines.value = [];
    try {
      const source = track?.source;
      const cloudSid = track?.cloudSid;

      // 本地歌曲：通过 IPC 获取外部歌词
      if (source === 'local') {
        const localApi = (window as any).localApi
        if (localApi?.getLyric) {
          const filePath = (track as any).path
          if (filePath) {
            try {
              const result = await localApi.getLyric(filePath)
              if (result?.text) {
                // parseLyrics 需要 { lrc/yrc: { lyric: '...' } } 格式
                const payload: any = {}
                const fmt = result.format || 'lrc'
                payload[fmt] = { lyric: result.text }
                const lines = parseLyrics(payload)
                if (lines.length) {
                  lyricLines.value = lines
                  isLoading.value = false
                  return
                }
              }
            } catch { /* fall through to online */ }
          }
        }
      }

      // 云盘歌词：优先走云盘专属 API
      if (source === 'cloud' && cloudSid) {
        const data = (await getCloudLyric(Number(track?.cloudOwnerId || track?.uid || 0), cloudSid)).data;
        lyricLines.value = parseLyrics(data);
      }

      // 云盘 API 无歌词 或 非云盘歌曲 → 走在线歌词
      if (!lyricLines.value.length) {
        const lyricId = source === 'cloud' && cloudSid ? Number(cloudSid) : Number(id);
        // 优先尝试 /lyric/new
        try {
          const res = await getSongLyricNew(lyricId);
          const data = res.data;
          const newLines = parseLyricsNew(data);
          if (newLines.length) {
            lyricLines.value = newLines;
          } else {
            throw new Error('new api returned empty');
          }
        } catch {
          // 回退旧 API
          const data = (await getSongLyric(lyricId)).data;
          lyricLines.value = parseLyrics(data);
        }
      }
      lyricLines.value = trimTrailingEmptyLines(lyricLines.value);
      if (lyricBoxRef.value) lyricBoxRef.value.scrollTop = 0;
    } catch { lyricLines.value = []; error.value = '歌词加载失败'; }
    finally { isLoading.value = false; }
  }

  function scrollToCurrentLine(behavior: ScrollBehavior = 'smooth') {
    scrollToLyricLine(lyricBoxRef.value, lyricLineRefs.value, currentLyricIndex.value, behavior);
  }

  function seekToLine(index: number) {
    const line = lyricLines.value[index];
    if (!line) return;
    playerStore.seek(line.time);
    nextTick(() => scrollToCurrentLine('auto'));
  }

  onUnmounted(() => { stopTick(); });

  return {
    lyricLines, currentLyricIndex, displayTime, effectiveTime, isLoading, error,
    lyricBoxRef, lyricLineRefs, setLyricLineRef,
    startTick, stopTick, loadLyrics,
    scrollToCurrentLine, seekToLine,
  };
}
