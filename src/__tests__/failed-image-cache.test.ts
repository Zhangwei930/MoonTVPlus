import {
  clearFailedImageCache,
  isImageFailedRecently,
  markImageFailed,
} from '@/lib/failed-image-cache';

describe('failed-image-cache', () => {
  beforeEach(() => {
    clearFailedImageCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is empty by default', () => {
    expect(isImageFailedRecently('https://img.example.com/a.jpg')).toBe(false);
  });

  it('remembers a failed url within the ttl window', () => {
    markImageFailed('https://img.example.com/a.jpg');
    expect(isImageFailedRecently('https://img.example.com/a.jpg')).toBe(true);
    expect(isImageFailedRecently('https://img.example.com/b.jpg')).toBe(false);
  });

  it('forgets a failed url after the ttl expires', () => {
    markImageFailed('https://img.example.com/a.jpg');
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(isImageFailedRecently('https://img.example.com/a.jpg')).toBe(false);
  });

  it('ignores empty urls', () => {
    markImageFailed('');
    expect(isImageFailedRecently('')).toBe(false);
  });

  it('caps the cache size by evicting oldest entries', () => {
    for (let i = 0; i < 600; i++) {
      markImageFailed(`https://img.example.com/${i}.jpg`);
    }
    // 最早的条目被淘汰，最新的仍在
    expect(isImageFailedRecently('https://img.example.com/0.jpg')).toBe(false);
    expect(isImageFailedRecently('https://img.example.com/599.jpg')).toBe(true);
  });
});
