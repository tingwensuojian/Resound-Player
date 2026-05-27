// 音源替换 API 封装 + 异常降级
// 桌面端优先走 Electron 原生桥，不可用或无结果时回落到独立 HTTP 服务。

import { platform } from '../utils/platform';

function getMatchServerBaseUrl(): string {
  return platform.unblockMatchUrl.replace(/\/+$/, '');
}

const HEALTH_TIMEOUT = 3000;       // 健康检查超时 3s
const HEALTH_COOLDOWN = 60_000;    // 标记不可用后 60s 重试
const MAX_FAILURES = 3;            // 连续 3 次失败标记不可用

export interface UnblockMatchResult {
  url: string | null;
  source: string | null;
  br: number;
  size: number;
  errors?: string[];
}

// ---- 服务器健康状态管理 ----
let _serverAvailable: boolean | null = null; // null=未检测, true=可用, false=不可用
let _failureCount = 0;
let _lastCheck = 0;

/** 快速判断匹配能力是否可用（不发起网络请求） */
export function isUnblockAvailable(): boolean {
  if (platform.hasNativeUnblockBridge) return true;
  if (_serverAvailable === null) return true; // 尚未检测，乐观认为可用
  return _serverAvailable;
}

/** 检测服务器健康（可定期调用） */
export async function checkUnblockHealth(): Promise<boolean> {
  // 桌面端：先检查 native bridge
  if (platform.hasNativeUnblockBridge) {
    try {
      const nativeReady = await platform.unblockBridge!.isReady();
      if (nativeReady) return true;
    } catch {
      // fall through to HTTP check
    }
  }

  // 回落：走独立 match 服务 HTTP 接口
  const now = Date.now();
  if (now - _lastCheck < HEALTH_COOLDOWN && _serverAvailable !== null) {
    return _serverAvailable;
  }
  _lastCheck = now;

  try {
    const res = await fetch(`${getMatchServerBaseUrl()}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    });
    const ok = res.ok;
    _serverAvailable = ok;
    if (ok) _failureCount = 0;
    return ok;
  } catch {
    _serverAvailable = false;
    return false;
  }
}

/** 记录一次匹配失败，自动降级 */
function reportFailure() {
  _failureCount++;
  if (_failureCount >= MAX_FAILURES) {
    _serverAvailable = false;
    _lastCheck = Date.now();
    console.warn('[unblock] server marked unavailable after', MAX_FAILURES, 'failures, will retry in', HEALTH_COOLDOWN / 1000, 's');
  }
}

/** 主动恢复健康状态（外部调用，如用户切换音源时） */
export function resetUnblockHealth(): void {
  _serverAvailable = null;
  _failureCount = 0;
  _lastCheck = 0;
}

// ---- 匹配调用 ----

export async function tryUnblockMatch(id: number, sources: string[]): Promise<UnblockMatchResult> {
  const defaultResult: UnblockMatchResult = { url: null, source: null, br: 0, size: 0 };

  if (!id) return defaultResult;

  // 桌面端：优先走 native bridge
  if (platform.hasNativeUnblockBridge) {
    try {
      const result = await platform.unblockBridge!.matchSong(id, sources);
      if (result?.url) {
        _failureCount = 0;
        console.log('[unblock] native bridge matched: source=%s br=%d', result.source, result.br);
        return {
          url: result.url,
          source: result.source ?? 'unblock',
          br: result.br ?? 0,
          size: result.size ?? 0,
          errors: result.errors,
        };
      }
      // native bridge 无结果 → 继续走 HTTP 回落（不 return）
      console.log('[unblock] native bridge returned no URL, falling through to HTTP match server. errors:', result?.errors);
    } catch (err) {
      console.warn('[unblock] native bridge error, falling through to HTTP:', err);
      // fall through to HTTP
    }
  }

  // HTTP 独立 match 服务（Web 端唯一路径 / 桌面端回落路径）
  if (_serverAvailable === false) {
    return defaultResult;
  }

  try {
    const res = await fetch(
      `${getMatchServerBaseUrl()}/match?id=${id}&sources=${sources.join(',')}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      reportFailure();
      return defaultResult;
    }
    const result = await res.json() as UnblockMatchResult;
    if (!result?.url) {
      reportFailure();
    } else {
      _failureCount = 0; // 成功一次重置计数
      console.log('[unblock] HTTP match server matched: source=%s br=%d', result.source, result.br);
    }
    return result;
  } catch {
    reportFailure();
    return defaultResult;
  }
}
