import {
  canDeliverNotification,
  getNotificationCategory,
  normalizeNotificationPreferences,
} from '@/lib/notification-preferences';

describe('notification preferences', () => {
  it('keeps site notifications enabled by default', () => {
    const preferences = normalizeNotificationPreferences(null);

    expect(canDeliverNotification('favorite_update', 'site', preferences)).toBe(
      true
    );
    expect(canDeliverNotification('movie_request', 'site', preferences)).toBe(
      true
    );
    expect(
      canDeliverNotification('anime_subscription_update', 'site', preferences)
    ).toBe(true);
  });

  it('uses the legacy email toggle as fallback for email channels', () => {
    const preferences = normalizeNotificationPreferences(null, true);

    expect(
      canDeliverNotification('favorite_update', 'email', preferences)
    ).toBe(true);
    expect(canDeliverNotification('manga_update', 'email', preferences)).toBe(
      true
    );
    expect(canDeliverNotification('system', 'email', preferences)).toBe(true);
  });

  it('maps related notification types to the same category', () => {
    expect(getNotificationCategory('movie_request')).toBe('movie_request');
    expect(getNotificationCategory('request_fulfilled')).toBe('movie_request');
    expect(getNotificationCategory('anime_subscription_update')).toBe(
      'anime_subscription'
    );
  });

  it('honors explicit channel overrides', () => {
    const preferences = normalizeNotificationPreferences({
      site: {
        movie_request: false,
      },
      email: {
        favorite_update: false,
        anime_subscription: true,
      },
    });

    expect(canDeliverNotification('movie_request', 'site', preferences)).toBe(
      false
    );
    expect(
      canDeliverNotification('favorite_update', 'email', preferences)
    ).toBe(false);
    expect(
      canDeliverNotification('anime_subscription_update', 'email', preferences)
    ).toBe(true);
  });
});
