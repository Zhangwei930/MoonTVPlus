'use client';

import { useEffect } from 'react';

const HEARTBEAT_INTERVAL_MS = 45 * 1000;

function sendHeartbeat(): void {
  fetch('/api/user/heartbeat', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Network error or 401 — ignore; nothing meaningful to do client-side.
  });
}

export default function UserActivityHeartbeat() {
  useEffect(() => {
    // Fire once immediately so admin dashboards see new sessions promptly.
    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
