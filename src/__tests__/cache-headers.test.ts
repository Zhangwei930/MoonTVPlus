import { buildPrivateCacheHeaders } from '@/lib/cache-headers';

describe('buildPrivateCacheHeaders', () => {
  it('marks the response private with the given max-age', () => {
    expect(buildPrivateCacheHeaders(300)).toEqual({
      'Cache-Control': 'private, max-age=300',
    });
  });

  it('never emits shared-cache (CDN) directives', () => {
    const headers = buildPrivateCacheHeaders(60);
    expect(Object.keys(headers)).toEqual(['Cache-Control']);
    expect(headers['Cache-Control']).not.toContain('public');
    expect(headers['Cache-Control']).not.toContain('s-maxage');
  });
});
