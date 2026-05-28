import {
  onMounted,
  onBeforeUnmount,
  nextTick,
  type ComputedRef,
  type ComponentPublicInstance,
  type Ref,
  watch,
} from 'vue';

/**
 * 详情页吸顶栏统一状态管理。
 *
 * 所有配置集中于此 composable：
 * - `scrollHost` 优先使用 `.detail-scroll-host`（详情页内部滚动容器）
 * - 同时阻止 `.content` 竞争滚动容器（设置 overflow: hidden，卸载时恢复）
 * - `stickyClassTarget` 固定为 `.playlist-detail-header-wrap`
 * - 自动同步 `--cover-bg-url` 到 `.content`（提供 blur 背景）
 * - 自动清理所有副作用（scroll event、CSS 变量、sticky class）
 *
 * @param coverUrl 可选，封面 URL 的 ComputedRef，用于自动同步 blur 背景
 * @param options 可选，支持显式传入详情页根节点与滚动宿主，避免多页面并存时串绑监听
 */
type DetailStickyTarget = HTMLElement | ComponentPublicInstance | null;

type UseDetailStickyStateOptions = {
  embedded?: boolean;
  rootRef?: Ref<DetailStickyTarget>;
  scrollHostRef?: Ref<HTMLElement | null>;
};

export function useDetailStickyState(
  coverUrl?: ComputedRef<string>,
  options: boolean | UseDetailStickyStateOptions = false,
): { refresh: () => void } {
  const normalizedOptions =
    typeof options === 'boolean'
      ? { embedded: options }
      : options;
  const embedded = normalizedOptions.embedded === true;
  const SCROLL_HOST_SELECTOR = embedded ? '.detail-panel' : '.playlist-detail-page';
  const HEADER_WRAP_SELECTOR = '.playlist-detail-header-wrap';
  let rafId = 0;
  let scrollHost: HTMLElement | null = null;
  let rootElement: HTMLElement | null = null;
  let detailPanelElement: HTMLElement | null = null;
  const PROGRESS_DISTANCE = embedded ? 120 : 324;
  let lastRootProgress = -1;
  let lastPanelProgress = -1;

  function resolveElement(target?: DetailStickyTarget): HTMLElement | null {
    if (!target) return null;
    if (target instanceof HTMLElement) return target;
    const maybeEl = (target as ComponentPublicInstance).$el;
    return maybeEl instanceof HTMLElement ? maybeEl : null;
  }

  function getRootElement(): HTMLElement | null {
    return resolveElement(normalizedOptions.rootRef?.value)
      || (document.querySelector('.playlist-detail-page') as HTMLElement | null);
  }

  function getScrollHost(): HTMLElement | null {
    return normalizedOptions.scrollHostRef?.value
      || (getRootElement()?.querySelector('.detail-scroll-host') as HTMLElement | null)
      || (document.querySelector(SCROLL_HOST_SELECTOR) as HTMLElement | null);
  }

  function update(force = false): void {
    const host = scrollHost || getScrollHost();
    const root = getRootElement();
    if (!host || !root) return;
    const st = host.scrollTop;
    const progress = Math.max(0, Math.min(1, st / PROGRESS_DISTANCE));
    writeStickyProgress(root, progress, 'root', force);
    if (embedded && detailPanelElement) {
      writeStickyProgress(detailPanelElement, progress, 'panel', force);
    }
    syncBlurOpacity(progress);
    syncStickyClass(root, progress);
  }

  function writeStickyProgress(
    target: HTMLElement,
    progress: number,
    channel: 'root' | 'panel',
    force = false,
  ): void {
    const lastProgress = channel === 'root' ? lastRootProgress : lastPanelProgress;
    const delta = Math.abs(progress - lastProgress);
    if (!force && delta < 0.005) return;
    if (channel === 'root') {
      lastRootProgress = progress;
    } else {
      lastPanelProgress = progress;
    }
    target.style.setProperty('--sticky-progress', String(progress));
  }

  /** 同步 content::before blur 的透明度 */
  function syncBlurOpacity(progress: number): void {
    const contentEl = document.querySelector('.content') as HTMLElement | null;
    if (contentEl) {
      const blurOpacity = Math.max(0, 1 - progress * 1.5);
      contentEl.style.setProperty('--blur-opacity', String(blurOpacity));
    }
  }

  /** 同步 is-sticky-header class */
  function syncStickyClass(root: HTMLElement, progress: number): void {
    const target = root.querySelector(HEADER_WRAP_SELECTOR) as HTMLElement | null;
    if (!target) return;
    target.classList.toggle('is-sticky-header', progress >= 0.998);
  }

  function onScroll(): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => update());
  }

  function normalizeWheelDelta(event: WheelEvent, axis: 'x' | 'y'): number {
    const raw = axis === 'x' ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return raw * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const host = scrollHost || getScrollHost();
      return raw * (host?.clientHeight || window.innerHeight || 0);
    }
    return raw;
  }

  function onRootWheel(event: WheelEvent): void {
    const host = scrollHost || getScrollHost();
    const root = rootElement || getRootElement();
    if (!host || !root || event.defaultPrevented || event.ctrlKey) return;
    const target = event.target as Node | null;
    if (!target || host.contains(target)) return;

    const deltaY = normalizeWheelDelta(event, 'y');
    const deltaX = normalizeWheelDelta(event, 'x');
    if (deltaX === 0 && deltaY === 0) return;

    event.preventDefault();
    if (deltaX !== 0) host.scrollLeft += deltaX;
    if (deltaY !== 0) host.scrollTop += deltaY;
  }

  /**
   * 自动同步封面图到 `.content`，供 `content::before` blur 使用。
   * 页面销毁时自动清理 `--cover-bg-url`，避免残留到下一个详情页。
   */
  if (coverUrl) {
    watch(coverUrl, (url) => {
      const el = document.querySelector('.content') as HTMLElement | null;
      if (!el) return;
      if (url?.trim()) {
        el.style.setProperty('--cover-bg-url', `url("${url.trim()}")`);
      } else {
        el.style.removeProperty('--cover-bg-url');
      }
    }, { immediate: true });
  }

  function refresh(): void {
    nextTick(() => {
      scrollHost = getScrollHost();
      if (scrollHost) {
        scrollHost.scrollTop = 0;
      }
      update(true);
    });
  }

  onMounted(() => {
    requestAnimationFrame(() => {
      rootElement = getRootElement();
      detailPanelElement = embedded
        ? (rootElement?.closest('.detail-panel') as HTMLElement | null)
        : null;
      scrollHost = getScrollHost();
      if (scrollHost) {
        // 阻止 .content 竞争滚动容器，确保详情页内层滚动宿主是唯一滚动入口
        const contentEl = document.querySelector('.content') as HTMLElement | null;
        if (contentEl) {
          contentEl.style.overflow = 'hidden';
        }

        scrollHost.addEventListener('scroll', onScroll, { passive: true });
        rootElement?.addEventListener('wheel', onRootWheel, { passive: false });
        rootElement?.style.setProperty('--sticky-progress', '0');
        detailPanelElement?.style.setProperty('--sticky-progress', '0');
        update(true);
      }
    });
  });

  onBeforeUnmount(() => {
    scrollHost?.removeEventListener('scroll', onScroll);
    rootElement?.removeEventListener('wheel', onRootWheel);
    cancelAnimationFrame(rafId);
    // 恢复 .content 滚动能力
    const contentEl = document.querySelector('.content') as HTMLElement | null;
    if (contentEl) {
      contentEl.style.overflow = '';
    }
    // 清理 --sticky-progress
    getRootElement()?.style.removeProperty('--sticky-progress');
    detailPanelElement?.style.removeProperty('--sticky-progress');
    // 清理 blur opacity
    (document.querySelector('.content') as HTMLElement | null)?.style.removeProperty('--blur-opacity');
    // 清理 is-sticky-header class
    getRootElement()?.querySelector(HEADER_WRAP_SELECTOR)?.classList.remove('is-sticky-header');
    // 清理 --cover-bg-url（避免残留到下一个详情页）
    (document.querySelector('.content') as HTMLElement | null)?.style.removeProperty('--cover-bg-url');
    lastRootProgress = -1;
    lastPanelProgress = -1;
    detailPanelElement = null;
    rootElement = null;
  });

  return { refresh };
}
