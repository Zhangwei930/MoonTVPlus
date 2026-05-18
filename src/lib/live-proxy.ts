function firstHeaderValue(value: string | null): string {
  return (value || '').split(',')[0].trim();
}

function resolveUrl(baseUrl: string, relativePath: string) {
  try {
    if (
      relativePath.startsWith('http://') ||
      relativePath.startsWith('https://')
    ) {
      return relativePath;
    }

    if (relativePath.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${relativePath}`;
    }

    const baseUrlObj = new URL(baseUrl);
    return new URL(relativePath, baseUrlObj).href;
  } catch (error) {
    return fallbackUrlResolve(baseUrl, relativePath);
  }
}

function fallbackUrlResolve(baseUrl: string, relativePath: string) {
  let base = baseUrl;
  if (!base.endsWith('/')) {
    base = base.substring(0, base.lastIndexOf('/') + 1);
  }

  if (relativePath.startsWith('/')) {
    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}${relativePath}`;
  }

  if (relativePath.startsWith('../')) {
    const segments = base.split('/').filter((s) => s);
    const relativeSegments = relativePath.split('/').filter((s) => s);

    for (const segment of relativeSegments) {
      if (segment === '..') {
        segments.pop();
      } else if (segment !== '.') {
        segments.push(segment);
      }
    }

    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}/${segments.join('/')}`;
  }

  const cleanRelative = relativePath.startsWith('./')
    ? relativePath.slice(2)
    : relativePath;
  return base + cleanRelative;
}

export function getBaseUrl(m3u8Url: string) {
  try {
    const url = new URL(m3u8Url);
    if (url.pathname.endsWith('.m3u8')) {
      url.pathname = url.pathname.substring(
        0,
        url.pathname.lastIndexOf('/') + 1
      );
    } else if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    return url.protocol + '//' + url.host + url.pathname;
  } catch (error) {
    return m3u8Url.endsWith('/') ? m3u8Url : m3u8Url + '/';
  }
}

function getForwardedProto(request: Request): string {
  const headers = request.headers;
  const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'));
  if (forwardedProto) return forwardedProto;

  const forwardedProtocol = firstHeaderValue(headers.get('x-forwarded-protocol'));
  if (forwardedProtocol) return forwardedProtocol;

  const urlScheme = firstHeaderValue(headers.get('x-url-scheme'));
  if (urlScheme) return urlScheme;

  const cfVisitor = headers.get('cf-visitor');
  if (cfVisitor) {
    try {
      const visitor = JSON.parse(cfVisitor) as { scheme?: string };
      if (visitor.scheme) return visitor.scheme;
    } catch (error) {
      // ignore malformed proxy metadata
    }
  }

  const referer = headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).protocol.replace(':', '');
    } catch (error) {
      // ignore malformed referer
    }
  }

  try {
    return new URL(request.url).protocol.replace(':', '');
  } catch (error) {
    return 'http';
  }
}

function normalizeProtocol(protocol: string): 'http' | 'https' {
  return protocol.toLowerCase() === 'https' ? 'https' : 'http';
}

export function buildLiveProxyBaseUrl(request: Request): string {
  // NEXT_PUBLIC_BASE_URL explicitly set (e.g. https://tv.magies.top) takes priority
  const envBase = process.env.NEXT_PUBLIC_BASE_URL;
  if (envBase) {
    try {
      const u = new URL(envBase);
      return `${u.protocol}//${u.host}/api/proxy`;
    } catch {
      // fall through
    }
  }

  const protocol = normalizeProtocol(getForwardedProto(request));
  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ||
    firstHeaderValue(request.headers.get('host')) ||
    (() => {
      try {
        return new URL(request.url).host;
      } catch (error) {
        return '';
      }
    })();

  return `${protocol}://${host}/api/proxy`;
}

function buildLiveProxyUrl(
  proxyBase: string,
  path: 'm3u8' | 'segment' | 'key',
  targetUrl: string,
  source: string
): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (source) {
    params.set('moontv-source', source);
  }
  return `${proxyBase}/${path}?${params.toString()}`;
}

function rewriteMapUri(
  line: string,
  baseUrl: string,
  proxyBase: string,
  allowCORS: boolean,
  source: string
) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (!uriMatch) return line;

  const resolvedUrl = resolveUrl(baseUrl, uriMatch[1]);
  const nextUri = allowCORS
    ? upgradeToHttps(resolvedUrl)
    : buildLiveProxyUrl(proxyBase, 'segment', resolvedUrl, source);

  return line.replace(uriMatch[0], `URI="${nextUri}"`);
}

function rewriteKeyUri(
  line: string,
  baseUrl: string,
  proxyBase: string,
  allowCORS: boolean,
  source: string
) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (!uriMatch) return line;

  const resolvedUrl = resolveUrl(baseUrl, uriMatch[1]);
  const nextUri = allowCORS
    ? upgradeToHttps(resolvedUrl)
    : buildLiveProxyUrl(proxyBase, 'key', resolvedUrl, source);

  return line.replace(uriMatch[0], `URI="${nextUri}"`);
}

// In m3u8-only (allowCORS) mode upgrade http segment URLs to https so the
// browser can fetch them directly without mixed-content blocks.
function upgradeToHttps(url: string): string {
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
}

export function rewriteLiveM3U8Content(
  content: string,
  baseUrl: string,
  request: Request,
  allowCORS: boolean
): string {
  const proxyBase = buildLiveProxyBaseUrl(request);
  const requestUrl = new URL(request.url);
  const source = requestUrl.searchParams.get('moontv-source') || '';
  const lines = content.split('\n');
  const rewrittenLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      rewrittenLines.push(
        allowCORS
          ? upgradeToHttps(resolvedUrl)
          : buildLiveProxyUrl(proxyBase, 'segment', resolvedUrl, source)
      );
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteMapUri(line, baseUrl, proxyBase, allowCORS, source);
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteKeyUri(line, baseUrl, proxyBase, allowCORS, source);
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const resolvedUrl = resolveUrl(baseUrl, nextLine);
          rewrittenLines.push(
            buildLiveProxyUrl(proxyBase, 'm3u8', resolvedUrl, source)
          );
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}
