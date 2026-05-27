import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getActivitySnapshot,
  ONLINE_THRESHOLD_MS,
} from '@/lib/user-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  const username = authInfo?.username;
  if (!username) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  if (username !== process.env.USERNAME) {
    const userInfo = await db.getUserInfoV2(username);
    if (!userInfo || userInfo.role !== 'admin' || userInfo.banned) {
      return NextResponse.json({ error: '权限不足' }, { status: 401 });
    }
  }

  return NextResponse.json({
    serverTime: Date.now(),
    onlineThresholdMs: ONLINE_THRESHOLD_MS,
    activity: getActivitySnapshot(),
  });
}
