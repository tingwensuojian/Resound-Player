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

/**
 * 预渲染静态模糊图，替代实时 backdrop-filter
 * 将封面图用 canvas 渲染 + blur，生成 data URL
 * 只在挂载/封面变化时执行一次，不是每帧
 */
export function generateBlurredBg(
  imageUrl: string,
  options?: { blurRadius?: number; saturation?: number; maxWidth?: number }
): Promise<string> {
  const {
    blurRadius = 10,
    saturation = 1.32,
    maxWidth = 200,
  } = options || {};

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 用较小的 canvas 尺寸（200px），模糊后不可感知分辨率差异
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }

      // blur + saturation 一次性渲染
      ctx.filter = `blur(${blurRadius}px) saturate(${saturation})`;
      ctx.drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL('image/webp', 0.6));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = resolveSizedImageUrl(imageUrl, 512);
  });
}
