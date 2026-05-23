<template>
  <component :is="tag" v-bind="attrs" :class="computedClass" :style="styleVars"><slot /></component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    tag?: string;
    variant?: 'content' | 'title' | 'text' | 'media' | 'control' | 'modal' | 'nav' | 'sidebar';
    rhythm?: 'shell' | 'head' | 'title' | 'body' | 'actions' | 'list' | 'overlay' | 'media';
    index?: number;
    className?: string;
    attrs?: Record<string, any>;
  }>(),
  {
    tag: 'div',
    variant: 'content',
    rhythm: 'body',
    index: 0,
    className: '',
    attrs: () => ({}),
  },
);

const variantClassMap: Record<string, string> = {
  content: 'an-enter-card',
  title: 'an-title-enter',
  text: 'an-enter-text',
  media: 'an-enter-media',
  control: 'an-enter-control',
  modal: 'an-enter-modal',
  nav: 'an-enter-nav',
  sidebar: 'an-sidebar-enter',
};

const computedClass = computed(() => {
  const cls = variantClassMap[props.variant] || 'an-enter';
  return `${cls} ${props.className}`.trim();
});

const rhythmOffsetMap: Record<string, number> = {
  shell: 0,
  head: 1,
  title: 2,
  body: 3,
  actions: 4,
  list: 5,
  overlay: 6,
};

const styleVars = computed(() => ({
  '--i': String(props.index),
  '--rhythm-offset': String(rhythmOffsetMap[props.rhythm] ?? 3),
}));
</script>
