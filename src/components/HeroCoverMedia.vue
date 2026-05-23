<template>
  <div :class="['hero-media-shell', shellClass]">
    <AnimatedAppear
      tag="div"
      variant="media"
      :rhythm="rhythm"
      :index="index"
      :class-name="heroMotionClassName"
    >
      <div class="progressive-cover progressive-cover--hero" :class="loadedClasses">
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
          class="progressive-cover__full cover"
          :class="[imageClass, { loaded: targetLoaded }]"
          :src="targetUrl"
          :srcset="srcset"
          sizes="(max-width: 640px) 300px, (max-width: 1280px) 512px, 1024px"
          :alt="alt"
          decoding="async"
        />
      </div>
    </AnimatedAppear>
  </div>
</template>

<script setup lang="ts">
import AnimatedAppear from './AnimatedAppear.vue';
import { useProgressiveCover } from '../composables/useProgressiveCover';

// 只用于详情页头图 media 槽位；它复用 detail-page.css 里的 hero 结构，不参与普通结果卡布局。
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
    loading: 'eager',
    rhythm: 'body',
    index: 0,
    shellClass: '',
    motionClass: 'cover-motion-shell',
    imageClass: '',
  },
);

const heroMotionClassName = [props.motionClass].filter(Boolean).join(' ');

const {
  lqipUrl,
  thumbUrl,
  targetUrl,
  thumbLoaded,
  targetLoaded,
  loadedClasses,
  srcset,
} = useProgressiveCover(() => props.src, { targetSize: 'large' });
</script>