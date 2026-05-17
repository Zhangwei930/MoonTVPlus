export type SearchEmptyActionId = 'movie-request' | 'pansou' | 'acg' | 'ai';

export interface SearchEmptyAction {
  id: SearchEmptyActionId;
  label: string;
  description: string;
  enabled: boolean;
  href?: string;
  targetTab?: 'pansou' | 'acg';
  disabledReason?: string;
}

export interface SearchEmptyActionOptions {
  query: string;
  movieRequestEnabled: boolean;
  netdiskSearchEnabled: boolean;
  magnetSearchEnabled: boolean;
  aiEnabled: boolean;
}

const disabledReason = (enabled: boolean, reason: string) =>
  enabled ? undefined : reason;

export function buildSearchEmptyActions(
  options: SearchEmptyActionOptions
): SearchEmptyAction[] {
  const query = options.query.trim();
  if (!query) return [];

  const encodedQuery = encodeURIComponent(query);

  return [
    {
      id: 'movie-request',
      label: '去求片',
      description: '提交想看的影片，等待管理员处理',
      enabled: options.movieRequestEnabled,
      href: `/movie-request?keyword=${encodedQuery}`,
      disabledReason: disabledReason(
        options.movieRequestEnabled,
        '求片功能未启用'
      ),
    },
    {
      id: 'pansou',
      label: '搜网盘',
      description: '到网盘搜索继续找资源',
      enabled: options.netdiskSearchEnabled,
      targetTab: 'pansou',
      disabledReason: disabledReason(
        options.netdiskSearchEnabled,
        '网盘搜索未启用'
      ),
    },
    {
      id: 'acg',
      label: '搜磁链',
      description: '到动漫磁力搜索继续找资源',
      enabled: options.magnetSearchEnabled,
      targetTab: 'acg',
      disabledReason: disabledReason(
        options.magnetSearchEnabled,
        '磁力搜索未启用'
      ),
    },
    {
      id: 'ai',
      label: '问 AI',
      description: '让 AI 帮你换关键词或找替代片源',
      enabled: options.aiEnabled,
      disabledReason: disabledReason(options.aiEnabled, 'AI 问片未启用'),
    },
  ];
}
