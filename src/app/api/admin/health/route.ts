/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { buildAdminHealthReport } from '@/lib/admin-health';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getTopImageFailureDomains } from '@/lib/image-failure-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员体检',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (authInfo.username !== process.env.USERNAME) {
      const { db } = await import('@/lib/db');
      const userInfoV2 = await db.getUserInfoV2(authInfo.username);

      if (
        !userInfoV2 ||
        (userInfoV2.role !== 'admin' && userInfoV2.role !== 'owner') ||
        userInfoV2.banned
      ) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const config = await getConfig();
    const report = buildAdminHealthReport(config, {
      storageType,
      imageFailureTop: getTopImageFailureDomains(5),
    });

    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('生成管理员体检报告失败:', error);
    return NextResponse.json(
      {
        error: '生成管理员体检报告失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
