/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@/lib/db', () => ({
  db: { saveAdminConfig: jest.fn() },
  getStorage: () => ({ addNotification: jest.fn() }),
}));
jest.mock('@/lib/notification-preferences', () => ({
  canDeliverNotification: jest.fn().mockReturnValue(true),
  getUserNotificationPreferences: jest.fn().mockResolvedValue({}),
}));

import {
  appendSourceCheckHistory,
  evaluateSourceCheck,
  probeApiSite,
} from '@/lib/source-check';

describe('probeApiSite', () => {
  const site = { key: 'test', name: '测试源', api: 'https://example.com/api.php/provide/vod' };

  it('returns ok for valid CMS V10 JSON response', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 1, list: [{ vod_id: 1 }] }),
    });
    const result = await probeApiSite(site, fetchFn as any);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining(site.api),
      expect.anything()
    );
  });

  it('returns not ok for HTTP error status', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 502 });
    const result = await probeApiSite(site, fetchFn as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('502');
  });

  it('returns not ok when fetch throws (timeout/network)', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('timeout'));
    const result = await probeApiSite(site, fetchFn as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('returns not ok for non-JSON or malformed body', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    const result = await probeApiSite(site, fetchFn as any);
    expect(result.ok).toBe(false);
  });

  it('returns not ok when body lacks list array', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'not a cms response' }),
    });
    const result = await probeApiSite(site, fetchFn as any);
    expect(result.ok).toBe(false);
  });
});

describe('evaluateSourceCheck', () => {
  const threshold = 3;

  it('increments failures on fail and resets on success', () => {
    const { failures } = evaluateSourceCheck(
      { a: 1, b: 2 },
      [
        { key: 'a', ok: false },
        { key: 'b', ok: true },
      ],
      threshold
    );
    expect(failures.a).toBe(2);
    expect(failures.b).toBe(0);
  });

  it('flags newlyDead exactly when crossing the threshold', () => {
    const first = evaluateSourceCheck({ a: 2 }, [{ key: 'a', ok: false }], threshold);
    expect(first.newlyDead).toEqual(['a']);

    // 已经死了的源再失败不重复上报
    const second = evaluateSourceCheck(first.failures, [{ key: 'a', ok: false }], threshold);
    expect(second.newlyDead).toEqual([]);
  });

  it('flags recovered when a dead source succeeds again', () => {
    const { recovered, failures } = evaluateSourceCheck(
      { a: 5 },
      [{ key: 'a', ok: true }],
      threshold
    );
    expect(recovered).toEqual(['a']);
    expect(failures.a).toBe(0);
  });

  it('does not flag recovered for sources that never crossed threshold', () => {
    const { recovered } = evaluateSourceCheck({ a: 1 }, [{ key: 'a', ok: true }], threshold);
    expect(recovered).toEqual([]);
  });
});

describe('appendSourceCheckHistory', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1700000000000;

  it('appends samples with timestamp, ok and latency', () => {
    const history = appendSourceCheckHistory(
      {},
      [
        { key: 'a', ok: true, latencyMs: 120 },
        { key: 'b', ok: false, error: 'timeout' },
      ],
      now
    );
    expect(history.a).toEqual([{ t: now, ok: true, ms: 120 }]);
    expect(history.b).toEqual([{ t: now, ok: false }]);
  });

  it('keeps samples within 24h and prunes older ones', () => {
    const history = appendSourceCheckHistory(
      {
        a: [
          { t: now - 25 * HOUR, ok: true, ms: 100 },
          { t: now - 2 * HOUR, ok: true, ms: 200 },
        ],
      },
      [{ key: 'a', ok: true, latencyMs: 300 }],
      now
    );
    expect(history.a.map((s) => s.ms)).toEqual([200, 300]);
  });

  it('drops sources that have no recent samples and no new result', () => {
    const history = appendSourceCheckHistory(
      { gone: [{ t: now - 30 * HOUR, ok: true, ms: 50 }] },
      [{ key: 'a', ok: true, latencyMs: 10 }],
      now
    );
    expect(history.gone).toBeUndefined();
    expect(history.a).toHaveLength(1);
  });
});
