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
const userStore = useUserStore();
import { platform } from '../utils/platform';

// ---- 类型定义 ----

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
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

  constructor() {
    this.loadFromDisk();
  }

  private async loadFromDisk() {
    try {
      const raw = await window.appEnv?.cacheApi?.getItem();
      if (!raw) return;
      const all = JSON.parse(raw) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(all)) {
        if (now - entry.timestamp <= entry.ttl) {
          this.cache.set(key, entry);
        }
      }
    } catch {
      // ignore: cold start or corrupted file
    }
  }

  private persistToDisk() {
    try {
      const all: Record<string, CacheEntry> = {};
      for (const [key, entry] of this.cache) {
        all[key] = entry;
      }
      const json = JSON.stringify(all);
      // Limit to ~4MB; trim oldest entries if too large
      if (json.length > 4 * 1024 * 1024) {
        const sorted = [...this.cache.entries()]
          .sort(([, a], [, b]) => b.timestamp - a.timestamp)
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

  get(key: string): CacheEntry | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
    this.persistToDisk();
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.persistToDisk();
  }

  clear(): void {
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
          .sort(([, a], [, b]) => b.timestamp - a.timestamp)
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
  const uid = userStore.state.isLogin ? userStore.state.profile?.userId : undefined;
  return uid ? `${baseKey}@${uid}` : baseKey;
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
    // LRU：重新 set 更新访问顺序
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
    this._backend?.delete(fullKey); // 先删后插，确保 LRU 顺序
    this._backend?.set(fullKey, {
      data,
      timestamp: Date.now(),
      ttl,
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
    const uid = userStore.state.isLogin ? userStore.state.profile?.userId : undefined;
    if (!uid) return;
    const suffix = `@${uid}`;
    // 不支持枚举所有 key 的后端（如 Electron 文件）需要整体清除
    // 内存后端支持枚举
    if (this._backend instanceof MemoryBackend) {
      const map = (this._backend as any).cache as Map<string, CacheEntry>;
      for (const key of map.keys()) {
        if (key.includes(suffix)) {
          map.delete(key);
        }
      }
      persistFromMemoryBackend(this._backend);
    } else {
      // 非内存后端保守清除全部
      this._backend?.clear();
    }
  },

  /** 清理过期条目 */
  _runCleanup() {
    if (!this._backend) return;
    const now = Date.now();
    if (now - this._lastCleanup < CLEANUP_INTERVAL) return;
    this._lastCleanup = now;

    if (this._backend instanceof MemoryBackend) {
      const map = (this._backend as any).cache as Map<string, CacheEntry>;
      for (const [key, entry] of map) {
        if (now - entry.timestamp > entry.ttl) {
          map.delete(key);
        }
      }
      persistFromMemoryBackend(this._backend);
    }
  },

  _startCleanup() {
    setInterval(() => {
      this._runCleanup();
    }, CLEANUP_INTERVAL);
  },
});