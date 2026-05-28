/**
 * useApiData — SWR 模式的数据获取组合式
 *
 * 统一管理 API 数据的获取、缓存、去重和刷新。
 * 遵循 SWR（stale-while-revalidate）策略：
 * - 缓存命中时立即返回旧数据，后台静默刷新
 * - 缓存未命中时发起请求，等待结果
 *
 * 身份相关字段（liked, subscribed）不依赖缓存，必须从 userStore 读取。
 *
 * @example
 * ```ts
 * const { data, loading, error } = useApiData(
 *   'playlist:123',
 *   () => getPlaylistDetail(123),
 *   { ttl: 600 }
 * )
 * ```
 */
import { computed, readonly, ref, unref, watch, type Ref } from 'vue';
import { apiCache, CACHE_TTL, type CacheEntry } from '../stores/apiCache';
import { dedup } from '../utils/requestDedup';
import { useUserStore } from '../stores/user';

export interface UseApiDataOptions<T> {
  /** 缓存 TTL（毫秒），默认使用缓存分组的默认 TTL */
  ttl?: number;
  /** 是否启用，默认 true。设为 false 时不发起请求，切换为 true 时自动加载 */
  enabled?: boolean | Ref<boolean>;
  /** 一次性数据，启用后缓存命中时不发起后台刷新 */
  immutable?: boolean;
  /** 获取成功回调 */
  onSuccess?: (data: T) => void;
  /** 获取失败回调 */
  onError?: (err: Error) => void;
}

export interface UseApiDataReturn<T> {
  /** 响应式数据 */
  data: Readonly<Ref<T | null>>;
  /** 是否正在加载（首次加载为 true，后台刷新仍为 true） */
  loading: Readonly<Ref<boolean>>;
  /** 错误信息 */
  error: Readonly<Ref<string>>;
  /** 强制刷新（跳过缓存） */
  refresh: () => Promise<void>;
  /** 本地乐观更新 data */
  mutate: (newData: T) => void;
}

export function useApiData<T>(
  cacheKey: string | (() => string),
  fetcher: () => Promise<T>,
  options?: UseApiDataOptions<T>,
): UseApiDataReturn<T> {
  const userStore = useUserStore();
  const {
    ttl,
    immutable = false,
    onSuccess,
    onError,
  } = options ?? {};

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref('');
  let loadToken = 0;
  const enabledRef = computed(() => Boolean(unref(options?.enabled ?? true)));

  function resetState(): void {
    data.value = null;
    loading.value = false;
    error.value = '';
  }

  /** 解析当前 cacheKey */
  function resolveKey(): string {
    return typeof cacheKey === 'function' ? cacheKey() : cacheKey;
  }

  /** 核心加载函数 */
  async function load(skipCache = false): Promise<void> {
    if (!enabledRef.value) {
      loadToken += 1;
      resetState();
      return;
    }

    const key = resolveKey();
    if (!key) {
      resetState();
      return;
    }

    const currentToken = ++loadToken;

    // 1. 检查缓存（非强制刷新时）
    if (!skipCache) {
      const cached = apiCache.get(key);
      if (cached) {
        data.value = cached.data as T;
        loading.value = false;
        error.value = '';

        // 一次性数据不再发起后台请求
        if (immutable) return;

        // SWR：后台静默刷新（不影响 loading 状态）
        const token = currentToken;
        try {
          const freshData = await dedup(key, fetcher);
          if (token === loadToken) {
            data.value = freshData as T;
            apiCache.set(key, freshData, ttl);
          }
        } catch {
          // 静默刷新失败不影响已有数据
        }
        return;
      }
    }

    // 2. 无缓存或强制刷新 → 发起请求
    loading.value = true;
    error.value = '';

    try {
      const result = await dedup(key, fetcher);
      if (currentToken === loadToken) {
        data.value = result as T;
        apiCache.set(key, result, ttl);
        onSuccess?.(result);
      }
    } catch (e: any) {
      if (currentToken === loadToken) {
        const msg = e?.message || String(e) || '请求失败';
        error.value = msg;
        onError?.(e);
      }
    } finally {
      if (currentToken === loadToken) {
        loading.value = false;
      }
    }
  }

  /** 强制刷新（跳过缓存） */
  async function refresh(): Promise<void> {
    if (!enabledRef.value) return;
    await load(true);
  }

  /** 乐观更新 */
  function mutate(newData: T): void {
    data.value = newData as T;
    const key = resolveKey();
    if (key) {
      apiCache.set(key, newData, ttl);
    }
  }

  // 监听 cacheKey / 登录态 / enabled 变化自动重新加载
  watch(
    [resolveKey, () => userStore.state.isLogin, enabledRef],
    ([newKey, , enabled]) => {
      if (!enabled) {
        loadToken += 1;
        resetState();
        return;
      }
      if (newKey) {
        load();
      } else {
        resetState();
      }
    },
    { immediate: true },
  );

  return {
    data: readonly(data) as Readonly<Ref<T | null>>,
    loading: readonly(loading) as Readonly<Ref<boolean>>,
    error: readonly(error) as Readonly<Ref<string>>,
    refresh,
    mutate,
  };
}
