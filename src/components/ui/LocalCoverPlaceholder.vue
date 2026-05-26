<template>
  <div class="local-cover-placeholder" :class="[shapeClass]" :style="placeholderStyle" aria-hidden="true">
    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  size?: number | string;
  iconSize?: number | string;
  rounded?: number | string;
  circle?: boolean;
}>(), {
  size: 52,
  iconSize: 20,
  rounded: 10,
  circle: false,
});

function toUnit(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

const placeholderStyle = computed(() => ({
  width: toUnit(props.size),
  height: toUnit(props.size),
  borderRadius: props.circle ? '50%' : toUnit(props.rounded),
  '--local-cover-icon-size': toUnit(props.iconSize),
}));

const shapeClass = computed(() => (props.circle ? 'is-circle' : 'is-rounded'));
</script>

<style scoped>
.local-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-muted) 70%, var(--border));
  color: var(--text-soft);
  overflow: hidden;
}

.local-cover-placeholder.is-circle {
  background:
    radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 28%, transparent 52%),
    color-mix(in srgb, var(--bg-muted) 72%, var(--border));
}

.local-cover-placeholder svg {
  width: var(--local-cover-icon-size, 20px);
  height: var(--local-cover-icon-size, 20px);
  display: block;
}
</style>
