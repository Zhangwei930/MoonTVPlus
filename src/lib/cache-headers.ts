/**
 * 搜索等按用户权限过滤的响应只允许浏览器私有缓存，
 * 禁止 CDN/共享缓存，避免把 A 用户的私人影库/Emby 结果缓存给 B 用户。
 * 公共元数据（豆瓣/TMDB/Bangumi）仍可使用 public + s-maxage。
 */
export function buildPrivateCacheHeaders(
  cacheTime: number
): Record<string, string> {
  return {
    'Cache-Control': `private, max-age=${cacheTime}`,
  };
}
