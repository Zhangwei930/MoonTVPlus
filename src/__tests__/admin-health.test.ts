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
});
