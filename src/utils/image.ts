const REMOTE_IMAGE_PROTOCOL_RE = /^https?:\/\//i;

export function normalizeImageUrl(url?: string | null) {
  return url ? String(url).replace(/^http:\/\//, 'https://') : '';
}

export function resolveSizedImageUrl(url?: string | null, size = 512) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return '';
  if (!REMOTE_IMAGE_PROTOCOL_RE.test(normalized)) return normalized;

  // 网易封面 URL 常带 imageView/watermark/thumbnail 链路，可能被固定到 140x140
  // 统一截断为原始图片地址并显式指定较大尺寸，避免放大模糊。
  const baseMatch = normalized.match(/^(https:\/\/[^?]+\.(?:jpg|jpeg|png|webp))/i);
  if (baseMatch?.[1]) {
    const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 512;
    return `${baseMatch[1]}?param=${safeSize}y${safeSize}`;
  }

  return normalized
    .replace(/thumbnail=140y140&?/gi, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
}

export function resolvePlaylistCoverUrl(url?: string | null, size = 512) {
  return resolveSizedImageUrl(url, size);
}

export function resolveArtistImageUrl(item: any) {
  return normalizeImageUrl(item?.img1v1Url || item?.picUrl || item?.avatar || item?.avatarUrl || item?.coverUrl || item?.cover || item?.coverImgUrl || '');
}
