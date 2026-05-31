<template>
  <component
    :is="tag"
    class="gradient-card"
    :class="[`gradient-card--${hoverPlaySize || 'sm'}`, { 'hover-play-button-trigger': !!hoverPlaySize }]"
    v-bind="$attrs"
  >
    <div class="gradient-card__media">
      <div class="progressive-cover" :class="loadedClasses">
        <!-- 第 1 层：LQIP 模糊占位 -->
        <span
          v-if="cover"
          class="progressive-cover__lqip"
          :style="{ backgroundImage: `url(${lqipUrl})` }"
        ></span>
        <!-- 第 2 层：缩略图 -->
        <img
          v-if="cover"
          class="progressive-cover__thumb"
          :class="{ loaded: thumbLoaded }"
          :src="thumbUrl"
          :alt="name || ''"
          decoding="async"
        />
        <!-- 第 3 层：全尺寸高清图 -->
        <img
          v-if="cover"
          class="progressive-cover__full gradient-card__cover-img"
          :class="{ loaded: targetLoaded }"
          :src="targetUrl"
          :srcset="srcset"
          sizes="(max-width: 640px) 100px, (max-width: 1280px) 200px, 300px"
          :alt="name || ''"
          decoding="async"
        />
      </div>
      <HoverPlayButton
        v-if="hoverPlaySize"
        :size="hoverPlaySize"
        :count="playCount"
      />
    </div>
    <div class="gradient-card__info">
      <div class="gradient-card__name" :title="name">{{ name }}</div>
      <div v-if="$slots.subtitle || subtitle" class="gradient-card__subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
import HoverPlayButton from '../HoverPlayButton.vue';
import { useProgressiveCover } from '../../composables/useProgressiveCover';

const props = withDefaults(
  defineProps<{
    tag?: 'button' | 'article';
    cover?: string;
    name?: string;
    subtitle?: string;
    hoverPlaySize?: 'sm' | 'md' | null;
    playCount?: number;
  }>(),
  {
    tag: 'button',
    cover: '',
    name: '',
    subtitle: '',
    hoverPlaySize: 'sm',
    playCount: undefined,
  },
);

defineSlots<{
  subtitle?: (props: Record<string, never>) => any;
}>();

const {
  lqipUrl,
  thumbUrl,
  targetUrl,
  thumbLoaded,
  targetLoaded,
  loadedClasses,
  srcset,
} = useProgressiveCover(() => props.cover, { targetSize: 'large' });
</script>

<style scoped>
.gradient-card {
  --card-radius: 12px;

  position: relative;
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  isolation: isolate;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  border-radius: var(--card-radius);
  background: color-mix(in srgb, var(--bg-surface) 86%, rgba(15, 23, 42, 0.16));
}

/* 移除 ::before 中的 background-image 双重加载 — 现由三层渐进系统覆盖 */
.gradient-card::before {

  animation: anFadeUp var(--an-duration-base) var(--an-ease) both;
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}

.gradient-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.2) 28%,
    rgba(255, 255, 255, 0.52) 62%,
    rgba(255, 255, 255, 0.92) 82%,
    rgb(255, 255, 255) 92%
  );
}

[data-theme='dark'] .gradient-card::after {
  background: linear-gradient(
    180deg,
    rgba(26, 23, 21, 0.06) 0%,
    rgba(26, 23, 21, 0.18) 28%,
    rgba(26, 23, 21, 0.42) 62%,
    rgba(26, 23, 21, 0.82) 82%,
    rgb(26, 23, 21) 92%
  );
}

.gradient-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
}

.gradient-card__media,
.gradient-card__info {
  position: relative;
  z-index: 2;
}

/* ---- Cover media ---- */
.gradient-card__media {
  --hover-play-button-size: 30px;
  --hover-play-button-offset: 8px;

  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--card-radius) var(--card-radius) 0 0;
  background: var(--bg-soft) center/cover no-repeat;
  transform: translateZ(0);
}

.gradient-card--md .gradient-card__media {
  --hover-play-button-size: 34px;
  --hover-play-button-offset: 9px;
}

/* 三层封面在 .gradient-card__media 中定位在 z-index: 1 以下 */
.gradient-card__media :deep(.progressive-cover) {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* 全尺寸图保留 hover 缩放能力 */
.gradient-card__cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition:
    transform var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease)),
    filter var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease));
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
}

@media (hover: hover) and (pointer: fine) {
  .gradient-card__media:hover .gradient-card__cover-img,
  .gradient-card:focus-within .gradient-card__cover-img {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}

/* ---- Info area ---- */
.gradient-card__info {
  padding: var(--space-2);
}

.gradient-card__name {
  margin: 0;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.42;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gradient-card__subtitle {
  margin: var(--space-1) 0 0;
  color: var(--text-soft);
  font-size: var(--text-label-sm);
  line-height: 1.35;
}

.gradient-card__subtitle :deep(.artist-inline-btn) {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.gradient-card__subtitle :deep(.artist-inline-btn:hover) {
  color: var(--accent);
  text-decoration: underline;
}

.gradient-card__subtitle :deep(.artist-inline-btn + .artist-inline-btn::before) {
  content: '/';
  margin: 0 2px;
  color: var(--text-soft);
}
</style>