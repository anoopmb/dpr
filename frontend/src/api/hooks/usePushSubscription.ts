import { useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/api/client';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output.buffer as ArrayBuffer;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const keys = json.keys as Record<string, string>;
  await apiClient.post('/push/subscribe', {
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

export function usePushSubscription(enabled: boolean) {
  const subscribedRef = useRef(false);

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await getRegistration();
    if (!registration) return;

    try {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await sendSubscriptionToServer(existing);
        subscribedRef.current = true;
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
      await sendSubscriptionToServer(sub);
      subscribedRef.current = true;
    } catch {
      // Push subscribe failure is non-fatal — user may have revoked permission
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void subscribe();
  }, [enabled, subscribe]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        window.location.href = event.data.url;
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}
