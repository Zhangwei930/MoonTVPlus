import {
  buildSkippedSourcesSummary,
  classifySkippedSource,
} from '@/lib/skipped-sources';

describe('classifySkippedSource', () => {
  it('classifies timeout errors', () => {
    expect(classifySkippedSource('a', '慢源', '慢源 timeout')).toEqual({
      key: 'a',
      name: '慢源',
      reason: 'timeout',
    });
  });

  it('classifies other errors as error', () => {
    expect(classifySkippedSource('b', '坏源', 'fetch failed')).toEqual({
      key: 'b',
      name: '坏源',
      reason: 'error',
    });
  });

  it('falls back to key when name is missing', () => {
    expect(classifySkippedSource('c', '', 'timeout').name).toBe('c');
  });
});

describe('buildSkippedSourcesSummary', () => {
  it('returns null when nothing was skipped', () => {
    expect(buildSkippedSourcesSummary([])).toBeNull();
  });

  it('summarizes timeout and failed sources separately', () => {
    const summary = buildSkippedSourcesSummary([
      { key: 'a', name: '慢源', reason: 'timeout' },
      { key: 'b', name: '慢源2', reason: 'timeout' },
      { key: 'c', name: '坏源', reason: 'error' },
    ]);
    expect(summary).toBe('已自动跳过 2 个超时源、1 个失效源');
  });

  it('omits the zero-count part', () => {
    expect(
      buildSkippedSourcesSummary([{ key: 'a', name: '慢源', reason: 'timeout' }])
    ).toBe('已自动跳过 1 个超时源');
    expect(
      buildSkippedSourcesSummary([{ key: 'c', name: '坏源', reason: 'error' }])
    ).toBe('已自动跳过 1 个失效源');
  });
});
