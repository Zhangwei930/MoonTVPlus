/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  if (!url) {
    return new Response('Missing url', { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  const ua = liveSource?.ua || 'AptvPlayer/1.4.10';

  try {
    const decodedUrl = decodeURIComponent(url);
    const upstream = await fetch(decodedUrl, {
      headers: { 'User-Agent': ua },
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      return new Response('Upstream error', { status: upstream.status });
    }

    // Buffer the full segment — nginx proxy_buffering requires a complete
    // response body; ReadableStream passthrough causes nginx 500.
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': String(buffer.byteLength),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Failed to fetch segment', { status: 502 });
  }
}
