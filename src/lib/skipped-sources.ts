/**
 * 搜索时被自动跳过（超时/失败）的源，用于给用户友好提示
 */

export interface SkippedSource {
  key: string;
  name: string;
  reason: 'timeout' | 'error';
}

export function classifySkippedSource(
  key: string,
  name: string,
  error: string
): SkippedSource {
  return {
    key,
    name: name || key,
    reason: error.includes('timeout') ? 'timeout' : 'error',
  };
}

export function buildSkippedSourcesSummary(
  skipped: SkippedSource[]
): string | null {
  if (skipped.length === 0) return null;

  const timeoutCount = skipped.filter((s) => s.reason === 'timeout').length;
  const errorCount = skipped.length - timeoutCount;

  const parts: string[] = [];
  if (timeoutCount > 0) parts.push(`${timeoutCount} 个超时源`);
  if (errorCount > 0) parts.push(`${errorCount} 个失效源`);

  return `已自动跳过 ${parts.join('、')}`;
}
