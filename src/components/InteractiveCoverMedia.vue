<template>
  <div :class="['interactive-media-shell', shellClass]">
    <AnimatedAppear
      tag="div"
      variant="media"
      :rhythm="rhythm"
      :index="index"
      :class-name="interactiveMotionClassName"
    >
      <div class="progressive-cover progressive-cover--interactive" :class="loadedClasses">
        <!-- 第 1 层：LQIP 模糊占位 -->
        <span
          v-if="src"
          class="progressive-cover__lqip"
          :style="{ backgroundImage: `url(${lqipUrl})` }"
        ></span>
        <!-- 第 2 层：缩略图 -->
        <img
          v-if="src"
          class="progressive-cover__thumb"
          :class="{ loaded: thumbLoaded }"
          :src="thumbUrl"
          :alt="alt"
          decoding="async"
        />
        <!-- 第 3 层：全尺寸高清图 -->
        <img
          v-if="src"
          class="progressive-cover__full interactive-media-image"
          :class="[imageClass, { loaded: targetLoaded }]"
          :src="targetUrl"
          :srcset="srcset"
          sizes="(max-width: 640px) 100px, (max-width: 1280px) 200px, 300px"
          :alt="alt"
          decoding="async"
          loading="lazy"
        />
      </div>
    </AnimatedAppear>
  </div>
</template>

<script setup lang="ts">
import AnimatedAppear from './AnimatedAppear.vue';
import { useProgressiveCover } from '../composables/useProgressiveCover';

// 只用于普通卡片封面；搜索结果卡片依赖更严格的布局层级，不能直接复用这里的额外根节点。
const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    loading?: 'lazy' | 'eager';
    rhythm?: 'shell' | 'head' | 'title' | 'body' | 'actions' | 'list' | 'overlay' | 'media';
    index?: number;
    shellClass?: string;
    motionClass?: string;
    imageClass?: string;
  }>(),
  {
    alt: '封面',
    loading: 'lazy',
    rhythm: 'list',
    index: 0,
    shellClass: '',
    motionClass: '',
    imageClass: '',
  },
);

const interactiveMotionClassName = [
  'interactive-media-motion',
  props.motionClass,
].filter(Boolean).join(' ');

const {
  lqipUrl,
  thumbUrl,
  targetUrl,
  thumbLoaded,
  targetLoaded,
  loadedClasses,
  srcset,
} = useProgressiveCover(() => props.src, { targetSize: 'medium' });
</script>