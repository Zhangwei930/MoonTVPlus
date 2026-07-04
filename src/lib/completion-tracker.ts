/**
 * 流式搜索的完成度跟踪：所有源（CMS/脚本/OpenList/Emby）完成后触发一次
 * onComplete。用 >= 而非 === 判断，避免源数量统计前后不一致时永远不结束。
 */
export function createCompletionTracker(
  total: number,
  onComplete: () => void
) {
  let completed = 0;
  let fired = false;

  const fire = () => {
    if (!fired && completed >= total) {
      fired = true;
      onComplete();
    }
  };

  return {
    increment() {
      completed++;
      fire();
    },
    // 供 total 可能为 0 的场景在启动时主动检查
    checkNow() {
      fire();
    },
    get completed() {
      return completed;
    },
  };
}
