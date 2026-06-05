// Electron 内置 unblock 匹配能力
// 把 match 逻辑从独立 HTTP 服务收敛进主进程，渲染层可通过 IPC 直接调用，
// 而不是必须依赖单独的 unblock-match 服务。

import process from 'node:process';

let matchModulePromise = null;
let ready = false;

function getEffectiveSources(sources) {
  if (Array.isArray(sources) && sources.length) return sources.filter(Boolean);
  return (process.env.UNBLOCK_SOURCES || 'bodian,kugou,migu,qq,bilibili').split(',').filter(Boolean);
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function initNativeUnblockMatch({ sources, proxyUrl } = {}) {
  if (matchModulePromise) return ready;
  global.source = getEffectiveSources(sources);
  const resolvedProxy = proxyUrl || process.env.UNBLOCK_PROXY_URL;
  if (resolvedProxy) {
    try { global.proxy = new URL(resolvedProxy); } catch {}
  }
  global.cnrelay = process.env.UNBLOCK_CNRELAY || global.cnrelay || null;

  matchModulePromise = import('@unblockneteasemusic/server').catch((err) => {
    console.error('[unblock-native-match] module import failed:', err.message);
    matchModulePromise = null;
    ready = false;
    throw err;
  });
  const mod = await matchModulePromise;
  if (typeof mod?.default !== 'function') {
    console.error('[unblock-native-match] unexpected module shape:', {
      type: typeof mod,
      defaultType: typeof mod?.default,
      keys: mod ? Object.keys(mod) : [],
    });
    matchModulePromise = null;
    ready = false;
    return false;
  }
  ready = true;
  console.log('[unblock-native-match] 内置匹配能力就绪 sources=%s', global.source.join(','));
  return ready;
}

export function isNativeUnblockMatchReady() {
  return ready;
}

export async function nativeUnblockMatchSong(id, sources) {
  if (!id) return { url: null, source: null, br: 0, size: 0, errors: [] };
  const mod = await (matchModulePromise || initNativeUnblockMatch({ sources }));
  if (!mod) return { url: null, source: null, br: 0, size: 0, errors: ['native match module unavailable'] };
  try {
    const effective = getEffectiveSources(sources);
    const matchFn = mod.default || mod;
    if (typeof matchFn !== 'function') {
      console.error('[unblock-native-match] matchFn is not a function:', typeof matchFn);
      return { url: null, source: null, br: 0, size: 0, errors: ['match function not found'] };
    }
    console.log('[unblock-native-match] matching song %d with sources: %s', id, effective.join(','));
    const result = await matchFn(id, effective);
    if (result?.url) {
      console.log('[unblock-native-match] ✓ matched song %d: source=%s br=%d', id, result.source, result.br);
    } else {
      console.log('[unblock-native-match] ✗ no match for song %d', id);
    }
    return {
      url: toStringOrNull(result?.url),
      source: toStringOrNull(result?.source),
      br: toNumber(result?.br),
      size: toNumber(result?.size),
      errors: [],
    };
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.warn('[unblock-native-match] match error for song %d: %s', id, errMsg);
    return { url: null, source: null, br: 0, size: 0, errors: [errMsg] };
  }
}
