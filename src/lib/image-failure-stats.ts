/**
 * 服务端内存统计：24 小时内图片加载失败按域名聚合。
 * 单实例部署下够用；重启后清零（统计类数据可接受）。
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_DOMAINS = 200;
const MAX_SAMPLES_PER_DOMAIN = 1000;

// domain -> 失败时间戳列表
const failuresByDomain = new Map<string, number[]>();

export function recordImageFailure(url: string, now: number = Date.now()): void {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return; // 相对路径或非法 URL 不统计
  }
  if (!domain) return;

  const samples = failuresByDomain.get(domain) || [];
  samples.push(now);
  if (samples.length > MAX_SAMPLES_PER_DOMAIN) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_DOMAIN);
  }
  failuresByDomain.delete(domain);
  failuresByDomain.set(domain, samples);

  if (failuresByDomain.size > MAX_DOMAINS) {
    const oldest = failuresByDomain.keys().next().value;
    if (oldest !== undefined) {
      failuresByDomain.delete(oldest);
    }
  }
}

export function getTopImageFailureDomains(
  limit: number,
  now: number = Date.now()
): Array<{ domain: string; count: number }> {
  const cutoff = now - WINDOW_MS;
  const counts: Array<{ domain: string; count: number }> = [];

  for (const [domain, samples] of Array.from(failuresByDomain.entries())) {
    const recent = samples.filter((t: number) => t >= cutoff);
    if (recent.length === 0) {
      failuresByDomain.delete(domain);
      continue;
    }
    failuresByDomain.set(domain, recent);
    counts.push({ domain, count: recent.length });
  }

  return counts.sort((a, b) => b.count - a.count).slice(0, limit);
}

export function clearImageFailureStats(): void {
  failuresByDomain.clear();
}
