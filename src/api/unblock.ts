// 音源替换 API 封装 + 异常降级
// 自动检测服务器健康状态，不可用时跳过匹配

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

/** 快速判断服务器是否可用（不发起网络请求） */
export function isUnblockAvailable(): boolean {
  if (_serverAvailable === null) return true; // 尚未检测，乐观认为可用
  return _serverAvailable;
}

/** 检测服务器健康（可定期调用） */
export async function checkUnblockHealth(): Promise<boolean> {
  // 冷却期内直接返回缓存状态
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

  // 快速失败：服务器已被标记不可用
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
    }
    return result;
  } catch {
    reportFailure();
    return defaultResult;
  }
}
