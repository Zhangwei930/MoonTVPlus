// 搜索时每批并发查询的源数量
export const SEARCH_SOURCE_BATCH_SIZE = 8;

/**
 * 按批次并发执行：一批 batchSize 个任务并发，前一批全部完成后再开下一批。
 * 用于搜索时限制同时打到第三方源的请求数，结果按输入顺序返回。
 */
export async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
}
