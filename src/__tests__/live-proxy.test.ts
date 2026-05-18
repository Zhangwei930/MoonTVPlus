import {
  buildLiveProxyBaseUrl,
  rewriteLiveM3U8Content,
} from '@/lib/live-proxy';

function makeRequest(url: string, headers: Record<string, string>): Request {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    url,
    headers: {
      get: (key: string) => normalizedHeaders[key.toLowerCase()] || null,
    },
  } as Request;
}

describe('live proxy helpers', () => {
  it('uses forwarded https origin for rewritten segment urls', () => {
    const request = makeRequest(
      'http://127.0.0.1:3000/api/proxy/m3u8?moontv-source=cn-main',
      {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'tv.example.com',
        'x-forwarded-proto': 'https',
      }
    );

    expect(buildLiveProxyBaseUrl(request)).toBe('https://tv.example.com/api/proxy');

    const rewritten = rewriteLiveM3U8Content(
      ['#EXTM3U', '#EXTINF:8.00,', 'segment-001.ts'].join('\n'),
      'https://origin.example.com/live/channel/',
      request,
      false
    );

    expect(rewritten).toContain(
      'https://tv.example.com/api/proxy/segment?url=https%3A%2F%2Forigin.example.com%2Flive%2Fchannel%2Fsegment-001.ts&moontv-source=cn-main'
    );
  });

  it('keeps media segments direct in m3u8-only mode', () => {
    const request = makeRequest(
      'http://127.0.0.1:3000/api/proxy/m3u8?moontv-source=cn-main',
      {
        host: '127.0.0.1:3000',
        referer: 'https://tv.example.com/live',
      }
    );

    const rewritten = rewriteLiveM3U8Content(
      ['#EXTM3U', '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', '#EXTINF:8.00,', 'segment-001.ts'].join('\n'),
      'https://origin.example.com/live/channel/',
      request,
      true
    );

    expect(rewritten).toContain('URI="https://origin.example.com/live/channel/key.bin"');
    expect(rewritten).toContain('https://origin.example.com/live/channel/segment-001.ts');
    expect(rewritten).not.toContain('/api/proxy/segment');
  });
});
