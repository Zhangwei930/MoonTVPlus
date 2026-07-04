/* eslint-disable no-console */

import { AdminConfig } from '@/lib/admin.types';
import { db, getStorage } from '@/lib/db';
import {
  canDeliverNotification,
  getUserNotificationPreferences,
} from '@/lib/notification-preferences';

const PROBE_TIMEOUT_MS = 10000;
const PROBE_CONCURRENCY = 5;
const DEFAULT_FAILURE_THRESHOLD = 3;

export interface ProbeTarget {
  key: string;
  name: string;
  api: string;
}

export interface ProbeResult {
  key: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * 探测单个 CMS V10 视频源：请求列表接口并校验返回结构
 */
export async function probeApiSite(
  site: ProbeTarget,
  fetchFn: FetchLike = fetch
): Promise<ProbeResult> {
  const separator = site.api.includes('?') ? '&' : '?';
  const url = `${site.api}${separator}ac=videolist&pg=1`;
  const start = Date.now();
  try {
    const signal =
      typeof AbortSignal !== 'undefined' &&
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
        : undefined;
    const response = await fetchFn(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        key: site.key,
        ok: false,
        error: `HTTP ${(response as { status?: number }).status ?? 'error'}`,
      };
    }
    const body = await response.json();
    if (!body || !Array.isArray(body.list)) {
      return { key: site.key, ok: false, error: '响应缺少 list 字段' };
    }
    return { key: site.key, ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { key: site.key, ok: false, error: String(error) };
  }
}

export interface SourceCheckEvaluation {
  failures: Record<string, number>;
  newlyDead: string[];
  recovered: string[];
}

/**
 * 纯函数：根据上一轮连续失败计数和本轮探测结果，
 * 计算新的计数，以及刚跨过阈值（newlyDead）/ 恢复（recovered）的源
 */
export function evaluateSourceCheck(
  prevFailures: Record<string, number>,
  results: Array<Pick<ProbeResult, 'key' | 'ok'>>,
  threshold: number = DEFAULT_FAILURE_THRESHOLD
): SourceCheckEvaluation {
  const failures: Record<string, number> = { ...prevFailures };
  const newlyDead: string[] = [];
  const recovered: string[] = [];

  for (const result of results) {
    const prev = failures[result.key] || 0;
    if (result.ok) {
      if (prev >= threshold) {
        recovered.push(result.key);
      }
      failures[result.key] = 0;
    } else {
      failures[result.key] = prev + 1;
      if (prev < threshold && failures[result.key] >= threshold) {
        newlyDead.push(result.key);
      }
    }
  }

  return { failures, newlyDead, recovered };
}

async function probeAll(
  sites: ProbeTarget[],
  fetchFn: FetchLike
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (let i = 0; i < sites.length; i += PROBE_CONCURRENCY) {
    const batch = sites.slice(i, i + PROBE_CONCURRENCY);
    results.push(...(await Promise.all(batch.map((s) => probeApiSite(s, fetchFn)))));
  }
  return results;
}

async function notifyOwner(title: string, message: string) {
  const owner = process.env.USERNAME;
  if (!owner) return;
  try {
    const storage = getStorage();
    const preferences = await getUserNotificationPreferences(storage, owner);
    if (!canDeliverNotification('system', 'site', preferences)) return;
    await storage.addNotification(owner, {
      id: `source-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'system',
      title,
      message,
      timestamp: Date.now(),
      read: false,
    });
  } catch (error) {
    console.error('视频源检测通知发送失败:', error);
  }
}

/**
 * 检测所有启用视频源的可用性；连续失败达到阈值后给 owner 发站内通知，
 * 恢复后同样通知。计数持久化在 AdminConfig.SourceCheckState 中。
 */
export async function checkSourceAvailability(
  config: AdminConfig,
  fetchFn: FetchLike = fetch
): Promise<void> {
  const sites = (config.SourceConfig || []).filter((s) => !s.disabled);
  if (sites.length === 0) return;

  const results = await probeAll(sites, fetchFn);
  const prevFailures = config.SourceCheckState?.failures || {};
  const { failures, newlyDead, recovered } = evaluateSourceCheck(
    prevFailures,
    results
  );

  const nameOf = (key: string) =>
    sites.find((s) => s.key === key)?.name || key;

  if (newlyDead.length > 0) {
    await notifyOwner(
      '视频源疑似失效',
      `以下视频源连续 ${DEFAULT_FAILURE_THRESHOLD} 次检测失败，请到管理后台确认：${newlyDead
        .map(nameOf)
        .join('、')}`
    );
  }
  if (recovered.length > 0) {
    await notifyOwner(
      '视频源已恢复',
      `以下视频源检测恢复正常：${recovered.map(nameOf).join('、')}`
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `视频源检测完成: ${results.length - failed.length}/${results.length} 可用` +
      (failed.length > 0
        ? `，失败: ${failed.map((r) => `${nameOf(r.key)}(${r.error})`).join('、')}`
        : '')
  );

  config.SourceCheckState = { failures, lastCheckTime: Date.now() };
  await db.saveAdminConfig(config);
}
