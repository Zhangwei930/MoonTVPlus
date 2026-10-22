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
  collectProbeTargets,
  evaluateSourceCheck,
  probeApiSite,
  probeUrl,
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

describe('collectProbeTargets', () => {
  it('collects all configured source kinds with namespaced keys', () => {
    const targets = collectProbeTargets({
      SourceConfig: [
        { key: 'cms1', name: 'CMS源', api: 'https://cms.example.com/api', from: 'custom' },
        { key: 'cms2', name: '停用源', api: 'https://x.example.com/api', from: 'custom', disabled: true },
      ],
      LiveConfig: [
        { key: 'zb', name: '直播源', url: 'https://live.example.com/tv.m3u', ua: 'MyUA', from: 'custom' },
        { key: 'zb2', name: '停用直播', url: 'https://y.example.com/tv.m3u', from: 'custom', disabled: true },
      ],
      OpenListConfig: {
        Enabled: true,
        URL: 'https://openlist.example.com',
        Username: 'u',
        Password: 'p',
        OfflineDownloadPath: '/',
      },
      EmbyConfig: {
        Sources: [
          { key: 'home', name: '家庭Emby', enabled: true, ServerURL: 'https://emby.example.com/' },
          { key: 'off', name: '停用Emby', enabled: false, ServerURL: 'https://z.example.com' },
        ],
      },
      SuwayomiConfig: { Enabled: true, ServerURL: 'https://manga.example.com' },
      OPDSConfig: {
        Enabled: true,
        Sources: [
          { id: 'b1', name: '书源一', url: 'https://books.example.com/opds', enabled: true },
          { id: 'b2', name: '停用书源', url: 'https://b.example.com/opds', enabled: false },
        ],
      },
    } as any);

    const byKey = Object.fromEntries(targets.map((t) => [t.key, t]));

    expect(byKey['cms1']).toMatchObject({ kind: 'cms', endpoint: 'https://cms.example.com/api' });
    expect(byKey['cms2']).toBeUndefined();
    expect(byKey['live:zb']).toMatchObject({
      kind: 'url',
      endpoint: 'https://live.example.com/tv.m3u',
      ua: 'MyUA',
    });
    expect(byKey['live:zb2']).toBeUndefined();
    expect(byKey['openlist']).toMatchObject({ kind: 'url', endpoint: 'https://openlist.example.com' });
    expect(byKey['emby:home']).toMatchObject({
      kind: 'url',
      endpoint: 'https://emby.example.com/System/Info/Public',
    });
    expect(byKey['emby:off']).toBeUndefined();
    expect(byKey['suwayomi']).toMatchObject({ kind: 'url' });
    expect(byKey['opds:b1']).toMatchObject({ kind: 'url', endpoint: 'https://books.example.com/opds' });
    expect(byKey['opds:b2']).toBeUndefined();
  });

  it('supports legacy single-source Emby config', () => {
    const targets = collectProbeTargets({
      SourceConfig: [],
      EmbyConfig: { Enabled: true, ServerURL: 'https://old-emby.example.com' },
    } as any);

    expect(targets).toEqual([
      expect.objectContaining({
        key: 'emby',
        kind: 'url',
        endpoint: 'https://old-emby.example.com/System/Info/Public',
      }),
    ]);
  });

  it('returns empty for a bare config', () => {
    expect(collectProbeTargets({ SourceConfig: [] } as any)).toEqual([]);
  });
});

describe('probeUrl', () => {
  const target = {
    key: 'live:zb',
    name: '直播源',
    kind: 'url' as const,
    endpoint: 'https://live.example.com/tv.m3u',
    ua: 'MyUA',
  };

  it('returns ok with latency for a reachable url', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await probeUrl(target, fetchFn as any);
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(fetchFn).toHaveBeenCalledWith(
      target.endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'MyUA' }),
      })
    );
  });

  it('treats auth-protected (4xx) responses as reachable', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await probeUrl(target, fetchFn as any);
    expect(result.ok).toBe(true);
  });

  it('treats 5xx as failure', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await probeUrl(target, fetchFn as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
  });

  it('treats network errors as failure', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('connect refused'));
    const result = await probeUrl(target, fetchFn as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('connect refused');
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
