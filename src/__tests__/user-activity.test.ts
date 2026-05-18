import {
  __resetUserActivity,
  getActivitySnapshot,
  getOnlineUsernames,
  isUserOnline,
  markUserActive,
  ONLINE_THRESHOLD_MS,
} from '@/lib/user-activity';

beforeEach(() => {
  __resetUserActivity();
});

describe('user activity tracker', () => {
  it('reports a freshly marked user as online', () => {
    markUserActive('alice', 1000);
    expect(isUserOnline('alice', 1000)).toBe(true);
  });

  it('reports the user as offline once the threshold elapses', () => {
    markUserActive('alice', 1000);
    expect(isUserOnline('alice', 1000 + ONLINE_THRESHOLD_MS)).toBe(false);
  });

  it('ignores unknown usernames', () => {
    expect(isUserOnline('ghost', 1000)).toBe(false);
  });

  it('ignores empty usernames silently', () => {
    markUserActive('', 1000);
    expect(getActivitySnapshot()).toEqual({});
  });

  it('snapshots return the latest timestamp per user', () => {
    markUserActive('alice', 1000);
    markUserActive('alice', 2000);
    markUserActive('bob', 1500);
    expect(getActivitySnapshot()).toEqual({ alice: 2000, bob: 1500 });
  });

  it('getOnlineUsernames excludes stale entries', () => {
    markUserActive('alice', 1000);
    markUserActive('bob', 1000 + ONLINE_THRESHOLD_MS + 1);
    expect(getOnlineUsernames(1000 + ONLINE_THRESHOLD_MS + 100)).toEqual(['bob']);
  });
});
