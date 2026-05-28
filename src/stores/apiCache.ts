/**
 * API 响应缓存管理器
 *
 * 管理所有 API 调用的响应缓存，支持：
 * - 分组 TTL 配置（实体 / 列表 / 不缓存）
 * - LRU 淘汰
 * - 用户 ID 隔离（身份相关 API 自动追加 @${userId}）
 * - 桌面端持久化后端接口预留
 *
 * 架构原则：
 * - 只缓存身份无关的数据字段 (name, ar, al, picUrl...)
 * - 身份相关字段 (liked, subscribed) 必须从 userStore 读取
 * - 响应原始数据整个缓存，由调用方决定哪些字段可用
 */
import { computed, reactive } from 'vue';
import { useUserStore } from './user';
import { platform } from '../utils/platform';

// ---- 类型定义 ----

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  /** 最近一次访问时间，用于 LRU 淘汰。旧数据缺失时回退到 timestamp */
  lastAccessed: number;
}

// ---- 缓存后端接口（支持 Web / Electron 双平台） ----

export interface CacheBackend {
  get(key: string): CacheEntry | null;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

// ---- 内存后端（Web 端默认） ----

class MemoryBackend implements CacheBackend {
  private cache = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ---- Electron 文件后端（桌面端持久化） ----

class ElectronFileBackend implements CacheBackend {
  private cache = new Map<string, CacheEntry>();
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private async loadFromDisk() {
    try {
      const raw = await window.appEnv?.cacheApi?.getItem();
      if (!raw) return;
      const all = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(all)) {
        if (now - entry.timestamp <= entry.ttl) {
          // 兼容旧数据：缺失 lastAccessed 时回退到 timestamp
          if (!entry.lastAccessed) entry.lastAccessed = entry.timestamp;
          this.cache.set(key, entry);
        }
      }
    } catch {
      // ignore: cold start or corrupted file
    }
  }

  /** 立即写入磁盘 */
  private persistToDisk() {
    try {
      const all: Record<string, CacheEntry> = {};
      for (const [key, entry] of this.cache) {
        all[key] = entry;
      }
      const json = JSON.stringify(all);
      if (json.length > 4 * 1024 * 1024) {
        const sorted = [...this.cache.entries()]
          .sort(([, a], [, b]) => (b.lastAccessed ?? b.timestamp) - (a.lastAccessed ?? a.timestamp))
          .slice(0, 300);
        this.cache.clear();
        for (const [k, v] of sorted) this.cache.set(k, v);
        const slim: Record<string, CacheEntry> = {};
        for (const [k, v] of sorted) slim[k] = v;
        window.appEnv?.cacheApi?.setItem(JSON.stringify(slim));
      } else {
        window.appEnv?.cacheApi?.setItem(json);
      }
    } catch {
      // ignore persistence failure
    }
  }

  /** 防抖写入（2s 合并多次写入） */
  persistDebounced() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this.persistToDisk();
    }, 2000);
  }

  /** 应用退出前强制写入 */
  flushPending() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
      this.persistToDisk();
    }
  }

  get(key: string): CacheEntry | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
    this.persistDebounced();
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.persistDebounced();
  }

  clear(): void {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    this.cache.clear();
    window.appEnv?.cacheApi?.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ---- TTL 配置 ----

export const CACHE_TTL = {
  /** 实体数据：歌曲、专辑、歌手详情 */
  ENTITY: 30 * 60 * 1000,
  /** 列表数据：歌单详情、排行榜 */
  LIST: 10 * 60 * 1000,
  /** 高频变动列表：精品歌单推荐 */
  LIST_VOLATILE: 5 * 60 * 1000,
  /** 不缓存 */
  NONE: 0,
} as const;

/** 分组最大条数 */
export const CACHE_MAX = {
  ENTITY: 500,
  LIST: 200,
  LIST_SMALL: 50,
} as const;

type CacheBucket = {
  name: string;
  max: number;
};

// ---- localStorage 持久化 ----

const LOCALSTORAGE_KEY = 'gm_api_cache_v1';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(data: Record<string, CacheEntry>) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const json = JSON.stringify(data);
      if (json.length > 4 * 1024 * 1024) {
        // 超过 4MB 只保留最近的 100 条
        const entries = Object.entries(data)
          .sort(([, a], [, b]) => (b.lastAccessed ?? b.timestamp) - (a.lastAccessed ?? a.timestamp))
          .slice(0, 100);
        const slim: Record<string, CacheEntry> = {};
        for (const [k, v] of entries) slim[k] = v;
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(slim));
      } else {
        localStorage.setItem(LOCALSTORAGE_KEY, json);
      }
    } catch {
      try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch {}
    }
  }, 2000);
}

/** 从 localStorage 恢复缓存到 MemoryBackend */
function hydrateFromStorage(backend: MemoryBackend) {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(all)) {
      if (now - entry.timestamp <= entry.ttl) {
        // 兼容旧数据：缺失 lastAccessed 时回退到 timestamp
        if (!entry.lastAccessed) entry.lastAccessed = entry.timestamp;
        (backend as any).cache.set(key, entry);
      }
    }
  } catch {
    try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch {}
  }
}

/** 从 MemoryBackend 收集所有未过期条目并持久化 */
function persistFromMemoryBackend(backend: MemoryBackend) {
  const now = Date.now();
  const map = (backend as any).cache as Map<string, CacheEntry>;
  const all: Record<string, CacheEntry> = {};
  for (const [key, entry] of map) {
    if (now - entry.timestamp <= entry.ttl) {
      all[key] = entry;
    }
  }
  schedulePersist(all);
}

// ---- 辅助函数 ----

/** 判断 API 返回数据中是否可能包含身份相关字段 */
const USER_SCOPED_API_PREFIXES = [
  'song:',
  'playlist:',
  'album:',
  'artist:',
  'podcast:',
];

function needsUserScope(key: string): boolean {
  return USER_SCOPED_API_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** 构造完整缓存 key，追加用户 ID 隔离 */
export function buildCacheKey(baseKey: string): string {
  if (!needsUserScope(baseKey)) return baseKey;
  const userStore = useUserStore();
  const uid = userStore.state.isLogin ? userStore.state.profile?.userId : undefined;
  return uid ? `${baseKey}@${uid}` : baseKey;
}

function stripUserScopeSuffix(key: string): string {
  const at = key.lastIndexOf('@');
  if (at < 0) return key;
  const suffix = key.slice(at + 1);
  return /^\d+$/.test(suffix) ? key.slice(0, at) : key;
}

function resolveCacheBucket(key: string): CacheBucket {
  const rawKey = stripUserScopeSuffix(key);
  if (rawKey.startsWith('song:')) return { name: 'song', max: CACHE_MAX.ENTITY };
  if (rawKey.startsWith('album:')) return { name: 'album', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('artist:')) return { name: 'artist', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('podcast:')) return { name: 'podcast', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('playlist:highquality:')) return { name: 'playlist:highquality', max: CACHE_MAX.LIST_SMALL };
  if (rawKey.startsWith('playlist:list:')) return { name: 'playlist:list', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('playlist:')) return { name: 'playlist', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('toplist:')) return { name: 'toplist', max: CACHE_MAX.LIST_SMALL };
  if (rawKey.startsWith('mv:list:')) return { name: 'mv:list', max: CACHE_MAX.LIST_SMALL };
  if (rawKey.startsWith('lang:playlist:')) return { name: 'lang:playlist', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('daily:')) return { name: 'daily', max: CACHE_MAX.LIST };
  if (rawKey.startsWith('radar:')) return { name: 'radar', max: CACHE_MAX.LIST };
  return { name: 'default', max: CACHE_MAX.LIST };
}

// ---- 定时清理 ----

const CLEANUP_INTERVAL = 60 * 1000; // 60s

// ---- Store ----

export const apiCache = reactive({
  /** 当前缓存后端实例 */
  _backend: null as CacheBackend | null,

  /** 最近一次清理的时间戳 */
  _lastCleanup: 0,

  /** 总条目数 */
  get size(): number {
    return this._backend?.size() ?? 0;
  },

  init() {
    // 自动检测平台，选择合适后端
    this._backend = platform.isDesktop ? new ElectronFileBackend() : new MemoryBackend();
    // Web 端 MemoryBackend 从 localStorage 恢复缓存（刷新后不丢失）
    if (this._backend instanceof MemoryBackend) {
      hydrateFromStorage(this._backend);
    }
    this._startCleanup();
  },

  /**
   * 注入自定义后端（供桌面端 Electron 持久化使用）
   */
  setBackend(backend: CacheBackend) {
    this._backend = backend;
  },

  /** 读取缓存 */
  get(key: string): CacheEntry | null {
    const fullKey = buildCacheKey(key);
    const entry = this._backend?.get(fullKey) ?? null;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this._backend?.delete(fullKey);
      return null;
    }
    // LRU：更新 lastAccessed 并重新 set
    const now = Date.now();
    entry.lastAccessed = now;
    this._backend?.delete(fullKey);
    this._backend?.set(fullKey, entry);
    return entry;
  },

  /** 是否有未过期的缓存 */
  has(key: string): boolean {
    return this.get(key) !== null;
  },

  /** 写入缓存 */
  set(key: string, data: any, ttl: number = CACHE_TTL.LIST): void {
    const fullKey = buildCacheKey(key);
    const now = Date.now();
    this._backend?.delete(fullKey); // 先删后插，确保 LRU 顺序
    this._backend?.set(fullKey, {
      data,
      timestamp: now,
      ttl,
      lastAccessed: now,
    });
    // 内存后端同步到 localStorage
    if (this._backend instanceof MemoryBackend) {
      persistFromMemoryBackend(this._backend);
    }
  },

  /** 删除单条缓存 */
  delete(key: string): void {
    const fullKey = buildCacheKey(key);
    this._backend?.delete(fullKey);
    if (this._backend instanceof MemoryBackend) {
      persistFromMemoryBackend(this._backend);
    }
  },

  /** 清除所有缓存 */
  clearAll(): void {
    this._backend?.clear();
    try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch {}
  },

  /** 清除当前用户作用域的缓存（含 @${userId} 的 key） */
  clearUserScoped(): void {
    const userStore = useUserStore();
    const uid = userStore.state.isLogin ? userStore.state.profile?.userId : undefined;
    if (!uid) return;
    const suffix = `@${uid}`;
    // MemoryBackend 和 ElectronFileBackend 都有内部 Map，可枚举
    const map = (this._backend as any)?.cache as Map<string, CacheEntry> | undefined;
    if (map) {
      let changed = false;
      for (const key of [...map.keys()]) {
        if (key.includes(suffix)) {
          map.delete(key);
          changed = true;
        }
      }
      if (changed) {
        if (this._backend instanceof MemoryBackend) {
          persistFromMemoryBackend(this._backend);
        } else if (this._backend instanceof ElectronFileBackend) {
          this._backend.persistDebounced();
        }
      }
    } else {
      // 未知后端：保守清除全部
      this._backend?.clear();
    }
  },

  /** 清理过期条目 + LRU 容量淘汰 */
  _runCleanup() {
    if (!this._backend) return;
    const now = Date.now();
    if (now - this._lastCleanup < CLEANUP_INTERVAL) return;
    this._lastCleanup = now;

    const map = (this._backend as any)?.cache as Map<string, CacheEntry> | undefined;
    if (!map) return;

    // 1. 清理过期条目
    for (const [key, entry] of map) {
      if (now - entry.timestamp > entry.ttl) {
        map.delete(key);
      }
    }

    // 2. CACHE_MAX 容量淘汰：按缓存族分别执行 LRU，避免全局 500 条误删
    const bucketed = new Map<string, { max: number; entries: [string, CacheEntry][] }>();
    for (const [key, entry] of map.entries()) {
      const bucket = resolveCacheBucket(key);
      const group = bucketed.get(bucket.name);
      if (group) {
        group.entries.push([key, entry]);
      } else {
        bucketed.set(bucket.name, { max: bucket.max, entries: [[key, entry]] });
      }
    }
    for (const { max, entries } of bucketed.values()) {
      if (entries.length <= max) continue;
      const toRemove = entries
        .sort(([, a], [, b]) => (a.lastAccessed ?? a.timestamp) - (b.lastAccessed ?? b.timestamp))
        .slice(0, entries.length - max);
      for (const [key] of toRemove) {
        map.delete(key);
      }
    }

    // 3. 持久化
    if (this._backend instanceof MemoryBackend) {
      persistFromMemoryBackend(this._backend);
    } else if (this._backend instanceof ElectronFileBackend) {
      this._backend.persistDebounced();
    }
  },

  _startCleanup() {
    setInterval(() => {
      this._runCleanup();
    }, CLEANUP_INTERVAL);
  },

  /** 应用退出前强制写入（供 before-quit 调用） */
  flushPending() {
    if (this._backend instanceof ElectronFileBackend) {
      this._backend.flushPending();
    }
  },
});
