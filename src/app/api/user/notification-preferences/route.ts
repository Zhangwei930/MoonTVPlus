/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getStorage } from '@/lib/db';
import {
  getUserNotificationPreferences,
  setUserNotificationPreferences,
} from '@/lib/notification-preferences';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const storage = getStorage();
    const preferences = await getUserNotificationPreferences(
      storage,
      authInfo.username
    );

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('获取通知偏好失败:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const storage = getStorage();
    const body = await request.json();
    const preferences = await setUserNotificationPreferences(
      storage,
      authInfo.username,
      body.preferences
    );

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('保存通知偏好失败:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
