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

    // 流式透传，首包立即返回；不透传 Content-Length——fetch 可能已解压
    // 上游 body，长度不一致会导致 nginx 截断报错（nginx 侧已对
    // /api/proxy/ 关闭 proxy_buffering）。直播分片 URL 唯一且内容不可变，
    // 短缓存可吸收回看/重试的重复请求。
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch {
    return new Response('Failed to fetch segment', { status: 502 });
  }
}
