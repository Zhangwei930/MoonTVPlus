// In-memory tracker for "who is online right now".
// State is per-process; container restarts reset everyone to offline until
// their next heartbeat arrives.

export const ONLINE_THRESHOLD_MS = 90 * 1000;

const activity = new Map<string, number>();

export function markUserActive(username: string, now: number = Date.now()): void {
  if (!username) return;
  activity.set(username, now);
}

export function isUserOnline(
  username: string,
  now: number = Date.now()
): boolean {
  const ts = activity.get(username);
  return typeof ts === 'number' && now - ts < ONLINE_THRESHOLD_MS;
}

export function getActivitySnapshot(): Record<string, number> {
  const snapshot: Record<string, number> = {};
  Array.from(activity.entries()).forEach(([username, ts]) => {
    snapshot[username] = ts;
  });
  return snapshot;
}

export function getOnlineUsernames(now: number = Date.now()): string[] {
  const online: string[] = [];
  Array.from(activity.entries()).forEach(([username, ts]) => {
    if (now - ts < ONLINE_THRESHOLD_MS) {
      online.push(username);
    }
  });
  return online;
}

// Test-only helper.
export function __resetUserActivity(): void {
  activity.clear();
}
