/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// jest 27 的 node 环境不注入 fetch/Response 等 Web API，这里用最小实现补齐
import { ReadableStream } from 'node:stream/web';

class StubHeaders {
  private map = new Map<string, string>();
  constructor(init?: Record<string, string>) {
    Object.entries(init || {}).forEach(([k, v]) => this.set(k, v));
  }
  get(key: string) {
    return this.map.get(key.toLowerCase()) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key.toLowerCase(), value);
  }
}

class StubResponse {
  body: any;
  status: number;
  headers: StubHeaders;
  constructor(body: any, init: any = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new StubHeaders(init.headers);
  }
  async text() {
    if (typeof this.body === 'string' || this.body == null) {
      return this.body ?? '';
    }
    const reader = this.body.getReader();
    let out = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return out;
      out += decoder.decode(value);
    }
  }
}

(global as any).ReadableStream = ReadableStream;
(global as any).Headers = StubHeaders;
(global as any).Response = StubResponse;
if (typeof (global as any).AbortSignal === 'undefined') {
  (global as any).AbortSignal = { timeout: () => undefined };
} else if (typeof (global as any).AbortSignal.timeout !== 'function') {
  (global as any).AbortSignal.timeout = () => undefined;
}

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn().mockResolvedValue({
    LiveConfig: [{ key: 'testlive', ua: 'TestUA/1.0' }],
  }),
}));

import { GET } from '@/app/api/proxy/segment/route';

function makeRequest(url?: string) {
  const base = 'http://localhost/api/proxy/segment';
  const full = url
    ? `${base}?url=${encodeURIComponent(url)}&moontv-source=testlive`
    : base;
  return { url: full } as Request;
}

function makeUpstreamBody(parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      parts.forEach((p) => controller.enqueue(encoder.encode(p)));
      controller.close();
    },
  });
}

describe('/api/proxy/segment (live TS proxy)', () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('returns 400 when url is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('streams the upstream body without buffering it', async () => {
    const arrayBufferSpy = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeUpstreamBody(['part1-', 'part2']),
      arrayBuffer: arrayBufferSpy,
      headers: new StubHeaders({ 'content-length': '999' }),
    });

    const res = await GET(makeRequest('https://example.com/seg1.ts'));

    expect(res.status).toBe(200);
    // 不允许整段读入内存
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    // 不透传上游 Content-Length（fetch 解压后长度会不一致，导致 nginx 报错）
    expect(res.headers.get('Content-Length')).toBeNull();
    expect(await (res as any).text()).toBe('part1-part2');
  });

  it('sets streaming-friendly headers with short public cache', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeUpstreamBody([]),
      headers: new StubHeaders(),
    });

    const res = await GET(makeRequest('https://example.com/seg1.ts'));

    expect(res.headers.get('Content-Type')).toBe('video/mp2t');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
  });

  it('maps upstream HTTP error status through', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const res = await GET(makeRequest('https://example.com/seg1.ts'));
    expect(res.status).toBe(503);
  });

  it('returns 502 when fetch throws', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const res = await GET(makeRequest('https://example.com/seg1.ts'));
    expect(res.status).toBe(502);
  });

  it('uses the live source UA when configured', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      body: makeUpstreamBody([]),
      headers: new StubHeaders(),
    });
    (global as any).fetch = fetchSpy;

    await GET(makeRequest('https://example.com/seg1.ts'));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/seg1.ts',
      expect.objectContaining({
        headers: { 'User-Agent': 'TestUA/1.0' },
      })
    );
  });
});
