import type { IStorage, Notification, NotificationType } from './types';

export const NOTIFICATION_CATEGORIES = [
  {
    key: 'favorite_update',
    label: '收藏更新',
    description: '收藏影视有新集数时通知',
  },
  {
    key: 'manga_update',
    label: '漫画更新',
    description: '漫画书架有新章节时通知',
  },
  {
    key: 'movie_request',
    label: '求片进度',
    description: '新求片、求片人数变化和求片上架通知',
  },
  {
    key: 'anime_subscription',
    label: '追番订阅',
    description: '追番订阅发现新集数时通知',
  },
  {
    key: 'system',
    label: '系统通知',
    description: '公告和系统消息',
  },
] as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number]['key'];
export type NotificationChannel = 'site' | 'email';

export type NotificationPreferences = Record<
  NotificationChannel,
  Record<NotificationCategory, boolean>
>;

const PREFERENCE_KEY_PREFIX = 'notification.preferences:';

function createChannelDefaults(enabled: boolean) {
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [category.key, enabled])
  ) as Record<NotificationCategory, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getNotificationCategory(
  type: NotificationType
): NotificationCategory {
  if (type === 'favorite_update') return 'favorite_update';
  if (type === 'manga_update') return 'manga_update';
  if (type === 'movie_request' || type === 'request_fulfilled') {
    return 'movie_request';
  }
  if (type === 'anime_subscription_update') return 'anime_subscription';
  return 'system';
}

export function normalizeNotificationPreferences(
  value: unknown,
  legacyEmailEnabled = false
): NotificationPreferences {
  const defaults: NotificationPreferences = {
    site: createChannelDefaults(true),
    email: createChannelDefaults(legacyEmailEnabled),
  };

  if (!isRecord(value)) return defaults;

  return {
    site: mergeChannelPreferences(defaults.site, value.site),
    email: mergeChannelPreferences(defaults.email, value.email),
  };
}

function mergeChannelPreferences(
  defaults: Record<NotificationCategory, boolean>,
  value: unknown
) {
  if (!isRecord(value)) return defaults;

  return NOTIFICATION_CATEGORIES.reduce<Record<NotificationCategory, boolean>>(
    (acc, category) => {
      const rawValue = value[category.key];
      acc[category.key] =
        typeof rawValue === 'boolean' ? rawValue : defaults[category.key];
      return acc;
    },
    { ...defaults }
  );
}

export function canDeliverNotification(
  type: NotificationType,
  channel: NotificationChannel,
  preferences: NotificationPreferences
) {
  return preferences[channel][getNotificationCategory(type)] === true;
}

export function filterNotificationsByPreferences(
  notifications: Notification[],
  preferences: NotificationPreferences
) {
  return notifications.filter((notification) =>
    canDeliverNotification(notification.type, 'site', preferences)
  );
}

function preferenceKey(username: string) {
  return `${PREFERENCE_KEY_PREFIX}${username}`;
}

export async function getUserNotificationPreferences(
  storage: IStorage,
  username: string
) {
  const legacyEmailEnabled = storage.getEmailNotificationPreference
    ? await storage.getEmailNotificationPreference(username)
    : false;
  const rawValue = await storage.getGlobalValue(preferenceKey(username));

  if (!rawValue) {
    return normalizeNotificationPreferences(null, legacyEmailEnabled);
  }

  try {
    return normalizeNotificationPreferences(
      JSON.parse(rawValue),
      legacyEmailEnabled
    );
  } catch (error) {
    return normalizeNotificationPreferences(null, legacyEmailEnabled);
  }
}

export async function setUserNotificationPreferences(
  storage: IStorage,
  username: string,
  preferences: unknown
) {
  const normalized = normalizeNotificationPreferences(preferences);
  await storage.setGlobalValue(
    preferenceKey(username),
    JSON.stringify(normalized)
  );
  return normalized;
}
