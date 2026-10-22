import {
  clearImageFailureStats,
  getTopImageFailureDomains,
  recordImageFailure,
} from '@/lib/image-failure-stats';

describe('image-failure-stats', () => {
  const now = 1700000000000;
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => {
    clearImageFailureStats();
  });

  it('aggregates failures by domain', () => {
    recordImageFailure('https://img.bad.com/a.jpg', now);
    recordImageFailure('https://img.bad.com/b.jpg', now);
    recordImageFailure('https://cdn.dead.net/c.png', now);

    expect(getTopImageFailureDomains(5, now)).toEqual([
      { domain: 'img.bad.com', count: 2 },
      { domain: 'cdn.dead.net', count: 1 },
    ]);
  });

  it('ignores failures older than 24h', () => {
    recordImageFailure('https://img.bad.com/a.jpg', now - 25 * HOUR);
    recordImageFailure('https://img.bad.com/b.jpg', now);

    expect(getTopImageFailureDomains(5, now)).toEqual([
      { domain: 'img.bad.com', count: 1 },
    ]);
  });

  it('respects the limit and sorts by count desc', () => {
    for (let i = 0; i < 3; i++) recordImageFailure('https://a.com/x.jpg', now);
    for (let i = 0; i < 2; i++) recordImageFailure('https://b.com/x.jpg', now);
    recordImageFailure('https://c.com/x.jpg', now);

    const top = getTopImageFailureDomains(2, now);
    expect(top).toHaveLength(2);
    expect(top[0].domain).toBe('a.com');
    expect(top[1].domain).toBe('b.com');
  });

  it('ignores invalid or relative urls', () => {
    recordImageFailure('not-a-url', now);
    recordImageFailure('/api/image-proxy?url=abc', now);

    expect(getTopImageFailureDomains(5, now)).toEqual([]);
  });
});
