import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

describe('自动更新检测', () => {
  it('直接返回无更新，不发起网络请求', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    await expect(checkForUpdates()).resolves.toBe(UpdateStatus.NO_UPDATE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
