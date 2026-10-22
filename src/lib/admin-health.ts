import { AdminConfig } from './admin.types';
import { collectProbeTargets } from './probe-targets';

export type AdminHealthStatus = 'ok' | 'warning' | 'error' | 'disabled';

export interface AdminHealthItem {
  key: string;
  label: string;
  status: AdminHealthStatus;
  message: string;
  details?: string[];
}

export interface AdminHealthGroup {
  key: string;
  label: string;
  status: AdminHealthStatus;
  items: AdminHealthItem[];
}

export interface AdminHealthReport {
  generatedAt: number;
  summary: Record<AdminHealthStatus, number> & { total: number };
  groups: AdminHealthGroup[];
}

export interface AdminHealthOptions {
  storageType?: string;
  now?: number;
  imageFailureTop?: Array<{ domain: string; count: number }>;
}

const statusRank: Record<AdminHealthStatus, number> = {
  disabled: 0,
  ok: 1,
  warning: 2,
  error: 3,
};

function hasText(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

function enabled<T extends { disabled?: boolean }>(items?: T[]) {
  return (items || []).filter((item) => !item.disabled);
}

function item(
  key: string,
  label: string,
  status: AdminHealthStatus,
  message: string,
  details?: string[]
): AdminHealthItem {
  return {
    key,
    label,
    status,
    message,
    ...(details && details.length > 0 ? { details } : {}),
  };
}

function group(key: string, label: string, items: AdminHealthItem[]) {
  const status = items.reduce<AdminHealthStatus>((current, currentItem) => {
    return statusRank[currentItem.status] > statusRank[current]
      ? currentItem.status
      : current;
  }, 'disabled');

  return { key, label, status, items };
}

function missingFields(fields: Array<[string, boolean]>) {
  return fields.filter(([, present]) => !present).map(([label]) => label);
}

function missingMessage(missing: string[]) {
  return `缺少配置：${missing.join('、')}`;
}

function checkBasic(
  config: AdminConfig,
  storageType: string
): AdminHealthGroup {
  return group('basic', '基础配置', [
    item(
      'storage',
      '存储模式',
      storageType === 'localstorage' ? 'warning' : 'ok',
      storageType === 'localstorage'
        ? '当前为本地存储，后台配置和多端数据能力受限'
        : `当前存储模式：${storageType}`
    ),
    item(
      'siteName',
      '站点名称',
      hasText(config.SiteConfig?.SiteName) ? 'ok' : 'warning',
      hasText(config.SiteConfig?.SiteName)
        ? `当前站点名称：${config.SiteConfig.SiteName}`
        : '站点名称为空，前台会使用默认显示'
    ),
    item(
      'tmdb',
      'TMDB',
      hasText(config.SiteConfig?.TMDBApiKey) ? 'ok' : 'warning',
      hasText(config.SiteConfig?.TMDBApiKey)
        ? 'TMDB API Key 已配置'
        : '未配置 TMDB API Key，详情、推荐和图片能力会受限'
    ),
  ]);
}

function checkVideoSources(config: AdminConfig): AdminHealthGroup {
  const sources = enabled(config.SourceConfig);
  const brokenSources = sources.filter(
    (source) =>
      !hasText(source.key) || !hasText(source.name) || !hasText(source.api)
  );

  let sourceStatus: AdminHealthStatus = 'ok';
  let sourceMessage = `已启用 ${sources.length} 个视频源`;

  if (brokenSources.length > 0) {
    sourceStatus = 'error';
    sourceMessage = `${brokenSources.length} 个已启用视频源缺少关键字段`;
  } else if (sources.length === 0) {
    sourceStatus = 'warning';
    sourceMessage = '没有启用的视频源，聚合搜索无法返回播放结果';
  } else if (sources.length > 50) {
    sourceStatus = 'warning';
    sourceMessage = `已启用 ${sources.length} 个视频源，搜索和优选可能变慢`;
  }

  return group('video', '视频能力', [
    item(
      'videoSources',
      '视频源',
      sourceStatus,
      sourceMessage,
      brokenSources.map(
        (source) =>
          `${source.name || source.key || '未命名源'} 缺少 key/name/api`
      )
    ),
    item(
      'customCategories',
      '自定义分类',
      enabled(config.CustomCategories).length > 0 ? 'ok' : 'disabled',
      enabled(config.CustomCategories).length > 0
        ? `已启用 ${enabled(config.CustomCategories).length} 个自定义分类`
        : '未启用自定义分类'
    ),
  ]);
}

function checkLive(config: AdminConfig): AdminHealthGroup {
  const liveSources = enabled(config.LiveConfig);
  const brokenLiveSources = liveSources.filter(
    (source) =>
      !hasText(source.key) || !hasText(source.name) || !hasText(source.url)
  );
  const webLiveEnabled = config.WebLiveEnabled === true;
  const webLiveSources = enabled(config.WebLiveConfig);
  const brokenWebLiveSources = webLiveSources.filter(
    (source) =>
      !hasText(source.key) ||
      !hasText(source.name) ||
      !hasText(source.platform) ||
      !hasText(source.roomId)
  );

  return group('live', '直播能力', [
    item(
      'live',
      '电视直播',
      brokenLiveSources.length > 0
        ? 'error'
        : liveSources.length > 0
        ? 'ok'
        : 'disabled',
      brokenLiveSources.length > 0
        ? `${brokenLiveSources.length} 个直播源缺少关键字段`
        : liveSources.length > 0
        ? `已启用 ${liveSources.length} 个直播源`
        : '未启用电视直播源',
      brokenLiveSources.map(
        (source) =>
          `${source.name || source.key || '未命名源'} 缺少 key/name/url`
      )
    ),
    item(
      'webLive',
      '网络直播',
      brokenWebLiveSources.length > 0
        ? 'error'
        : webLiveEnabled && webLiveSources.length === 0
        ? 'warning'
        : webLiveEnabled
        ? 'ok'
        : 'disabled',
      brokenWebLiveSources.length > 0
        ? `${brokenWebLiveSources.length} 个网络直播源缺少关键字段`
        : webLiveEnabled && webLiveSources.length === 0
        ? '网络直播已开启，但没有启用的房间'
        : webLiveEnabled
        ? `已启用 ${webLiveSources.length} 个网络直播房间`
        : '网络直播未启用',
      brokenWebLiveSources.map(
        (source) =>
          `${
            source.name || source.key || '未命名房间'
          } 缺少 key/name/platform/roomId`
      )
    ),
  ]);
}

function checkOpenList(config: AdminConfig): AdminHealthItem {
  const openlist = config.OpenListConfig;
  if (!openlist?.Enabled) {
    return item('openlist', 'OpenList', 'disabled', 'OpenList 私人影库未启用');
  }

  const missing = missingFields([
    ['URL', hasText(openlist.URL)],
    ['Username', hasText(openlist.Username)],
    ['Password', hasText(openlist.Password)],
  ]);

  return item(
    'openlist',
    'OpenList',
    missing.length > 0 ? 'error' : 'ok',
    missing.length > 0 ? missingMessage(missing) : 'OpenList 配置完整'
  );
}

function checkEmby(config: AdminConfig): AdminHealthItem {
  const emby = config.EmbyConfig;
  const sources = (emby?.Sources || []).filter((source) => source.enabled);

  if (sources.length === 0 && !emby?.Enabled) {
    return item('emby', 'Emby/Jellyfin', 'disabled', 'Emby/Jellyfin 未启用');
  }

  const legacyMissing =
    emby?.Enabled && sources.length === 0
      ? missingFields([
          ['ServerURL', hasText(emby.ServerURL)],
          [
            'ApiKey 或 Username',
            hasText(emby.ApiKey) || hasText(emby.Username),
          ],
        ])
      : [];
  const brokenSources = sources.filter(
    (source) =>
      !hasText(source.ServerURL) ||
      !(
        hasText(source.ApiKey) ||
        hasText(source.Username) ||
        hasText(source.AuthToken)
      )
  );

  if (legacyMissing.length > 0 || brokenSources.length > 0) {
    return item(
      'emby',
      'Emby/Jellyfin',
      'error',
      legacyMissing.length > 0
        ? missingMessage(legacyMissing)
        : `${brokenSources.length} 个 Emby/Jellyfin 源缺少服务地址或凭据`,
      brokenSources.map(
        (source) =>
          `${source.name || source.key || '未命名源'} 缺少 ServerURL 或凭据`
      )
    );
  }

  return item(
    'emby',
    'Emby/Jellyfin',
    'ok',
    sources.length > 0
      ? `已启用 ${sources.length} 个媒体库源`
      : '旧版 Emby 配置已启用'
  );
}

function checkXiaoya(config: AdminConfig): AdminHealthItem {
  const xiaoya = config.XiaoyaConfig;
  if (!xiaoya?.Enabled) {
    return item('xiaoya', '小雅', 'disabled', '小雅媒体库未启用');
  }

  return item(
    'xiaoya',
    '小雅',
    hasText(xiaoya.ServerURL) ? 'ok' : 'error',
    hasText(xiaoya.ServerURL) ? '小雅服务地址已配置' : '缺少配置：ServerURL'
  );
}

function checkNetDisk(config: AdminConfig): AdminHealthItem {
  const netdisk = config.NetDiskConfig;
  if (!netdisk) {
    return item('netdisk', '网盘账号', 'disabled', '未启用网盘账号');
  }

  const checks: Array<[string, boolean, string[]]> = [
    [
      '夸克网盘',
      netdisk.Quark?.Enabled === true,
      missingFields([
        ['Cookie', hasText(netdisk.Quark?.Cookie)],
        ['SavePath', hasText(netdisk.Quark?.SavePath)],
      ]),
    ],
    [
      '移动云盘',
      netdisk.Mobile?.Enabled === true,
      missingFields([
        ['Authorization', hasText(netdisk.Mobile?.Authorization)],
      ]),
    ],
    [
      '百度网盘',
      netdisk.Baidu?.Enabled === true,
      missingFields([['Cookie', hasText(netdisk.Baidu?.Cookie)]]),
    ],
    [
      '天翼云盘',
      netdisk.Tianyi?.Enabled === true,
      missingFields([
        ['Account', hasText(netdisk.Tianyi?.Account)],
        ['Password', hasText(netdisk.Tianyi?.Password)],
      ]),
    ],
    [
      '123云盘',
      netdisk.Pan123?.Enabled === true,
      missingFields([
        ['Account', hasText(netdisk.Pan123?.Account)],
        ['Password', hasText(netdisk.Pan123?.Password)],
      ]),
    ],
    [
      'UC网盘',
      netdisk.UC?.Enabled === true,
      missingFields([
        ['Cookie', hasText(netdisk.UC?.Cookie)],
        ['SavePath', hasText(netdisk.UC?.SavePath)],
      ]),
    ],
    [
      '115网盘',
      netdisk.Pan115?.Enabled === true,
      missingFields([['Cookie', hasText(netdisk.Pan115?.Cookie)]]),
    ],
  ];

  const enabledChecks = checks.filter(([, isEnabled]) => isEnabled);
  if (enabledChecks.length === 0) {
    return item('netdisk', '网盘账号', 'disabled', '未启用网盘账号');
  }

  const broken = enabledChecks
    .filter(([, , missing]) => missing.length > 0)
    .map(([label, , missing]) => `${label} 缺少 ${missing.join('、')}`);

  return item(
    'netdisk',
    '网盘账号',
    broken.length > 0 ? 'error' : 'ok',
    broken.length > 0
      ? `${broken.length} 个网盘账号配置不完整`
      : `已启用 ${enabledChecks.length} 个网盘账号`,
    broken
  );
}

function checkPrivateLibrary(config: AdminConfig): AdminHealthGroup {
  return group('privateLibrary', '私人影库', [
    checkOpenList(config),
    checkEmby(config),
    checkXiaoya(config),
    checkNetDisk(config),
  ]);
}

function checkMusic(config: AdminConfig): AdminHealthItem {
  const music = config.MusicConfig;
  if (!music?.Enabled) {
    return item('music', '音乐', 'disabled', '音乐功能未启用');
  }

  const missing = missingFields([['BaseUrl', hasText(music.BaseUrl)]]);
  if (music.OpenListCacheEnabled) {
    missing.push(
      ...missingFields([
        ['OpenListCacheURL', hasText(music.OpenListCacheURL)],
        ['OpenListCacheUsername', hasText(music.OpenListCacheUsername)],
        ['OpenListCachePassword', hasText(music.OpenListCachePassword)],
        ['OpenListCachePath', hasText(music.OpenListCachePath)],
      ])
    );
  }

  return item(
    'music',
    '音乐',
    missing.length > 0 ? 'error' : 'ok',
    missing.length > 0 ? missingMessage(missing) : '音乐服务配置完整'
  );
}

function checkManga(config: AdminConfig): AdminHealthItem {
  const manga = config.SuwayomiConfig;
  if (!manga?.Enabled) {
    return item('manga', '漫画', 'disabled', '漫画展馆未启用');
  }

  const missing = missingFields([['ServerURL', hasText(manga.ServerURL)]]);
  if (manga.AuthMode && manga.AuthMode !== 'none') {
    missing.push(
      ...missingFields([
        ['Username', hasText(manga.Username)],
        ['Password', hasText(manga.Password)],
      ])
    );
  }

  return item(
    'manga',
    '漫画',
    missing.length > 0 ? 'error' : 'ok',
    missing.length > 0 ? missingMessage(missing) : '漫画服务配置完整'
  );
}

function checkBooks(config: AdminConfig): AdminHealthItem {
  const opds = config.OPDSConfig;
  if (!opds?.Enabled) {
    return item('books', '电子书', 'disabled', '电子书馆未启用');
  }

  const sources = (opds.Sources || []).filter(
    (source) => source.enabled !== false
  );
  const brokenSources = sources.filter(
    (source) => !hasText(source.name) || !hasText(source.url)
  );

  if (sources.length === 0) {
    return item(
      'books',
      '电子书',
      'error',
      '电子书馆已启用，但没有可用 OPDS 源'
    );
  }

  return item(
    'books',
    '电子书',
    brokenSources.length > 0 ? 'error' : 'ok',
    brokenSources.length > 0
      ? `${brokenSources.length} 个 OPDS 源缺少名称或地址`
      : `已启用 ${sources.length} 个 OPDS 源`,
    brokenSources.map(
      (source) => `${source.name || source.id || '未命名源'} 缺少 name/url`
    )
  );
}

function checkContent(config: AdminConfig): AdminHealthGroup {
  return group('content', '内容扩展', [
    checkMusic(config),
    checkManga(config),
    checkBooks(config),
  ]);
}

function checkAI(config: AdminConfig): AdminHealthItem {
  const ai = config.AIConfig;
  if (!ai?.Enabled) {
    return item('ai', 'AI 问片', 'disabled', 'AI 问片未启用');
  }

  let missing: string[] = [];
  if (ai.Provider === 'openai') {
    missing = missingFields([
      ['OpenAIApiKey', hasText(ai.OpenAIApiKey)],
      ['OpenAIModel', hasText(ai.OpenAIModel)],
    ]);
  } else if (ai.Provider === 'claude') {
    missing = missingFields([
      ['ClaudeApiKey', hasText(ai.ClaudeApiKey)],
      ['ClaudeModel', hasText(ai.ClaudeModel)],
    ]);
  } else {
    missing = missingFields([
      ['CustomApiKey', hasText(ai.CustomApiKey)],
      ['CustomBaseURL', hasText(ai.CustomBaseURL)],
      ['CustomModel', hasText(ai.CustomModel)],
    ]);
  }

  return item(
    'ai',
    'AI 问片',
    missing.length > 0 ? 'error' : 'ok',
    missing.length > 0 ? missingMessage(missing) : 'AI 服务配置完整'
  );
}

function checkEmail(config: AdminConfig): AdminHealthItem {
  const email = config.EmailConfig;
  if (!email?.enabled) {
    return item('email', '邮件通知', 'disabled', '邮件通知未启用');
  }

  const missing =
    email.provider === 'resend'
      ? missingFields([
          ['Resend ApiKey', hasText(email.resend?.apiKey)],
          ['发件人', hasText(email.resend?.from)],
        ])
      : missingFields([
          ['SMTP Host', hasText(email.smtp?.host)],
          [
            'SMTP Port',
            typeof email.smtp?.port === 'number' && email.smtp.port > 0,
          ],
          ['SMTP User', hasText(email.smtp?.user)],
          ['SMTP Password', hasText(email.smtp?.password)],
          ['发件人', hasText(email.smtp?.from)],
        ]);

  return item(
    'email',
    '邮件通知',
    missing.length > 0 ? 'error' : 'ok',
    missing.length > 0 ? missingMessage(missing) : '邮件发送配置完整'
  );
}

function checkAccess(config: AdminConfig): AdminHealthGroup {
  const site = config.SiteConfig;
  const oidcEnabled = site.EnableOIDCLogin || site.EnableOIDCRegistration;
  const oidcMissing = oidcEnabled
    ? missingFields([
        ['ClientId', hasText(site.OIDCClientId)],
        [
          'Issuer 或完整端点',
          hasText(site.OIDCIssuer) ||
            (hasText(site.OIDCAuthorizationEndpoint) &&
              hasText(site.OIDCTokenEndpoint) &&
              hasText(site.OIDCUserInfoEndpoint)),
        ],
      ])
    : [];

  const turnstileMissing =
    site.LoginRequireTurnstile || site.RegistrationRequireTurnstile
      ? missingFields([
          ['TurnstileSiteKey', hasText(site.TurnstileSiteKey)],
          ['TurnstileSecretKey', hasText(site.TurnstileSecretKey)],
        ])
      : [];

  const inviteMissing =
    site.EnableRegistration && site.RequireRegistrationInviteCode
      ? missingFields([
          ['RegistrationInviteCode', hasText(site.RegistrationInviteCode)],
        ])
      : [];

  return group('access', '访问与通知', [
    item(
      'registration',
      '注册',
      inviteMissing.length > 0 || turnstileMissing.length > 0
        ? 'warning'
        : site.EnableRegistration
        ? 'ok'
        : 'disabled',
      inviteMissing.length > 0 || turnstileMissing.length > 0
        ? missingMessage([...inviteMissing, ...turnstileMissing])
        : site.EnableRegistration
        ? '注册功能已启用'
        : '注册功能未启用'
    ),
    item(
      'oidc',
      'OIDC 登录',
      oidcMissing.length > 0 ? 'error' : oidcEnabled ? 'ok' : 'disabled',
      oidcMissing.length > 0
        ? missingMessage(oidcMissing)
        : oidcEnabled
        ? 'OIDC 登录/注册配置完整'
        : 'OIDC 未启用'
    ),
    checkEmail(config),
  ]);
}

function checkAutomation(config: AdminConfig): AdminHealthGroup {
  const movieRequestEnabled = config.SiteConfig.EnableMovieRequest !== false;
  const animeConfig = config.AnimeSubscriptionConfig;
  const animeEnabled = animeConfig?.Enabled === true;
  const activeSubscriptions = (animeConfig?.Subscriptions || []).filter(
    (subscription) => subscription.enabled
  );

  return group('automation', '自动化', [
    item(
      'movieRequest',
      '求片',
      movieRequestEnabled ? 'ok' : 'disabled',
      movieRequestEnabled ? '求片功能已启用' : '求片功能未启用'
    ),
    item(
      'animeSubscription',
      '追番订阅',
      animeEnabled && activeSubscriptions.length === 0
        ? 'warning'
        : animeEnabled
        ? 'ok'
        : 'disabled',
      animeEnabled && activeSubscriptions.length === 0
        ? '追番订阅已启用，但没有启用中的订阅'
        : animeEnabled
        ? `已启用 ${activeSubscriptions.length} 个追番订阅`
        : '追番订阅未启用'
    ),
    checkAI(config),
  ]);
}

const QUALITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const QUALITY_TOP_N = 5;

function checkSourceQuality(
  config: AdminConfig,
  options: AdminHealthOptions
): AdminHealthGroup {
  const now = options.now || Date.now();
  const cutoff = now - QUALITY_WINDOW_MS;
  const history = config.SourceCheckState?.history || {};
  const targetNames = new Map(
    collectProbeTargets(config).map((target) => [target.key, target.name])
  );
  const nameOf = (key: string) => targetNames.get(key) || key;

  const slowest: Array<{ key: string; avg: number; n: number }> = [];
  const failed: Array<{ key: string; failCount: number; total: number }> = [];

  for (const [key, samples] of Object.entries(history)) {
    const recent = samples.filter((sample) => sample.t >= cutoff);
    if (recent.length === 0) continue;

    const okSamples = recent.filter(
      (sample) => sample.ok && typeof sample.ms === 'number'
    );
    if (okSamples.length > 0) {
      const avg = Math.round(
        okSamples.reduce((sum, sample) => sum + (sample.ms || 0), 0) /
          okSamples.length
      );
      slowest.push({ key, avg, n: okSamples.length });
    }

    const failCount = recent.filter((sample) => !sample.ok).length;
    if (failCount > 0) {
      failed.push({ key, failCount, total: recent.length });
    }
  }

  slowest.sort((a, b) => b.avg - a.avg);
  failed.sort((a, b) => b.failCount - a.failCount);

  const hasHistory = Object.keys(history).length > 0;
  const imageTop = (options.imageFailureTop || []).slice(0, QUALITY_TOP_N);

  return group('sourceQuality', '运行质量（24小时）', [
    item(
      'slowestSources',
      '最慢源排行',
      hasHistory ? 'ok' : 'disabled',
      hasHistory
        ? `按 24 小时平均响应耗时排序（${slowest.length} 个源有成功采样）`
        : '暂无巡检数据，每小时定时检测后自动生成',
      slowest
        .slice(0, QUALITY_TOP_N)
        .map((entry) => `${nameOf(entry.key)}：平均 ${entry.avg}ms（${entry.n} 次采样）`)
    ),
    item(
      'mostFailedSources',
      '失败最多源',
      !hasHistory ? 'disabled' : failed.length > 0 ? 'warning' : 'ok',
      !hasHistory
        ? '暂无巡检数据，每小时定时检测后自动生成'
        : failed.length > 0
        ? `24 小时内有 ${failed.length} 个源出现检测失败`
        : '24 小时内所有源检测均通过',
      failed
        .slice(0, QUALITY_TOP_N)
        .map((entry) => `${nameOf(entry.key)}：失败 ${entry.failCount}/${entry.total} 次`)
    ),
    item(
      'imageFailureDomains',
      '图片失败域名',
      imageTop.length > 0 ? 'warning' : 'disabled',
      imageTop.length > 0
        ? `24 小时内 ${imageTop.length} 个域名出现图片加载失败`
        : '暂无图片加载失败记录',
      imageTop.map((entry) => `${entry.domain}：失败 ${entry.count} 次`)
    ),
  ]);
}

export function buildAdminHealthReport(
  config: AdminConfig,
  options: AdminHealthOptions = {}
): AdminHealthReport {
  const storageType =
    options.storageType ||
    process.env.NEXT_PUBLIC_STORAGE_TYPE ||
    'localstorage';
  const groups = [
    checkBasic(config, storageType),
    checkVideoSources(config),
    checkSourceQuality(config, options),
    checkLive(config),
    checkPrivateLibrary(config),
    checkContent(config),
    checkAccess(config),
    checkAutomation(config),
  ];

  const summary = groups
    .flatMap((healthGroup) => healthGroup.items)
    .reduce<Record<AdminHealthStatus, number> & { total: number }>(
      (acc, currentItem) => {
        acc[currentItem.status] += 1;
        acc.total += 1;
        return acc;
      },
      {
        ok: 0,
        warning: 0,
        error: 0,
        disabled: 0,
        total: 0,
      }
    );

  return {
    generatedAt: options.now || Date.now(),
    summary,
    groups,
  };
}
