import { createCompletionTracker } from '@/lib/completion-tracker';

describe('createCompletionTracker', () => {
  it('fires onComplete exactly once when all sources finish', () => {
    const onComplete = jest.fn();
    const tracker = createCompletionTracker(3, onComplete);

    tracker.increment();
    tracker.increment();
    expect(onComplete).not.toHaveBeenCalled();

    tracker.increment();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(tracker.completed).toBe(3);
  });

  it('fires immediately via checkNow when total is zero', () => {
    const onComplete = jest.fn();
    const tracker = createCompletionTracker(0, onComplete);

    tracker.checkNow();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice even if incremented past total', () => {
    const onComplete = jest.fn();
    const tracker = createCompletionTracker(2, onComplete);

    tracker.increment();
    tracker.increment();
    tracker.increment(); // 计数超过 total（如 Emby 源数量前后不一致）
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(tracker.completed).toBe(3);
  });

  it('still completes when count overshoots total between checks', () => {
    const onComplete = jest.fn();
    // 模拟 total 統計偏小的场景：>= 判断保证不会卡死
    const tracker = createCompletionTracker(1, onComplete);
    tracker.increment();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
