/**
 * 播放 URL 决议器
 *
 * 纯函数模块，负责 fee 探测 → 音质计算 → 缓存命中 → unblock 匹配 → 代理回退的完整链路。
 * 不持有 playerStore 引用，所有输入通过 ResolveContext 传入。
 */

import { tryUnblockMatch } from '../api/unblock';

/* ── 音质等级常量（映射用户标签 → API level） ── */

const QUALITY_LEVELS: Record<string, string> = {
  '标准': 'standard',
  '较高': 'higher',
  '极高(HQ)': 'exhigh',
  '无损(SQ)': 'lossless',
  'Hi-Res': 'hires',
  '高清臻音': 'jyeffect',
  '高清环绕声': 'jyeffect',
  '沉浸环绕声': 'sky',
  '杜比全景声': 'dolby',
  '超清母带': 'jymaster',
};

/** 各音质等级的最低比特率阈值，低于此值判定为 API 静默降级 */
const QUALITY_MIN_BR: Record<string, number> = {
  'standard': 128000,
  'higher': 192000,
  'exhigh': 320000,
  'lossless': 800000,
  'hires': 1920000,
  'jyeffect': 1920000,
  'sky': 1920000,
  'dolby': 1920000,
  'jymaster': 1920000,
};

const QUALITY_FALLBACK_ORDER = [
  'jymaster',
  'dolby',
  'sky',
  'jyeffect',
  'hires',
  'lossless',
  'exhigh',
  'higher',
  'standard',
];

const QUALITY_LABEL_BY_LEVEL: Record<string, string> = {
  standard: '标准',
  higher: '较高',
  exhigh: '极高(HQ)',
  lossless: '无损(SQ)',
  hires: 'Hi-Res',
  jyeffect: '高清臻音',
  sky: '沉浸环绕声',
  dolby: '杜比全景声',
  jymaster: '超清母带',
};

const QUALITY_LEVEL_BY_LABEL = Object.fromEntries(
  Object.entries(QUALITY_LABEL_BY_LEVEL).map(([level, label]) => [label, level]),
) as Record<string, string>;

/** 需要 VIP 的音质 API level（免费用户不可请求） */
const VIP_ONLY_API_LEVELS = new Set([
  'lossless',
  'hires',
  'jyeffect',
  'sky',
  'dolby',
  'jymaster',
]);

/* ── 辅助函数 ── */

function toApiLevel(label: string): string {
  return QUALITY_LEVELS[label] || 'exhigh';
}

function formatQualityBr(br: number): string {
  if (br >= 1920000) return 'Hi-Res';
  if (br >= 999000) return '无损(SQ)';
  if (br >= 320000) return '极高(HQ)';
  if (br >= 192000) return '较高';
  if (br >= 128000) return '标准';
  return '';
}

function inferQualityLabel(level: string, br: number) {
  const levelLabel = QUALITY_LABEL_BY_LEVEL[level] || '';
  if (!levelLabel) return formatQualityBr(br);
  const minBr = QUALITY_MIN_BR[level] || 0;
  if (minBr > 0 && br > 0 && br < minBr) {
    return formatQualityBr(br) || levelLabel;
  }
  return levelLabel;
}

function getFallbackLevels(level: string) {
  const idx = QUALITY_FALLBACK_ORDER.indexOf(level);
  if (idx < 0) return [];
  return QUALITY_FALLBACK_ORDER.slice(idx + 1);
}

function canUseWebDlProxy() {
  return typeof location === 'undefined' || location.protocol !== 'file:';
}

async function fetchOfficialUrl(apiBaseUrl: string, trackId: number, level: string, loginCookie: string | undefined) {
  const qs = `id=${trackId}&level=${level}${loginCookie ? '&cookie=' + encodeURIComponent(loginCookie) : ''}`;
  const directRes = await fetch(`${apiBaseUrl}/song/url/v1?${qs}`, {
    signal: AbortSignal.timeout(8000),
  });
  const directData = await directRes.json();
  const item = Array.isArray(directData?.data) ? directData.data[0] : null;
  return {
    item,
    code: Number(item?.code || 0),
    fee: Number(item?.fee ?? 0),
    url: item?.url || '',
    br: Number(item?.br || 0),
    hasTrial: Boolean(item?.freeTrialInfo),
  };
}

/* ── 类型定义 ── */

export interface ResolveResult {
  /** 决议出的可播放 URL，空字符串表示无可用音源 */
  url: string
  /** 音源类型标识 */
  source: string
  /** 比特率 */
  br: number
  /** 是否发生音质降级 */
  isDowngraded: boolean
  /** 音质降级信息（降级时才非 null） */
  downgradeInfo: { from: string; to: string } | null
  /** 当前歌曲实际交付音质标签 */
  qualityLabel: string
}

export interface ResolveContext {
  trackId: number
  /** 用户偏好的音质标签（如 '极高(HQ)'） */
  defaultQuality: string
  /** 用户是否为 VIP */
  isVip: boolean
  /** 登录 cookie */
  loginCookie: string | undefined
  /** 是否启用 unblock 音源匹配 */
  unblockEnabled: boolean
  /** unblock 音源列表 */
  unblockSources: string[]
  /** API 后端 baseURL */
  apiBaseUrl: string
  /** unblock proxy URL（桌面端回环代理） */
  unblockProxyUrl: string | undefined
  /** 从 unblock 缓存中读取匹配结果 */
  getCache: (id: number) => { url: string; source: string; br: number; size?: number } | null | undefined
  /** 将 unblock 匹配结果写入缓存 */
  setCache: (id: number, entry: any) => void
}

/**
 * 播放 URL 决议：fee 探测 → 音质选择 → 缓存 → unblock → 降级检测 → 代理回退
 *
 * 纯异步函数，无副作用（除了 setCache 写入 unblock 缓存）。
 * 所有外部依赖通过 ResolveContext 传入。
 */
export async function resolvePlayUrl(ctx: ResolveContext): Promise<ResolveResult> {
  const { trackId, defaultQuality, isVip, loginCookie, unblockEnabled, unblockSources, apiBaseUrl, getCache, setCache } = ctx;

  let playUrl = '';
  let currentSource = 'official';
  let currentQualityBr = 0;
  let isDowngraded = false;
  let downgradeInfo: { from: string; to: string } | null = null;
  let deliveredLevel = '';
  let qualityLabel = '';
  let officialCode = 0;
  let officialBr = 0;
  let officialUrlAvailable = false;

  // 1. 音质 level 计算（VIP 校验）
  let level = toApiLevel(defaultQuality);
  if (!isVip && VIP_ONLY_API_LEVELS.has(level)) {
    level = 'exhigh';
  }

  // 2. 并行：fee 探测 + 缓存读取 + 音源匹配
  const nocookie = loginCookie || undefined;
  const feePromise = fetchOfficialUrl(apiBaseUrl, trackId, level, nocookie);
  const cached = getCache(trackId);
  const matchPromise = (!cached && unblockEnabled)
    ? tryUnblockMatch(trackId, unblockSources)
    : null;

  // 3. 先等 fee 结果
  let isFreePlayable = false;
  let fee = 0;
  let hasTrial = false;
  try {
    const direct = await feePromise;
    officialCode = direct.code;
    officialBr = direct.br;
    officialUrlAvailable = Boolean(direct.url);
    fee = direct.fee;
    if (direct.url) playUrl = direct.url;
    if (direct.br > 0) currentQualityBr = direct.br;
    hasTrial = direct.hasTrial;
    deliveredLevel = direct.url ? level : '';
    qualityLabel = deliveredLevel ? inferQualityLabel(deliveredLevel, currentQualityBr) : '';

    isFreePlayable = direct.code === 200 && Boolean(playUrl) && !hasTrial;

    if (!isFreePlayable) {
      for (const fallbackLevel of getFallbackLevels(level)) {
        const fallback = await fetchOfficialUrl(apiBaseUrl, trackId, fallbackLevel, nocookie);
        console.debug('[quality-switch] official fallback probe:', {
          trackId,
          requested: level,
          fallbackLevel,
          code: fallback.code,
          br: fallback.br,
          hasUrl: Boolean(fallback.url),
          hasTrial: fallback.hasTrial,
          fee: fallback.fee,
        });
        if (fallback.code === 200 && fallback.url && !fallback.hasTrial) {
          playUrl = fallback.url;
          currentQualityBr = fallback.br || currentQualityBr;
          fee = fallback.fee;
          hasTrial = fallback.hasTrial;
          deliveredLevel = fallbackLevel;
          qualityLabel = inferQualityLabel(fallbackLevel, fallback.br);
          isFreePlayable = true;
          downgradeInfo = {
            from: defaultQuality,
            to: inferQualityLabel(fallbackLevel, fallback.br),
          };
          isDowngraded = true;
          console.warn(
            `[quality-downgrade] 请求 ${defaultQuality} (level=${level}) 无可播 URL，已回退到 ${downgradeInfo.to} (level=${fallbackLevel})`
          );
          break;
        }
      }
    }

    // 检测 API 静默降级
    const deliveredQualityLevel = QUALITY_LEVEL_BY_LABEL[qualityLabel] || deliveredLevel || level;
    const minBr = QUALITY_MIN_BR[deliveredQualityLevel] || 0;
    const brDowngraded = minBr > 0 && currentQualityBr > 0 && currentQualityBr < minBr;
    if (!downgradeInfo && brDowngraded) {
      const actualQ = formatQualityBr(currentQualityBr);
      downgradeInfo = { from: defaultQuality, to: actualQ };
      qualityLabel = actualQ || qualityLabel;
      isDowngraded = true;
      console.warn(
        `[quality-downgrade] API 静默降级: 请求 ${downgradeInfo.from} (level=${level}, delivered=${deliveredLevel || level}, minBr=${minBr}) → 实际 br=${currentQualityBr} ≥ 交付 ${actualQ}（用户偏好 ${defaultQuality} 未变）`
      );
    }
  } catch (e) {
    console.warn('[debug] direct check failed:', e);
  }

  // 4. 决策树：官方可播 → 缓存命中 → unblock 匹配 → 回退官方
  if (isFreePlayable) {
    currentSource = 'official';
  } else if (cached) {
    playUrl = cached.url;
    currentSource = cached.source;
    if (cached.br > 0) currentQualityBr = cached.br;
    qualityLabel = formatQualityBr(currentQualityBr);
  } else if (matchPromise) {
    const result = await matchPromise;
    if (result?.url) {
      playUrl = result.url;
      currentSource = result.source || 'unblock';
      if (result.br > 0) currentQualityBr = result.br;
      qualityLabel = formatQualityBr(currentQualityBr);
      setCache(trackId, {
        url: result.url,
        source: result.source || 'unblock',
        br: result.br || 0,
        size: result.size || 0,
      });
    }
  } else {
    currentSource = 'official';
  }

  // 5. 非官方音源 → Web 端通过 dl-proxy 代理加载（绕过 CORS）
  // Electron 打包后页面是 file://，相对 /dl-proxy 会变成 file:///dl-proxy，必须直接使用远程 URL。
  if (canUseWebDlProxy() && currentSource !== 'official' && playUrl && !playUrl.startsWith(typeof location !== 'undefined' ? location.origin + '/' : '')) {
    playUrl = '/dl-proxy?url=' + encodeURIComponent(playUrl);
  }

  const finalUrlKind = !playUrl
    ? 'empty'
    : playUrl.startsWith('/dl-proxy')
      ? 'dl-proxy'
      : playUrl.startsWith('http')
        ? 'remote'
        : 'relative';

  // 6. 决策日志
  console.log(
    '[quality-switch] ═══════════════════════════════\n' +
    `  歌曲 id: ${trackId}\n` +
    `  请求音质: ${downgradeInfo?.from || defaultQuality} → API level: ${level}\n` +
    `  首次官方返回: code=${officialCode}  br=${officialBr}  hasUrl=${officialUrlAvailable}  fee=${fee}  hasTrial=${hasTrial}\n` +
    `  官方交付: ${deliveredLevel || '-'}  |  最终URL类型: ${finalUrlKind}\n` +
    `  可直播: ${isFreePlayable}  |  缓存命中: ${!!cached}  |  unblock启用: ${unblockEnabled}\n` +
    `  决策: ${isFreePlayable ? '✅ 使用官方音源' : cached ? '📦 命中缓存' : currentSource === 'official' ? '⚠️ 回退官方(无可替换)' : '🔀 unblock替换'}\n` +
    `  降级: ${downgradeInfo ? `⚠️ 是 (${downgradeInfo.from} → ${downgradeInfo.to})` : '否'}\n` +
    `  最终音源: ${currentSource}  |  比特率: ${currentQualityBr}  |  显示音质: ${qualityLabel || formatQualityBr(currentQualityBr) || defaultQuality}\n` +
    '[quality-switch] ═══════════════════════════════'
  );

  return {
    url: playUrl,
    source: currentSource,
    br: currentQualityBr,
    isDowngraded,
    downgradeInfo,
    qualityLabel: qualityLabel || formatQualityBr(currentQualityBr) || defaultQuality,
  };
}
