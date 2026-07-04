/**
 * 会话级图片失败缓存：记录最终加载失败（含备用源）的图片 URL，
 * 短时间内不再对同一坏图发起请求，避免首页/列表反复卡在坏海报上。
 * 仅存内存（按标签页会话），不落 localStorage。
 */

const FAILED_IMAGE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

// Map 保持插入序，满了淘汰最旧的
const failedImages = new Map<string, number>();

export function markImageFailed(url: string): void {
  if (!url) return;

  failedImages.delete(url);
  failedImages.set(url, Date.now() + FAILED_IMAGE_TTL_MS);

  if (failedImages.size > MAX_ENTRIES) {
    const oldest = failedImages.keys().next().value;
    if (oldest !== undefined) {
      failedImages.delete(oldest);
    }
  }
}

export function isImageFailedRecently(url: string): boolean {
  if (!url) return false;

  const expiry = failedImages.get(url);
  if (expiry === undefined) return false;

  if (Date.now() >= expiry) {
    failedImages.delete(url);
    return false;
  }
  return true;
}

export function clearFailedImageCache(): void {
  failedImages.clear();
}

/**
 * 把最终失败的图片 URL 上报给服务端做域名聚合统计（fire-and-forget）
 */
export function reportImageFailure(url: string): void {
  if (!url || typeof navigator === 'undefined' || !navigator.sendBeacon) {
    return;
  }
  try {
    navigator.sendBeacon(
      '/api/image-failures',
      new Blob([JSON.stringify({ url })], { type: 'application/json' })
    );
  } catch {
    // 统计上报失败不影响页面
  }
}
