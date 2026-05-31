import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

export function useBackToTop(options: {
  scrollHostSelector?: string | (() => string | undefined);
  threshold?: number;
  scrollStopDelay?: number;
} = {}): {
  visible: Ref<boolean>;
  progress: Ref<number>;
  scrolling: Ref<boolean>;
  scrollToTop: () => void;
  refresh: () => void;
} {
  const {
    scrollHostSelector = '.content',
    threshold = 400,
    scrollStopDelay = 1500,
  } = options;

  const visible = ref(false);
  const progress = ref(0);
  const scrolling = ref(false);

  let scrollHost: HTMLElement | null = null;
  let rafId = 0;
  let scrollStopTimerId: ReturnType<typeof setTimeout> | undefined;

  function resolveSelector(): string {
    if (typeof scrollHostSelector === 'function') {
      return scrollHostSelector() || '.content';
    }
    return scrollHostSelector;
  }

  function getScrollHost(): HTMLElement | null {
    return document.querySelector(resolveSelector()) as HTMLElement | null;
  }

  function scrollToTop(): void {
    const host = scrollHost;
    if (!host) return;
    host.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function update(): void {
    const host = scrollHost;
    if (!host) return;
    const st = host.scrollTop;
    const maxScroll = Math.max(1, host.scrollHeight - host.clientHeight);
    visible.value = st >= threshold && scrolling.value;
    progress.value = maxScroll > 0 ? Math.min(1, st / maxScroll) : 0;
  }

  function resetScrollStopTimer(): void {
    if (scrollStopTimerId !== undefined) clearTimeout(scrollStopTimerId);
    scrolling.value = true;
    scrollStopTimerId = setTimeout(() => {
      scrolling.value = false;
      update();
    }, scrollStopDelay);
  }

  function onScroll(): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      update();
      resetScrollStopTimer();
    });
  }

  function refresh(): void {
    scrollHost = getScrollHost();
    update();
  }

  onMounted(() => {
    requestAnimationFrame(() => {
      scrollHost = getScrollHost();
      if (scrollHost) {
        scrollHost.addEventListener('scroll', onScroll, { passive: true });
        update();
      }
    });
  });

  onBeforeUnmount(() => {
    if (scrollHost) {
      scrollHost.removeEventListener('scroll', onScroll);
    }
    cancelAnimationFrame(rafId);
    if (scrollStopTimerId !== undefined) clearTimeout(scrollStopTimerId);
  });

  return { visible, progress, scrolling, scrollToTop, refresh };
}
