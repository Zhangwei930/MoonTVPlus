import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { recordImageFailure } from '@/lib/image-failure-stats';

export const runtime = 'nodejs';

// 客户端图片加载失败上报（sendBeacon），按域名聚合供管理后台展示
export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (typeof body?.url === 'string' && body.url.length <= 2048) {
      recordImageFailure(body.url);
    }
  } catch {
    // 非法 body 直接忽略，统计接口不需要报错给客户端
  }

  return new NextResponse(null, { status: 204 });
}
