/* eslint-disable no-console */

import * as fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';

import { buildAdminTaskReport } from '@/lib/admin-tasks';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getAllProgress } from '@/lib/data-migration-progress';
import { db, getStorage } from '@/lib/db';
import {
  getAllNetdiskCheckTasks,
  getNetdiskCheckCooldownRemainingMs,
} from '@/lib/netdisk-check-task';
import { getAllScanTasks } from '@/lib/scan-task';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OFFLINE_DOWNLOAD_DIR = process.env.OFFLINE_DOWNLOAD_DIR || '/data';
const TASKS_FILE = path.join(OFFLINE_DOWNLOAD_DIR, 'tasks.json');

async function requireAdmin(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authInfo.username === process.env.USERNAME) {
    return null;
  }

  const userInfo = await db.getUserInfoV2(authInfo.username);
  if (!userInfo || userInfo.banned || userInfo.role !== 'admin') {
    return NextResponse.json({ error: '权限不足' }, { status: 401 });
  }

  return null;
}

function readOfflineTasks() {
  if (process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD !== 'true') {
    return [];
  }

  try {
    if (!fs.existsSync(TASKS_FILE)) {
      return [];
    }

    const content = fs.readFileSync(TASKS_FILE, 'utf-8');
    const tasks = JSON.parse(content);
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    console.error('读取离线下载任务失败:', error);
    return [];
  }
}

async function getMovieRequestCounts() {
  try {
    const requests = await getStorage().getAllMovieRequests();
    return requests.reduce(
      (acc, request) => {
        acc[request.status] += 1;
        return acc;
      },
      { pending: 0, fulfilled: 0 }
    );
  } catch (error) {
    console.error('获取求片统计失败:', error);
    return { pending: 0, fulfilled: 0 };
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const [config, movieRequestCounts] = await Promise.all([
      getConfig(),
      getMovieRequestCounts(),
    ]);

    const report = buildAdminTaskReport(config, {
      offlineTasks: readOfflineTasks(),
      netdiskCheckTasks: getAllNetdiskCheckTasks(),
      netdiskCooldownRemainingMs: getNetdiskCheckCooldownRemainingMs(),
      scanTasks: getAllScanTasks(),
      migrationProgress: getAllProgress(),
      movieRequestCounts,
    });

    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('生成管理员任务报告失败:', error);
    return NextResponse.json(
      {
        error: '生成管理员任务报告失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
