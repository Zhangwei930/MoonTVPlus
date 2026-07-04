/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { requireFeaturePermission } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authResult = await requireFeaturePermission(request, 'live', '无权限访问电视直播');
  if (authResult instanceof NextResponse) return authResult;
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  try {
    const decodedUrl = decodeURIComponent(url);

    let response: Response;
    try {
      response = await fetch(decodedUrl, {
        cache: 'no-cache',
        redirect: 'follow',
        headers: { 'User-Agent': ua },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Network error or timeout — assume m3u8 and let the player handle it
      return NextResponse.json({ success: true, type: 'm3u8' }, { status: 200 });
    }

    if (!response.ok) {
      // Non-2xx but reachable — still assume m3u8
      return NextResponse.json({ success: true, type: 'm3u8' }, { status: 200 });
    }

    const contentType = response.headers.get('Content-Type') || '';
    const normalizedContentType = contentType.toLowerCase();
    const finalUrl = response.url || decodedUrl;
    const normalizedUrl = finalUrl.toLowerCase().split('?')[0];
    if (response.body) {
      response.body.cancel();
    }
    if (normalizedContentType.includes('video/mp4') || normalizedUrl.endsWith('.mp4')) {
      return NextResponse.json({ success: true, type: 'mp4' }, { status: 200 });
    }
    if (
      normalizedContentType.includes('video/x-flv') ||
      normalizedContentType.includes('video/flv') ||
      normalizedUrl.endsWith('.flv')
    ) {
      return NextResponse.json({ success: true, type: 'flv' }, { status: 200 });
    }
    // Unknown content type — assume m3u8 and let the player handle it
    return NextResponse.json({ success: true, type: 'm3u8' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch', message: String(error) }, { status: 500 });
  }
}
