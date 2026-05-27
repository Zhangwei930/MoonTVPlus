'use client';

import {
  type LucideIcon,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CircleOff,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AdminHealthReport, AdminHealthStatus } from '@/lib/admin-health';

const statusMeta: Record<
  AdminHealthStatus,
  {
    label: string;
    className: string;
    Icon: LucideIcon;
  }
> = {
  ok: {
    label: '正常',
    className:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    Icon: CheckCircle,
  },
  warning: {
    label: '注意',
    className:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    Icon: AlertTriangle,
  },
  error: {
    label: '异常',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    Icon: AlertCircle,
  },
  disabled: {
    label: '未启用',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    Icon: CircleOff,
  },
};

function StatusBadge({ status }: { status: AdminHealthStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${meta.className}`}
    >
      <Icon className='h-3.5 w-3.5' />
      {meta.label}
    </span>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
}

export default function AdminHealthPanel() {
  const [report, setReport] = useState<AdminHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/admin/health', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '体检失败');
      }

      setReport(data as AdminHealthReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : '体检失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-sm text-gray-600 dark:text-gray-400'>
            检查配置完整性，不会请求外部服务或暴露密钥。
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
          {loading ? '体检中...' : '重新体检'}
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
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
            <div className='rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700'>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                总项
              </div>
              <div className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                {report.summary.total}
              </div>
            </div>
            {(
              ['ok', 'warning', 'error', 'disabled'] as AdminHealthStatus[]
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
                  {group.items.map((healthItem) => (
                    <div
                      key={healthItem.key}
                      className='grid gap-2 px-4 py-3 sm:grid-cols-[10rem_6rem_1fr]'
                    >
                      <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                        {healthItem.label}
                      </div>
                      <div>
                        <StatusBadge status={healthItem.status} />
                      </div>
                      <div className='text-sm text-gray-600 dark:text-gray-300'>
                        <div>{healthItem.message}</div>
                        {healthItem.details &&
                          healthItem.details.length > 0 && (
                            <ul className='mt-2 list-disc space-y-1 pl-5 text-xs text-gray-500 dark:text-gray-400'>
                              {healthItem.details.map((detail) => (
                                <li key={detail}>{detail}</li>
                              ))}
                            </ul>
                          )}
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
