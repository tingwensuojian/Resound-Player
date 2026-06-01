/**
 * useApiQuery — TanStack Query 桥接 composable
 *
 * 在 @tanstack/vue-query 和现有 apiCache 持久化层之间建立桥梁。
 * 实现方案 A：保留现有架构，渐进式引入 TanStack Query。
 *
 * 设计原则：
 * - 查询逻辑完全由 TanStack Query 管理（去重、SWR、状态机）
 * - 持久化层复用现有 apiCache（MemoryBackend / ElectronFileBackend）
 * - 初始数据从 apiCache 恢复，请求成功后写回 apiCache
 * - 共享 requestDedup 作为额外去重保障
 *
 * @example
 * ```ts
 * const { data, isPending, error } = useApiQuery({
 *   queryKey: ['playlist', id],
 *   queryFn: () => getPlaylistDetail(id),
 *   ttl: 'ENTITY',
 * })
 * ```
 */
import { useQuery, type UseQueryReturnType } from '@tanstack/vue-query';
import { computed, toValue, type Ref } from 'vue';
import { apiCache, CACHE_TTL } from '../stores/apiCache';
import { dedup } from '../utils/requestDedup';
import { useUserStore } from '../stores/user';

// ── 类型 ──

export type CacheTtlLevel = keyof typeof CACHE_TTL;

export interface UseApiQueryOptions<T> {
  /** TanStack Query key（必须是可序列化的数组） */
  queryKey: readonly unknown[];
  /** 异步请求函数 */
  queryFn: () => Promise<T>;
  /** 缓存 TTL 级别，或自定义毫秒数。默认 LIST */
  ttl?: CacheTtlLevel | number;
  /** 是否启用，默认 true */
  enabled?: boolean | Ref<boolean>;
  /** 一次性数据：缓存命中后不发起后台刷新 */
  immutable?: boolean;
  /** 暂停 apiCache 持久化桥接（默认 false） */
  noPersist?: boolean;
  /** 成功后回调 */
  onSuccess?: (data: T) => void;
  /** 失败后回调 */
  onError?: (err: Error) => void;
}

// ── TTL 映射 ──

function resolveTtl(ttl?: CacheTtlLevel | number): {
  staleTime: number;
  gcTime: number;
  persistTtl: number;
} {
  if (ttl === undefined || ttl === 'LIST') {
    return {
      staleTime: 3 * 60 * 1000,   // 3min 新鲜期
      gcTime: CACHE_TTL.LIST,      // 10min 保留
      persistTtl: CACHE_TTL.LIST,
    };
  }
  if (ttl === 'ENTITY') {
    return {
      staleTime: 5 * 60 * 1000,   // 5min 新鲜期
      gcTime: CACHE_TTL.ENTITY,    // 30min 保留
      persistTtl: CACHE_TTL.ENTITY,
    };
  }
  if (ttl === 'LIST_VOLATILE') {
    return {
      staleTime: 60 * 1000,       // 1min 新鲜期
      gcTime: CACHE_TTL.LIST_VOLATILE, // 5min 保留
      persistTtl: CACHE_TTL.LIST_VOLATILE,
    };
  }
  if (ttl === 'NONE') {
    return {
      staleTime: 0,
      gcTime: 0,
      persistTtl: 0,
    };
  }
  // 自定义毫秒
  return {
    staleTime: Math.round(ttl / 2),
    gcTime: ttl,
    persistTtl: ttl,
  };
}

// ── 将 queryKey 序列化为 apiCache 的字符串 key ──

function serializeKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(toValue(queryKey));
}

// ── useApiQuery ──

export function useApiQuery<T>(
  options: UseApiQueryOptions<T>,
): UseQueryReturnType<T, Error> {
  const {
    queryKey,
    queryFn,
    ttl,
    enabled = true,
    immutable = false,
    noPersist = false,
    onSuccess,
    onError,
  } = options;

  const userStore = useUserStore();
  const { staleTime, gcTime, persistTtl } = resolveTtl(ttl);

  // 构建含用户 ID 的持久化 key（透传 apiCache 的用户隔离）
  const fullKey = computed(() => {
    const sk = serializeKey(queryKey);
    const uid = userStore.state.isLogin ? userStore.state.profile?.userId : undefined;
    return uid ? `${sk}@${uid}` : sk;
  });

  // 从 apiCache 读取初始数据
  function hydrateFromCache(): T | undefined {
    const cached = apiCache.get(fullKey.value);
    return (cached?.data as T) ?? undefined;
  }

  function hydrateTimestamp(): number {
    const cached = apiCache.get(fullKey.value);
    return cached?.timestamp ?? 0;
  }

  const query = useQuery<T, Error>({
    queryKey: computed(() => [...toValue(queryKey), userStore.state.isLogin ? userStore.state.profile?.userId : undefined].filter(Boolean)),

    queryFn: async () => {
      const result = await dedup(serializeKey(toValue(queryKey)), queryFn);

      // 成功获取后写入 apiCache（持久化）
      if (!noPersist && persistTtl > 0 && result !== undefined) {
        apiCache.set(fullKey.value, result, persistTtl);
      }

      return result;
    },

    staleTime: immutable ? Infinity : staleTime,
    gcTime: immutable ? Infinity : gcTime,

    // 从 apiCache 恢复初始数据，实现刷新不丢失
    initialData: hydrateFromCache,
    initialDataUpdatedAt: hydrateTimestamp,

    enabled: computed(() => (typeof enabled === 'boolean' ? enabled : enabled.value)),

    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

    meta: { onSuccess, onError },
  });

  return query;
}

/**
 * ============================================================
 *  使用示例（渐进式迁移）
 * ============================================================
 *
 * ██ 新代码直接使用 useApiQuery
 *
 *   ```ts
 *   import { useApiQuery } from '../composables/useApiQuery'
 *
 *   const { data, isPending, error, refetch } = useApiQuery({
 *     queryKey: ['album', props.albumId],
 *     queryFn: () => getAlbumDetail(props.albumId),
 *     ttl: 'ENTITY',
 *   })
 *
 *   const album = computed(() => data.value?.data?.album)
 *   ```
 *
 * ██ 旧代码（useApiData）无需改动，两者共存
 *
 *   useApiData 继续正常工作，不受影响。
 *   新增页面的数据获取统一走 useApiQuery。
 *
 * ██ 迁移路径
 *
 *   1. 新组件 → useApiQuery
 *   2. 需要 SWR + 自动去重 + 缓存失效的复杂场景 → useApiQuery
 *   3. 简单场景 → useApiData 保留
 *   4. 全部替换后，可将 useApiData 标记为 @deprecated
 *
 * ██ useApiQuery 返回值（来自 @tanstack/vue-query useQuery）
 *
 *   - data         : Ref<T | undefined>  响应式数据
 *   - isPending    : Ref<boolean>         是否首次加载中
 *   - isLoading    : Ref<boolean>         是否加载中（含后台刷新）
 *   - isFetching   : Ref<boolean>         是否正在发请求
 *   - error        : Ref<Error | null>    错误对象
 *   - refetch      : () => void           强制刷新
 *   - isStale      : Ref<boolean>         数据是否过期
 *   - fetchStatus  : Ref<string>          请求状态
 */
