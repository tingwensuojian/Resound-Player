<template>
  <AnimatedAppear
    tag="section"
    variant="content"
    rhythm="shell"
    class-name="playlist-detail-page"
    :class="{ 'playlist-detail-page--embedded': embedded }"
  >
    <!-- Loading State -->
    <template v-if="loading && !ready">
      <div class="hero-loading">
        {{ loadingText || '加载中…' }}
      </div>
    </template>

    <!-- Error State -->
    <template v-else-if="error">
      <div class="hero-error">{{ error }}</div>
    </template>

    <!-- Ready State -->
    <template v-else-if="ready">
      <!-- 单个滚动容器：hero 自然滚动离开，sticky-bar 停留在顶 -->
      <div ref="scrollHostRef" class="detail-scroll-host">
        <!-- Hero Section — 文档流块级元素，自然滚动离开 -->
        <section class="hero-section" ref="heroRef" :style="heroBgStyle">
          <!-- 背景模糊层（仅视觉） -->
          <div
            v-if="coverBlurUrl"
            class="hero-section-bg"
            :style="{ backgroundImage: `url(${coverBlurUrl})` }"
          ></div>

          <div class="hero-layout">
            <div class="hero-media">
              <slot name="media" />
            </div>
            <div class="hero-info">
              <div class="hero-title">
                <slot name="title" />
              </div>
              <div class="hero-meta">
                <slot name="meta" />
              </div>
              <div class="hero-actions">
                <slot name="actions" />
              </div>
            </div>
          </div>

          <!-- 底部渐变 fade -->
          <div class="hero-fade"></div>
        </section>

        <!-- Sticky Bar — position: sticky，在滚动容器内生效 -->
        <header
          class="sticky-bar"
          :class="{ 'sticky-bar--raised': barRaised }"
        >
          <img
            v-if="coverThumbUrl"
            class="bar-thumb"
            :src="coverThumbUrl"
            alt=""
          />
          <h2 class="bar-title">{{ barTitleText }}</h2>
          <div class="bar-actions">
            <slot name="bar-action" />
          </div>
        </header>

        <!-- 内容区域 -->
        <AnimatedAppear
          tag="div"
          variant="content"
          rhythm="body"
          class-name="playlist-detail-body"
        >
          <!-- Tabs（在 content 上方） -->
          <div v-if="$slots.tabs" class="hero-tabs-area">
            <slot name="tabs" />
          </div>

          <!-- 主体内容 -->
          <slot name="content" />
        </AnimatedAppear>
      </div>
      <slot />
    </template>
    <!-- Fallback: no matching state -->
    <template v-else>
      <div style="padding:40px;text-align:center;color:red;font-size:24px;">
        {{ loadingText || '加载中…' }}
      </div>
    </template>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AnimatedAppear from './AnimatedAppear.vue'
import { useHeroScrollAway } from '../composables/useHeroScrollAway'
import { generateBlurredBg } from '../utils/image'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    loading?: boolean
    ready?: boolean
    error?: string
    loadingText?: string
    coverUrl?: string
    /** Bar 中显示的标题（无 title slot 时的后备） */
    barTitle?: string
  }>(),
  {
    embedded: false,
    loading: false,
    ready: false,
    error: '',
    loadingText: '加载中…',
    coverUrl: '',
    barTitle: '',
  },
)

// Hero ref for IO observation
const heroRef = ref<HTMLElement | null>(null)

// Scroll away composable
const { barRaised, scrollHostRef } = useHeroScrollAway(heroRef)

// Cover thumbnail for bar (lower res)
const coverThumbUrl = computed(() => {
  if (!props.coverUrl) return ''
  return props.coverUrl.includes('?')
    ? props.coverUrl + '&param=64y64'
    : props.coverUrl + '?param=64y64'
})

// Bar title text
const barTitleText = computed(() => props.barTitle || '')

// Blur background generation
const coverBlurUrl = ref('')
watch(
  () => props.coverUrl,
  (url) => {
    if (url?.trim()) {
      generateBlurredBg(url.trim(), { blurRadius: 10, saturation: 1.32, maxWidth: 200 })
        .then((dataUrl) => {
          coverBlurUrl.value = dataUrl
        })
        .catch(() => {
          coverBlurUrl.value = ''
        })
    } else {
      coverBlurUrl.value = ''
    }
  },
  { immediate: true },
)

// Hero background style (palette-based gradient)
const heroBgStyle = computed(() => {
  return {}
})

// Expose scroll host ref for virtual lists in parent pages
defineExpose({ scrollHostRef })
</script>

<style>
@import '../styles/hero-shell.css';
</style>

<style scoped>
/* 组件级样式：确保 AnimatedAppear 内空隙 */
.hero-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-soft);
  font-size: var(--text-label-md);
}

.hero-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--danger);
  font-size: var(--text-label-md);
}

.state {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-soft);
}

.state.error {
  color: var(--danger);
}
</style>
