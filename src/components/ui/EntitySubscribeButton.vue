<template>
  <AnimatedAppear
    tag="button"
    variant="control"
    rhythm="actions"
    type="button"
    class-name="entity-subscribe-button"
    :class="[`entity-subscribe-button--${type}`, { saved: subscribed, loading, 'text-mode': text }]"
    :aria-pressed="subscribed"
    :aria-label="buttonLabel"
    :disabled="loading"
    @click="$emit('toggle')"
  >
    <!-- 歌手：文字按钮 -->
    <template v-if="type === 'artist'">
      <span v-if="!subscribed" class="follow-core">
        <svg class="follow-plus" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="8" y1="2" x2="8" y2="14" />
          <line x1="2" y1="8" x2="14" y2="8" />
        </svg>
        <span class="follow-text">关注</span>
      </span>
      <span v-else class="follow-core followed">
        <svg class="follow-check" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3,8 7,12 13,4" />
        </svg>
        <span class="follow-text">已关注</span>
      </span>
    </template>

    <!-- 文字模式（收藏歌单/收藏专辑等）：纯文字 -->
    <template v-else-if="text">
      <span class="text-core" :class="{ saved: subscribed }">
        <span class="text-label">{{ subscribed ? (type === 'album' ? '取消收藏' : type === 'podcast' ? '取消订阅' : `取消${textLabels[type]}`) : textLabels[type] }}</span>
      </span>
    </template>

    <!-- 歌单 / 专辑 / 播客：心形图标 -->
    <template v-else>
      <span class="button-core">
        <span class="icon-wrap" aria-hidden="true">
          <Heart class="outline-heart" :size="16" />
          <Heart class="fill-heart" :size="16" />
        </span>
      </span>
      <span class="glow" aria-hidden="true"></span>
      <span class="pulse pulse-a" aria-hidden="true"></span>
      <span class="pulse pulse-b" aria-hidden="true"></span>
    </template>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Heart } from 'lucide-vue-next';
import AnimatedAppear from '../AnimatedAppear.vue';
import type { EntityType } from '../../composables/useEntitySubscribe';

const props = defineProps<{
  type: EntityType;
  subscribed: boolean;
  loading: boolean;
  /** 以文字按钮形式显示（默认心形图标，artist 自动文字） */
  text?: boolean;
}>();

defineEmits<{
  toggle: [];
}>();

const buttonLabel = computed(() => {
  if (props.type === 'artist') {
    return props.subscribed ? '取消关注' : '关注歌手';
  }
  const labels: Record<string, string> = {
    playlist: '收藏歌单',
    album: '收藏专辑',
    podcast: '订阅播客',
  };
  return props.subscribed ? `取消${labels[props.type]}` : labels[props.type];
});

const textLabels: Record<EntityType, string> = {
  playlist: '收藏歌单',
  album: '收藏专辑',
  podcast: '订阅播客',
  artist: '关注',
};
</script>

<style scoped>
/* =========================================
 * 基础按钮 — 复用 button-surface token
 * ========================================= */
.entity-subscribe-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--button-surface-border, color-mix(in srgb, var(--accent) 14%, rgba(255, 255, 255, 0.42)));
  border-radius: 999px;
  background: var(--button-surface-bg, color-mix(in srgb, var(--accent) 6%, var(--bg-surface)));
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  color: var(--text-main);
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 180ms ease,
    border-color 220ms ease,
    background 220ms ease,
    box-shadow 220ms ease;
  box-shadow:
    var(--button-surface-shadow, 0 1px 2px rgba(15, 23, 42, 0.06));
}

.entity-subscribe-button:hover {
  transform: translateY(-1px) scale(1.02);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--button-surface-hover-border, rgba(255, 255, 255, 0.62)));
}

.entity-subscribe-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, white);
  outline-offset: 2px;
}

.entity-subscribe-button.loading {
  opacity: 0.72;
  cursor: progress;
}

.entity-subscribe-button:disabled {
  pointer-events: none;
}

/* =========================================
 * 心形变体（playlist / album / podcast）
 * ========================================= */
.entity-subscribe-button--playlist,
.entity-subscribe-button--album,
.entity-subscribe-button--podcast {
  width: 32px;
  height: 32px;
}

.entity-subscribe-button--playlist.saved,
.entity-subscribe-button--album.saved,
.entity-subscribe-button--podcast.saved {
  border-color: color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 38%, var(--button-surface-hover-border, rgba(255, 255, 255, 0.62)));
  background: color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 14%, var(--bg-surface));
  color: var(--bookmark-heart-fill, #fb7185);
}

.button-core {
  position: relative;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.icon-wrap {
  position: relative;
  width: 16px;
  height: 16px;
  display: inline-grid;
  place-items: center;
}

.outline-heart,
.fill-heart {
  position: absolute;
  inset: 0;
  transition: opacity 220ms ease, transform 220ms ease;
}

.outline-heart {
  color: var(--bookmark-heart-outline, #fda4af);
  opacity: 0.96;
}

.fill-heart {
  color: var(--bookmark-heart-fill, #fb7185);
  fill: currentColor;
  opacity: 0;
  transform: scale(0.4);
}

.entity-subscribe-button.saved .outline-heart {
  opacity: 0;
  transform: scale(0.35) rotate(-8deg);
}

.entity-subscribe-button.saved .fill-heart {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

/* =========================================
 * 文字模式变体（带心形图标的文字按钮）
 * ========================================= */
.text-core {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  position: relative;
  z-index: 3;
  white-space: nowrap;
}

.text-heart {
  flex-shrink: 0;
  color: var(--bookmark-heart-outline, #fda4af);
  transition: color 220ms ease;
}

.text-core.saved .text-heart {
  color: var(--bookmark-heart-fill, #fb7185);
}

.text-label {
  white-space: nowrap;
}

.entity-subscribe-button--playlist:not(.entity-subscribe-button--artist),
.entity-subscribe-button--album:not(.entity-subscribe-button--artist),
.entity-subscribe-button--podcast:not(.entity-subscribe-button--artist) {
  /* 默认心形模式 32x32 */
  width: 32px;
  height: 32px;
}
/* 文字模式覆盖宽高 */
.entity-subscribe-button--playlist.text-mode,
.entity-subscribe-button--album.text-mode,
.entity-subscribe-button--podcast.text-mode {
  width: auto;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: visible;
}

.entity-subscribe-button--playlist.text-mode:hover,
.entity-subscribe-button--album.text-mode:hover,
.entity-subscribe-button--podcast.text-mode:hover {
  transform: translateY(-1px);
  background: var(--button-surface-hover-bg);
  border-color: var(--button-surface-hover-border);
}

.entity-subscribe-button--playlist.text-mode:active,
.entity-subscribe-button--album.text-mode:active,
.entity-subscribe-button--podcast.text-mode:active {
  transform: translateY(0) scale(0.99);
  background: var(--button-surface-active-bg);
  border-color: var(--button-surface-active-border);
}
.entity-subscribe-button--playlist.text-mode.saved,
.entity-subscribe-button--album.text-mode.saved,
.entity-subscribe-button--podcast.text-mode.saved {
  border-color: color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 38%, var(--button-surface-hover-border, rgba(255, 255, 255, 0.62)));
  background: color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 14%, var(--bg-surface));
  color: var(--bookmark-heart-fill, #fb7185);
}

.glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.34) 0%, color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 20%, transparent) 42%, transparent 70%);
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 220ms ease, transform 260ms ease;
}

.entity-subscribe-button.saved .glow {
  opacity: 1;
  transform: scale(1.15);
}

.pulse {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--bookmark-heart-fill, #fb7185) 18%, rgba(255, 255, 255, 0.34));
  opacity: 0;
}

.entity-subscribe-button.saved .pulse {
  animation: pulse-bloom 700ms ease-out;
}

.pulse-a { animation-delay: 0ms; }
.pulse-b { animation-delay: 90ms; }

@keyframes pulse-bloom {
  0% { opacity: 0.78; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(2.15); }
}

/* =========================================
 * 歌手文字按钮变体
 * ========================================= */
.entity-subscribe-button--artist {
  height: 36px;
  padding: 0 14px;
  gap: 4px;
  border-radius: var(--radius-sm);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: visible;
}

.entity-subscribe-button--artist:hover {
  transform: translateY(-1px);
  background: var(--button-surface-hover-bg);
  border-color: var(--button-surface-hover-border);
}

.entity-subscribe-button--artist:active {
  transform: translateY(0) scale(0.99);
  background: var(--button-surface-active-bg);
  border-color: var(--button-surface-active-border);
}

.entity-subscribe-button--artist.saved {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--button-surface-hover-border, rgba(255, 255, 255, 0.62)));
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface));
  color: var(--accent);
}

.follow-core {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 3;
}

.follow-plus,
.follow-check {
  flex-shrink: 0;
}

.follow-text {
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .entity-subscribe-button,
  .outline-heart,
  .fill-heart,
  .glow {
    transition: none;
  }
  .entity-subscribe-button.saved .pulse {
    animation: none;
  }
}
</style>