import type { AdminConfig } from '@/lib/admin.types';
import { buildAdminTaskReport } from '@/lib/admin-tasks';

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

describe('admin task report', () => {
  it('aggregates running and failed task sources', () => {
    const report = buildAdminTaskReport(
      baseConfig,
      {
        offlineTasks: [
          {
            id: 'download_1',
            title: '测试影片 第1集',
            status: 'downloading',
            progress: 42,
            updatedAt: '2026-05-17T00:00:00.000Z',
          },
          {
            id: 'download_2',
            title: '失败影片',
            status: 'error',
            progress: 10,
            errorMessage: '分片下载失败',
            updatedAt: '2026-05-17T00:02:00.000Z',
          },
        ],
        scanTasks: [
          {
            id: 'scan_1',
            status: 'running',
            progress: {
              current: 4,
              total: 10,
              currentFolder: 'Drama',
            },
            startTime: 1700000000000,
          },
        ],
        migrationProgress: [
          {
            key: 'admin:export',
            operation: 'export',
            phase: 'collecting',
            current: 3,
            total: 6,
            message: '正在收集用户数据',
            timestamp: 1700000005000,
          },
        ],
      },
      { now: 1700000010000 }
    );

    const items = report.groups.flatMap((group) => group.items);

    expect(report.generatedAt).toBe(1700000010000);
    expect(report.summary.running).toBe(3);
    expect(report.summary.failed).toBe(1);
    expect(
      items.find((item) => item.id === 'offline:download_1')?.progress?.percent
    ).toBe(42);
    expect(items.find((item) => item.id === 'offline:download_2')?.error).toBe(
      '分片下载失败'
    );
    expect(
      items.find((item) => item.id === 'scan:scan_1')?.progress?.percent
    ).toBe(40);
    expect(
      items.find((item) => item.id === 'migration:admin:export')?.status
    ).toBe('running');
  });

  it('adds automation overview rows when there are no active task records', () => {
    const report = buildAdminTaskReport(
      {
        ...baseConfig,
        LiveConfig: [
          {
            key: 'live',
            name: '直播源',
            url: 'https://example.com/live.m3u',
            from: 'custom',
            channelNumber: 120,
          },
        ],
        AnimeSubscriptionConfig: {
          Enabled: true,
          Subscriptions: [
            {
              id: 'sub_1',
              title: '测试番剧',
              filterText: '1080p',
              source: 'mikan',
              enabled: true,
              lastCheckTime: 1700000000000,
              lastEpisode: 7,
              createdAt: 1699990000000,
              updatedAt: 1700000000000,
              createdBy: 'admin',
            },
          ],
        },
      },
      {
        movieRequestCounts: {
          pending: 2,
          fulfilled: 1,
        },
      },
      { now: 1700000010000 }
    );

    const items = Object.fromEntries(
      report.groups.flatMap((group) =>
        group.items.map((item) => [item.id, item])
      )
    );

    expect(items['live:overview'].status).toBe('idle');
    expect(items['anime:overview'].message).toContain('1 个启用订阅');
    expect(items['movie-request:overview'].message).toContain('2 个待处理');
    expect(report.summary.failed).toBe(0);
  });
});
