/**
 * useHeroScrollAway
 *
 * 最轻量的 IO composable：监测 hero 区域是否在视口内。
 * 仅 crossing 时执行 1 次回调，滚动中零 JS。
 *
 * 用法：
 *   const { barRaised, scrollHostRef } = useHeroScrollAway(heroRef)
 */
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export function useHeroScrollAway(heroRef: Ref<HTMLElement | null>) {
  const barRaised = ref(false)
  const scrollHostRef = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null
  let lastState: boolean | null = null

  function onIntersect([entry]: IntersectionObserverEntry[]) {
    // hero 不再可见 → bar 处于 raised 状态
    const raised = !entry.isIntersecting
    if (raised === lastState) return
    lastState = raised
    barRaised.value = raised
  }

  function init() {
    const el = heroRef.value
    if (!el) return

    observer = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: '0px',
      threshold: 0,
    })
    observer.observe(el)

    // 绑定 scroll host
    scrollHostRef.value = el.closest('.playlist-detail-page')
      ?.querySelector('.detail-scroll-host') as HTMLElement | null
  }

  onMounted(init)
  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { barRaised, scrollHostRef }
}
