import { mapInBatches } from '@/lib/batch';

describe('mapInBatches', () => {
  it('returns results in input order', async () => {
    const results = await mapInBatches([3, 1, 2], 2, async (n) => n * 10);
    expect(results).toEqual([30, 10, 20]);
  });

  it('never runs more than batchSize tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;

    await mapInBatches([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('handles empty input', async () => {
    expect(await mapInBatches([], 5, async (x) => x)).toEqual([]);
  });

  it('propagates worker rejections', async () => {
    await expect(
      mapInBatches([1], 2, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
