import type { AdminConfig } from './admin.types';

export type AdminTaskStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'idle'
  | 'unavailable';

export interface AdminTaskProgress {
  current: number;
  total: number;
  percent: number;
  label?: string;
}

export interface AdminTaskItem {
  id: string;
  title: string;
  type: string;
  status: AdminTaskStatus;
  message: string;
  progress?: AdminTaskProgress;
  error?: string;
  createdAt?: number;
  updatedAt?: number;
  actionHref?: string;
}

export interface AdminTaskGroup {
  key: string;
  label: string;
  status: AdminTaskStatus;
  items: AdminTaskItem[];
}

export interface AdminTaskReport {
  generatedAt: number;
  summary: Record<AdminTaskStatus, number> & { total: number };
  groups: AdminTaskGroup[];
}

export interface AdminTaskOptions {
  now?: number;
}

export interface AdminOfflineTaskInput {
  id: string;
  title: string;
  status: string;
  progress?: number;
  errorMessage?: string;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
}

export interface AdminNetdiskCheckTaskInput {
  id: string;
  platform: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    done: number;
    valid: number;
    invalid: number;
    unknown: number;
    rateLimited: number;
    currentBatch?: number;
    totalBatches?: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdminScanTaskInput {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    currentFolder?: string;
  };
  result?: {
    total: number;
    new: number;
    existing: number;
    errors: number;
  };
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface AdminMigrationProgressInput {
  key: string;
  operation: 'export' | 'import';
  phase: string;
  current: number;
  total: number;
  message: string;
  timestamp: number;
}

export interface AdminTaskSources {
  offlineTasks?: AdminOfflineTaskInput[];
  netdiskCheckTasks?: AdminNetdiskCheckTaskInput[];
  netdiskCooldownRemainingMs?: number;
  scanTasks?: AdminScanTaskInput[];
  migrationProgress?: AdminMigrationProgressInput[];
  movieRequestCounts?: {
    pending: number;
    fulfilled: number;
  };
}

const statusRank: Record<AdminTaskStatus, number> = {
  unavailable: 0,
  idle: 1,
  completed: 2,
  cancelled: 3,
  paused: 4,
  waiting: 5,
  running: 6,
  failed: 7,
};

function toTimestamp(value?: string | number | Date) {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function percent(current: number, total: number) {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function makeProgress(
  current: number,
  total: number,
  label?: string
): AdminTaskProgress {
  return {
    current,
    total,
    percent: percent(current, total),
    ...(label ? { label } : {}),
  };
}

function mapOfflineStatus(status: string): AdminTaskStatus {
  if (status === 'downloading') return 'running';
  if (status === 'pending') return 'waiting';
  if (status === 'completed') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'paused') return 'paused';
  return 'idle';
}

function group(
  key: string,
  label: string,
  items: AdminTaskItem[]
): AdminTaskGroup {
  const status = items.reduce<AdminTaskStatus>((current, currentItem) => {
    return statusRank[currentItem.status] > statusRank[current]
      ? currentItem.status
      : current;
  }, 'unavailable');

  return { key, label, status, items };
}

function offlineDownloadItems(tasks: AdminOfflineTaskInput[]): AdminTaskItem[] {
  if (tasks.length === 0) {
    return [
      {
        id: 'offline:overview',
        title: '离线下载',
        type: 'offline-download',
        status: 'idle',
        message: '暂无离线下载任务',
        actionHref: '/admin',
      },
    ];
  }

  return tasks.map((task) => {
    const status = mapOfflineStatus(task.status);
    const progressValue =
      typeof task.progress === 'number' ? Math.round(task.progress) : 0;

    return {
      id: `offline:${task.id}`,
      title: task.title || '未命名下载任务',
      type: 'offline-download',
      status,
      message:
        status === 'failed'
          ? task.errorMessage || '下载失败'
          : `离线下载状态：${task.status}`,
      progress: makeProgress(progressValue, 100, `${progressValue}%`),
      error: status === 'failed' ? task.errorMessage : undefined,
      createdAt: toTimestamp(task.createdAt),
      updatedAt: toTimestamp(task.updatedAt),
      actionHref: '/admin',
    };
  });
}

function netdiskCheckItems(
  tasks: AdminNetdiskCheckTaskInput[],
  cooldownRemainingMs = 0
): AdminTaskItem[] {
  const items = tasks.map<AdminTaskItem>((task) => ({
    id: `netdisk-check:${task.id}`,
    title: `${task.platform} 网盘链接检测`,
    type: 'netdisk-check',
    status:
      task.status === 'failed'
        ? 'failed'
        : task.status === 'running'
        ? 'running'
        : task.status === 'cancelled'
        ? 'cancelled'
        : 'completed',
    message:
      task.status === 'failed'
        ? task.error || '检测失败'
        : `已检测 ${task.progress.done}/${task.progress.total}，有效 ${task.progress.valid}，失效 ${task.progress.invalid}`,
    progress: makeProgress(
      task.progress.done,
      task.progress.total,
      `批次 ${task.progress.currentBatch || 0}/${
        task.progress.totalBatches || 0
      }`
    ),
    error: task.status === 'failed' ? task.error : undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    actionHref: '/admin',
  }));

  if (cooldownRemainingMs > 0) {
    items.unshift({
      id: 'netdisk-check:cooldown',
      title: '网盘检测冷却',
      type: 'netdisk-check',
      status: 'waiting',
      message: `检测功能冷却中，剩余 ${Math.ceil(
        cooldownRemainingMs / 1000
      )} 秒`,
      updatedAt: Date.now(),
      actionHref: '/admin',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'netdisk-check:overview',
      title: '网盘链接检测',
      type: 'netdisk-check',
      status: 'idle',
      message: '暂无网盘链接检测任务',
      actionHref: '/admin',
    });
  }

  return items;
}

function scanItems(tasks: AdminScanTaskInput[]): AdminTaskItem[] {
  if (tasks.length === 0) {
    return [
      {
        id: 'scan:overview',
        title: 'OpenList 扫描',
        type: 'openlist-scan',
        status: 'idle',
        message: '暂无 OpenList 扫描任务',
        actionHref: '/admin',
      },
    ];
  }

  return tasks.map((task) => ({
    id: `scan:${task.id}`,
    title: 'OpenList 扫描',
    type: 'openlist-scan',
    status:
      task.status === 'failed'
        ? 'failed'
        : task.status === 'running'
        ? 'running'
        : 'completed',
    message:
      task.status === 'failed'
        ? task.error || '扫描失败'
        : task.status === 'completed' && task.result
        ? `扫描完成：新增 ${task.result.new}，已有 ${task.result.existing}，错误 ${task.result.errors}`
        : task.progress.currentFolder
        ? `正在扫描：${task.progress.currentFolder}`
        : `扫描进度 ${task.progress.current}/${task.progress.total}`,
    progress: makeProgress(task.progress.current, task.progress.total),
    error: task.status === 'failed' ? task.error : undefined,
    createdAt: task.startTime,
    updatedAt: task.endTime || task.startTime,
    actionHref: '/admin',
  }));
}

function migrationItems(
  progressItems: AdminMigrationProgressInput[]
): AdminTaskItem[] {
  if (progressItems.length === 0) {
    return [
      {
        id: 'migration:overview',
        title: '数据迁移',
        type: 'data-migration',
        status: 'idle',
        message: '暂无数据迁移任务',
        actionHref: '/admin',
      },
    ];
  }

  return progressItems.map((progressItem) => {
    const completed =
      progressItem.phase === 'completed' ||
      (progressItem.total > 0 && progressItem.current >= progressItem.total);

    return {
      id: `migration:${progressItem.key}`,
      title: progressItem.operation === 'export' ? '数据导出' : '数据导入',
      type: 'data-migration',
      status: completed ? 'completed' : 'running',
      message: progressItem.message,
      progress: makeProgress(progressItem.current, progressItem.total),
      updatedAt: progressItem.timestamp,
      actionHref: '/admin',
    };
  });
}

function liveOverviewItem(config: AdminConfig): AdminTaskItem {
  const liveSources = (config.LiveConfig || []).filter(
    (source) => !source.disabled
  );
  const channelCount = liveSources.reduce(
    (count, source) => count + (source.channelNumber || 0),
    0
  );

  return {
    id: 'live:overview',
    title: '直播源刷新',
    type: 'live-refresh',
    status: liveSources.length > 0 ? 'idle' : 'unavailable',
    message:
      liveSources.length > 0
        ? `已启用 ${liveSources.length} 个直播源，共 ${channelCount} 个频道`
        : '未启用电视直播源',
    actionHref: '/admin',
  };
}

function animeOverviewItem(config: AdminConfig): AdminTaskItem {
  const animeConfig = config.AnimeSubscriptionConfig;
  const subscriptions = animeConfig?.Subscriptions || [];
  const activeCount = subscriptions.filter(
    (subscription) => subscription.enabled
  ).length;
  const lastCheckTime = subscriptions.reduce<number | undefined>(
    (latest, subscription) => {
      if (!subscription.lastCheckTime) return latest;
      return Math.max(latest || 0, subscription.lastCheckTime);
    },
    undefined
  );

  return {
    id: 'anime:overview',
    title: '追番订阅',
    type: 'anime-subscription',
    status: animeConfig?.Enabled ? 'idle' : 'unavailable',
    message: animeConfig?.Enabled
      ? `${activeCount} 个启用订阅，最新检查集数会在订阅配置中更新`
      : '追番订阅未启用',
    updatedAt: lastCheckTime,
    actionHref: '/admin',
  };
}

function movieRequestOverviewItem(
  counts?: AdminTaskSources['movieRequestCounts']
): AdminTaskItem {
  return {
    id: 'movie-request:overview',
    title: '求片处理',
    type: 'movie-request',
    status: counts && counts.pending > 0 ? 'waiting' : 'idle',
    message: counts
      ? `${counts.pending} 个待处理，${counts.fulfilled} 个已完成`
      : '暂未获取求片统计',
    actionHref: '/admin',
  };
}

function automationItems(
  config: AdminConfig,
  sources: AdminTaskSources
): AdminTaskItem[] {
  return [
    liveOverviewItem(config),
    animeOverviewItem(config),
    movieRequestOverviewItem(sources.movieRequestCounts),
  ];
}

export function buildAdminTaskReport(
  config: AdminConfig,
  sources: AdminTaskSources = {},
  options: AdminTaskOptions = {}
): AdminTaskReport {
  const groups = [
    group(
      'downloads',
      '下载任务',
      offlineDownloadItems(sources.offlineTasks || [])
    ),
    group('checks', '扫描与检测', [
      ...scanItems(sources.scanTasks || []),
      ...netdiskCheckItems(
        sources.netdiskCheckTasks || [],
        sources.netdiskCooldownRemainingMs
      ),
    ]),
    group(
      'migration',
      '数据迁移',
      migrationItems(sources.migrationProgress || [])
    ),
    group('automation', '自动化状态', automationItems(config, sources)),
  ];

  const summary = groups
    .flatMap((taskGroup) => taskGroup.items)
    .reduce<Record<AdminTaskStatus, number> & { total: number }>(
      (acc, currentItem) => {
        acc[currentItem.status] += 1;
        acc.total += 1;
        return acc;
      },
      {
        running: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        paused: 0,
        idle: 0,
        unavailable: 0,
        total: 0,
      }
    );

  return {
    generatedAt: options.now || Date.now(),
    summary,
    groups,
  };
}
