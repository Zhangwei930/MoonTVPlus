import { AdminConfig } from '@/lib/admin.types';
import { buildAdminHealthReport } from '@/lib/admin-health';

const baseConfig: AdminConfig = {
  ConfigSubscribtion: {
    URL: '',
    AutoUpdate: false,
    LastCheck: '',
  },
  ConfigFile: '',
  SiteConfig: {
    SiteName: 'MagiesTvPlus',
    Announcement: '',
    SearchDownstreamMaxPage: 1,
    SiteInterfaceCacheTime: 7200,
    DoubanProxyType: 'direct',
    DoubanProxy: '',
    DoubanImageProxyType: 'server',
    DoubanImageProxy: '',
    DisableYellowFilter: false,
    FluidSearch: true,
    DanmakuApiBase: '',
    DanmakuApiToken: '',
    EnableComments: false,
  },
  UserConfig: {
    Users: [],
    Tags: [],
  },
  SourceConfig: [],
  CustomCategories: [],
};

describe('admin health report', () => {
  it('flags enabled integrations with missing required configuration', () => {
    const report = buildAdminHealthReport(
      {
        ...baseConfig,
        OpenListConfig: {
          Enabled: true,
          URL: '',
          Username: 'admin',
          Password: '',
          OfflineDownloadPath: '/',
        },
        MusicConfig: {
          Enabled: true,
          BaseUrl: '',
        },
        EmailConfig: {
          enabled: true,
          provider: 'smtp',
          smtp: {
            host: '',
            port: 0,
            secure: false,
            user: '',
            password: '',
            from: '',
          },
        },
      },
      { storageType: 'redis', now: 1700000000000 }
    );

    const items = Object.fromEntries(
      report.groups.flatMap((group) =>
        group.items.map((item) => [item.key, item])
      )
    );

    expect(report.generatedAt).toBe(1700000000000);
    expect(items.videoSources.status).toBe('warning');
    expect(items.openlist.status).toBe('error');
    expect(items.music.status).toBe('error');
    expect(items.email.status).toBe('error');
    expect(report.summary.error).toBeGreaterThanOrEqual(3);
  });

  it('reports complete configured features without false errors', () => {
    const report = buildAdminHealthReport(
      {
        ...baseConfig,
        SourceConfig: [
          {
            key: 'main',
            name: '主源',
            api: 'https://example.com/api.php/provide/vod',
            from: 'custom',
          },
        ],
        LiveConfig: [
          {
            key: 'live',
            name: '直播源',
            url: 'https://example.com/live.m3u',
            from: 'custom',
          },
        ],
        OpenListConfig: {
          Enabled: true,
          URL: 'https://openlist.example.com',
          Username: 'admin',
          Password: 'secret',
          OfflineDownloadPath: '/',
        },
        MusicConfig: {
          Enabled: true,
          BaseUrl: 'https://music.example.com',
        },
      },
      { storageType: 'kvrocks', now: 1700000000000 }
    );

    const items = Object.fromEntries(
      report.groups.flatMap((group) =>
        group.items.map((item) => [item.key, item])
      )
    );

    expect(items.videoSources.status).toBe('ok');
    expect(items.live.status).toBe('ok');
    expect(items.openlist.status).toBe('ok');
    expect(items.music.status).toBe('ok');
    expect(report.summary.error).toBe(0);
  });

  describe('source quality group (24h)', () => {
    const now = 1700000000000;
    const HOUR = 60 * 60 * 1000;

    const configWithHistory: AdminConfig = {
      ...baseConfig,
      SourceConfig: [
        { key: 'fast', name: '快源', api: 'https://a.example.com', from: 'custom' },
        { key: 'slow', name: '慢源', api: 'https://b.example.com', from: 'custom' },
        { key: 'flaky', name: '不稳源', api: 'https://c.example.com', from: 'custom' },
      ],
      SourceCheckState: {
        failures: {},
        lastCheckTime: now,
        history: {
          fast: [
            { t: now - HOUR, ok: true, ms: 100 },
            { t: now, ok: true, ms: 200 },
          ],
          slow: [
            { t: now - HOUR, ok: true, ms: 8000 },
            { t: now, ok: true, ms: 6000 },
          ],
          flaky: [
            { t: now - HOUR, ok: false },
            { t: now, ok: false },
          ],
        },
      },
    };

    it('ranks slowest sources by average latency', () => {
      const report = buildAdminHealthReport(configWithHistory, {
        storageType: 'redis',
        now,
      });
      const items = Object.fromEntries(
        report.groups.flatMap((group) =>
          group.items.map((item) => [item.key, item])
        )
      );

      expect(items.slowestSources).toBeDefined();
      expect(items.slowestSources.details?.[0]).toContain('慢源');
      expect(items.slowestSources.details?.[0]).toContain('7000');
    });

    it('ranks most failed sources and flags them as warning', () => {
      const report = buildAdminHealthReport(configWithHistory, {
        storageType: 'redis',
        now,
      });
      const items = Object.fromEntries(
        report.groups.flatMap((group) =>
          group.items.map((item) => [item.key, item])
        )
      );

      expect(items.mostFailedSources.status).toBe('warning');
      expect(items.mostFailedSources.details?.[0]).toContain('不稳源');
      expect(items.mostFailedSources.details?.[0]).toContain('2/2');
    });

    it('marks the group disabled when no history exists', () => {
      const report = buildAdminHealthReport(baseConfig, {
        storageType: 'redis',
        now,
      });
      const items = Object.fromEntries(
        report.groups.flatMap((group) =>
          group.items.map((item) => [item.key, item])
        )
      );

      expect(items.slowestSources.status).toBe('disabled');
      expect(items.mostFailedSources.status).toBe('disabled');
    });

    it('shows top failing image domains when provided via options', () => {
      const report = buildAdminHealthReport(baseConfig, {
        storageType: 'redis',
        now,
        imageFailureTop: [
          { domain: 'img.bad.com', count: 42 },
          { domain: 'cdn.dead.net', count: 7 },
        ],
      });
      const items = Object.fromEntries(
        report.groups.flatMap((group) =>
          group.items.map((item) => [item.key, item])
        )
      );

      expect(items.imageFailureDomains.status).toBe('warning');
      expect(items.imageFailureDomains.details?.[0]).toContain('img.bad.com');
      expect(items.imageFailureDomains.details?.[0]).toContain('42');
    });
  });
});
