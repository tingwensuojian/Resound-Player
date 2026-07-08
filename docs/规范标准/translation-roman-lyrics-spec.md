# 翻译与音译歌词显示规范

本文档记录 Resound-Player 项目中翻译（translation）和音译（romanized lyrics）的完整实现，
涵盖数据层、自定义渲染器、AMLL 渲染器以及 UI 控制入口。

---

## 1. 数据层

### 1.1 API 数据来源

- 接口：`/lyric?id={songId}`
- 相关字段：
  - `lrc.lyric` — 原始歌词（LRC 格式）
  - `tlyric.lyric` — 翻译歌词（LRC 格式）
  - `romalrc.lyric` — 音译歌词（LRC 格式，如日文罗马音）

### 1.2 类型定义

```ts
// src/composables/useLyrics.ts
export type LyricLine = {
  time: number;
  text: string;           // 原文歌词
  translation?: string;   // 翻译（可选）
  romalrc?: string;       // 音译（可选）
  words?: LyricWord[];    // 逐字数据（可选）
};
```

### 1.3 解析逻辑

`parseLyrics(payload)` 函数（`src/composables/useLyrics.ts`）依次处理：

1. **原文**：优先使用 `yrc.lyric`（逐字），回退 `lrc.lyric`
2. **翻译**：从 `tlyric.lyric` 提取，按时间匹配到对应歌词行
3. **音译**：从 `romalrc.lyric` 提取，按时间匹配到对应歌词行（与翻译匹配逻辑相同）

匹配策略：
- 如果行数完全一致 → 按索引一一对应
- 如果行数不一致 → 按时间差匹配（阈值 ≤ 2 秒）

---

## 2. 设置状态

### 2.1 lyricsSettings 字段

```ts
// src/stores/lyricsSettings.ts
showTranslation: boolean;  // 翻译显示开关，默认 true
showRomalrc: boolean;      // 音译显示开关，默认 false
```

- 两个开关**独立控制**
- 持久化到 localStorage（key: `gm_lyrics_settings_v1`）

### 2.2 UI 控制入口

位于播放展开页右侧操作区（`src/components/PlayerExpanded.vue`）：

- "译" 按钮（`.ra-btn-trans`）：点击打开 `trans-popover` 弹出面板
- 面板内容：
  - **翻译**：`FancySwitch` 绑定 `lyricsSettings.showTranslation`
  - **音译**：`FancySwitch` 绑定 `lyricsSettings.showRomalrc`
- 面板背景使用 `var(--bg-solid)`（不透明，符合弹窗规范 3.6）
- 复用 `offset-fade` 过渡动画

---

## 3. 自定义渲染器

适用于未启用 AMLL 渲染器的情况（`lyricsSettings.useAmllRenderer === false`）。

### 3.1 模板渲染

```html
<!-- src/components/LyricsPanel.vue – 自定义渲染器模板 -->
<p v-if="line.translation && lyricsSettings.showTranslation"
   class="line-sub"
   :class="{ active: idx === currentLyricIndex, passed: idx < currentLyricIndex }"
   :style="translationStyle(idx, line)">
  {{ line.translation }}
</p>
<p v-if="line.romalrc && lyricsSettings.showRomalrc"
   class="line-sub line-roma"
   :class="{ active: idx === currentLyricIndex, passed: idx < currentLyricIndex }"
   :style="translationStyle(idx, line)">
  {{ line.romalrc }
}
</p>
```

- 翻译和音译共用 `translationStyle()` 方法
- 视觉上通过 CSS 类 `.line-roma`（斜体）与翻译区分

### 3.2 高亮逻辑

`getTranslationStyle()` 函数（`src/composables/useLyrics.ts`）：

| 条件 | 行为 |
|------|------|
| `lineIndex < currentIndex`（已播行） | 返回 `baseColor`（淡色，透明度 0.35） |
| `lineIndex > currentIndex`（未播行） | 返回 `baseColor`（淡色） |
| 当前行 + **无逐字数据** | 返回纯色 `activeColor`（纯色高亮，无渐变） |
| 当前行 + **有逐字数据** | 返回 `linear-gradient` 渐变（从左到右渐进高亮） |

**关键特性**：
- `getTranslationStyle` 同时服务翻译行和音译行，不依赖 `line.translation` 字段存在
- 无逐字数据时使用纯色高亮，与主歌词行 `getLineStyle` 行为一致
- 颜色跟随 `lyricColorOpts`（受 `followCoverColor` 设置控制）

### 3.3 CSS 样式

```css
/* src/components/LyricsPanel.vue */
.line-sub {
  margin: var(--space-1) 0 0;
  color: rgba(255,255,255,0.62);
  font-size: calc(var(--l-font-size, 30px) * 0.66); /* 主字号的 66% */
  font-weight: 500;
  line-height: var(--l-line-height, 1.28);
}
.line-sub.active { color: rgba(255,255,255,0.9); }
.line-roma { font-style: italic; }  /* 音译额外斜体区分 */
```

---

## 4. AMLL 渲染器

适用于启用 AMLL 渲染器的情况（`lyricsSettings.useAmllRenderer === true`）。

### 4.1 数据适配

通过 `convertToAmmlLyrics()`（`src/composables/useAmllAdapter.ts`）将项目 `LyricLine[]` 转换为 AMLL `AmllLyricLine[]`：

```ts
translatedLyric: line.translation || '',  // 翻译 → AMLL 子行
romanLyric: line.romalrc || '',            // 音译 → AMLL 子行
```

AMLL 原生渲染 `translatedLyric` 和 `romanLyric` 为子行文本（`.lyricSubLine`），位置在主歌词行下方。

### 4.2 高亮说明

AMLL 对子行的高亮效果由 AMLL 库内部控制：
- 主歌词行有完整的**逐字渐进高亮**（有逐字数据时按词高亮，无逐字数据时跨行高亮）
- 子行（翻译/音译）**跟随主行做基础的明暗变化**，不获得与主行同等的渐变高亮效果

### 4.3 已知限制

- AMLL **无法**同时满足「子行字体大小 + 完整渐进高亮」两个需求
- 子行字体大小由 AMLL 库自动控制（通常比主行小）
- 如需完整的翻译/音译高亮效果，建议切换到自定义渲染器

---

## 5. 行为总结

| 场景 | 自定义渲染器 | AMLL 渲染器 |
|------|-------------|-------------|
| **翻译文本显示** | `line-sub` 样式，66% 主字号 | AMLL `translatedLyric` 子行 |
| **音译文本显示** | `line-sub line-roma` 样式（斜体） | AMLL `romanLyric` 子行 |
| **翻译/音译高亮（无逐字）** | 纯色 `activeColor` 高亮 ✅ | 跟随主行明暗变化 ⚠️ |
| **翻译/音译高亮（有逐字）** | 从左到右渐变高亮 ✅ | 跟随主行明暗变化 ⚠️ |
| **颜色跟随封面** | 支持（通过 `lyricColorOpts`） | 不支持子行颜色追踪 |
| **开关生效** | `showTranslation` / `showRomalrc` | 固定显示（无开关控制子行） |

---

## 6. 文件索引

| 文件 | 职责 |
|------|------|
| `src/stores/lyricsSettings.ts` | `showTranslation` / `showRomalrc` 状态定义 |
| `src/composables/useLyrics.ts` | `LyricLine` 类型、`parseLyrics()` 解析、`getTranslationStyle()` 高亮 |
| `src/composables/useAmllAdapter.ts` | `convertToAmmlLyrics()` AMLL 数据转换 |
| `src/components/LyricsPanel.vue` | 自定义/AMLL 渲染器模板和样式 |
| `src/components/PlayerExpanded.vue` | "译" 按钮弹出面板 UI |
| `src/api/music.ts` | `getSongLyric()` / `getSongLyricNew()` API 调用 |