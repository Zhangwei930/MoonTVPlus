'use client';

import {
  type LucideIcon,
  AlertCircle,
  CheckCircle,
  CircleOff,
  Clock,
  Loader2,
  PauseCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminTaskReport, AdminTaskStatus } from '@/lib/admin-tasks';

const statusMeta: Record<
  AdminTaskStatus,
  {
    label: string;
    className: string;
    Icon: LucideIcon;
  }
> = {
  running: {
    label: '运行中',
    className:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    Icon: Loader2,
  },
  waiting: {
    label: '等待中',
    className:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    Icon: Clock,
  },
  completed: {
    label: '已完成',
    className:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    Icon: CheckCircle,
  },
  failed: {
    label: '失败',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    Icon: AlertCircle,
  },
  cancelled: {
    label: '已取消',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    Icon: XCircle,
  },
  paused: {
    label: '已暂停',
    className:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
    Icon: PauseCircle,
  },
  idle: {
    label: '空闲',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    Icon: Clock,
  },
  unavailable: {
    label: '未启用',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    Icon: CircleOff,
  },
};

function StatusBadge({ status }: { status: AdminTaskStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${meta.className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`}
      />
      {meta.label}
    </span>
  );
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '暂无';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
}

export default function AdminTaskPanel() {
  const [report, setReport] = useState<AdminTaskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasActiveTasks = useMemo(() => {
    if (!report) return false;
    return report.summary.running > 0 || report.summary.waiting > 0;
  }, [report]);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/admin/tasks', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取任务失败');
      }

      setReport(data as AdminTaskReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(loadReport, 8000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, loadReport]);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-sm text-gray-600 dark:text-gray-400'>
            汇总下载、扫描、检测、迁移和自动化状态。
          </p>
          {report && (
            <p className='mt-1 text-xs text-gray-500 dark:text-gray-500'>
              生成时间：{formatTime(report.generatedAt)}
            </p>
          )}
        </div>
        <button
          onClick={loadReport}
          disabled={loading}
          className='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700'
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '刷新中...' : '刷新任务'}
        </button>
      </div>

      {error && (
        <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'>
          {error}
        </div>
      )}

      {loading && !report && (
        <div className='space-y-3'>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className='h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60'
            />
          ))}
        </div>
      )}

      {report && (
        <>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-9'>
            <div className='rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700'>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                总项
              </div>
              <div className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                {report.summary.total}
              </div>
            </div>
            {(
              [
                'running',
                'waiting',
                'failed',
                'paused',
                'completed',
                'cancelled',
                'idle',
                'unavailable',
              ] as AdminTaskStatus[]
            ).map((status) => (
              <div
                key={status}
                className='rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700'
              >
                <div className='text-xs text-gray-500 dark:text-gray-400'>
                  {statusMeta[status].label}
                </div>
                <div className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                  {report.summary[status]}
                </div>
              </div>
            ))}
          </div>

          <div className='overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700'>
            {report.groups.map((group) => (
              <div
                key={group.key}
                className='border-b border-gray-200 last:border-b-0 dark:border-gray-700'
              >
                <div className='flex items-center justify-between bg-gray-50 px-4 py-3 dark:bg-gray-800/70'>
                  <h4 className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                    {group.label}
                  </h4>
                  <StatusBadge status={group.status} />
                </div>
                <div className='divide-y divide-gray-100 dark:divide-gray-700'>
                  {group.items.map((item) => (
                    <div key={item.id} className='px-4 py-3'>
                      <div className='grid gap-2 sm:grid-cols-[11rem_6rem_1fr_9rem]'>
                        <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                          {item.title}
                        </div>
                        <div>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className='text-sm text-gray-600 dark:text-gray-300'>
                          <div>{item.message}</div>
                          {item.error && (
                            <div className='mt-1 text-xs text-red-600 dark:text-red-300'>
                              {item.error}
                            </div>
                          )}
                          {item.progress && (
                            <div className='mt-2'>
                              <div className='h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700'>
                                <div
                                  className='h-full rounded-full bg-blue-600 dark:bg-blue-500'
                                  style={{ width: `${item.progress.percent}%` }}
                                />
                              </div>
                              <div className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                                {item.progress.current}/{item.progress.total} ·{' '}
                                {item.progress.percent}%
                                {item.progress.label
                                  ? ` · ${item.progress.label}`
                                  : ''}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className='text-xs text-gray-500 dark:text-gray-400 sm:text-right'>
                          {formatTime(item.updatedAt || item.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
