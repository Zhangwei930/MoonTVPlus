import { buildSearchEmptyActions } from '@/lib/search-empty-actions';

describe('search empty actions', () => {
  it('builds enabled follow-up actions for an empty video search', () => {
    const actions = buildSearchEmptyActions({
      query: '  三体  ',
      movieRequestEnabled: true,
      netdiskSearchEnabled: true,
      magnetSearchEnabled: true,
      aiEnabled: true,
    });

    expect(actions.map((action) => action.id)).toEqual([
      'movie-request',
      'pansou',
      'acg',
      'ai',
    ]);
    expect(actions[0]).toMatchObject({
      enabled: true,
      href: '/movie-request?keyword=%E4%B8%89%E4%BD%93',
    });
  });

  it('keeps disabled actions visible with a reason', () => {
    const actions = buildSearchEmptyActions({
      query: '三体',
      movieRequestEnabled: false,
      netdiskSearchEnabled: false,
      magnetSearchEnabled: true,
      aiEnabled: false,
    });

    expect(actions.find((action) => action.id === 'movie-request')).toMatchObject({
      enabled: false,
      disabledReason: '求片功能未启用',
    });
    expect(actions.find((action) => action.id === 'pansou')).toMatchObject({
      enabled: false,
      disabledReason: '网盘搜索未启用',
    });
    expect(actions.find((action) => action.id === 'acg')).toMatchObject({
      enabled: true,
    });
  });

  it('returns no actions without a query', () => {
    expect(
      buildSearchEmptyActions({
        query: '   ',
        movieRequestEnabled: true,
        netdiskSearchEnabled: true,
        magnetSearchEnabled: true,
        aiEnabled: true,
      })
    ).toEqual([]);
  });
});
