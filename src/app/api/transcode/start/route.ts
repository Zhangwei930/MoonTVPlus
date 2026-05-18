/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { requireFeaturePermission } from '@/lib/permissions';
import { startTranscodeSession } from '@/lib/transcoder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_UA = 'AptvPlayer/1.4.10';

export async function POST(request: NextRequest) {
  const auth = await requireFeaturePermission(request, 'live', '无权限访问电视直播');
  if (auth instanceof NextResponse) return auth;

  let body: { url?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url : '';
  const source = typeof body.source === 'string' ? body.source : '';
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  const ua = liveSource?.ua || DEFAULT_UA;

  try {
    const { sessionId } = await startTranscodeSession(url, ua);
    return NextResponse.json({
      sessionId,
      playlistUrl: `/api/transcode/segments/${sessionId}/index.m3u8`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '转码启动失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
