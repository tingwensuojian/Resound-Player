<template>
  <div :class="['interactive-media-shell', shellClass]">
    <AnimatedAppear
      tag="div"
      variant="media"
      :rhythm="rhythm"
      :index="index"
      :class-name="interactiveMotionClassName"
    >
      <img
        :src="src"
        :alt="alt"
        :loading="loading"
        :class="['interactive-media-image', imageClass]"
      />
    </AnimatedAppear>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnimatedAppear from './AnimatedAppear.vue';

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

const interactiveMotionClassName = computed(() =>
  ['interactive-media-motion', props.motionClass].filter(Boolean).join(' '),
);
</script>