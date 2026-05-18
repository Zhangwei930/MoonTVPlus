/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { getBaseUrl, rewriteLiveM3U8Content } from "@/lib/live-proxy";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const allowCORS = searchParams.get('allowCORS') === 'true';
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

  let response: Response | null = null;

  try {
    const decodedUrl = decodeURIComponent(url);

    response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      headers: {
        'User-Agent': ua,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch m3u8' }, { status: 500 });
    }

    const contentType = response.headers.get('Content-Type') || '';
    const finalUrl = response.url;
    const bodyText = await response.text();
    response = null; // body consumed

    const trimmed = bodyText.trimStart();
    const looksLikeM3u8 = trimmed.startsWith('#EXTM3U') || trimmed.includes('#EXTINF') || trimmed.includes('#EXT-X-');

    if (looksLikeM3u8) {
      const baseUrl = getBaseUrl(finalUrl);
      const modifiedContent = rewriteLiveM3U8Content(bodyText, baseUrl, request, allowCORS);

      const headers = new Headers();
      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      return new Response(modifiedContent, { headers });
    }

    // Not M3U8 — proxy as-is (e.g. binary TS stream on a weird URL)
    const headers = new Headers();
    headers.set('Content-Type', contentType || 'application/octet-stream');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    return new Response(bodyText, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch m3u8' }, { status: 500 });
  } finally {
    if (response) {
      try { response.body?.cancel(); } catch { /* ignore */ }
    }
  }
}
