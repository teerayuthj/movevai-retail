// Web Push ฝั่ง client — ขอ permission, subscribe กับ push service, และยิง local notification ทดสอบ
// public key มาจาก env (VITE_VAPID_PUBLIC_KEY) — ดู .env.example
import type { RiderPushJobInput } from '@/state/retail/types';

export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const pushJobCacheName = 'movevai-rider-push-jobs';
const pushJobsUrl = new URL('/__movevai/rider-push-jobs', window.location.origin).toString();

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
};

export function isPushSupported() {
  return (
    typeof Notification !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function currentPermission(): NotifPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotifPermission;
}

export async function clearRiderAppBadge() {
  if (typeof navigator === 'undefined') return;

  const badgeNavigator = navigator as BadgeNavigator;
  try {
    await badgeNavigator.clearAppBadge?.();
  } catch {
    // บาง browser รองรับ push แต่ไม่รองรับ app badge — ข้ามได้
  }

  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'movevai:rider-clear-badge' });
    navigator.serviceWorker.controller?.postMessage({ type: 'movevai:rider-clear-badge' });
  } catch {
    // ถ้า service worker ยังไม่พร้อม ให้ข้าม ไม่กระทบ flow rider
  }
}

export async function drainQueuedRiderPushJobs(): Promise<RiderPushJobInput[]> {
  if (typeof caches === 'undefined') return [];

  try {
    const cache = await caches.open(pushJobCacheName);
    const response = await cache.match(pushJobsUrl);
    if (!response) return [];

    const data = (await response.json()) as { jobs?: unknown };
    await cache.delete(pushJobsUrl);

    if (!Array.isArray(data.jobs)) return [];
    return data.jobs.filter((job): job is RiderPushJobInput => {
      if (typeof job !== 'object' || job === null) return false;
      const candidate = job as Partial<RiderPushJobInput>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.code === 'string' &&
        typeof candidate.assignedDriverId === 'string'
      );
    });
  } catch {
    return [];
  }
}

async function ensurePermission(): Promise<NotifPermission> {
  if (!isPushSupported()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  return permission as NotifPermission;
}

/** local notification — เด้งบนเครื่องเดียวกับที่กด (ไม่ใช่ push ข้ามเครื่อง) */
export async function fireLocalTestNotification(): Promise<NotifPermission> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return permission;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('มีงานใหม่เข้ามา 🛵', {
    body: 'ORD-2048 · คุณสมชาย ใจดี · แตะเพื่อเปิดดูงาน',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'rider-new-job-test',
    data: { url: '/rider/assigned' },
  });
  return 'granted';
}

// VAPID public key (base64url) → Uint8Array สำหรับ applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscriptionJSON }
  | { ok: false; reason: NotifPermission | 'no-vapid-key' };

/** subscribe กับ push service → คืน subscription JSON ไว้ส่งให้ตัวยิง (scripts/send-push.mjs) */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-vapid-key' };

  const permission = await ensurePermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();

  // dev: ส่ง subscription ไปเซฟที่เครื่อง dev อัตโนมัติ (ดู devPushSubscriptionSink ใน vite.config)
  // ไม่ต้อง copy-paste ข้ามเครื่องเอง — best-effort ถ้าพลาดก็ยัง copy ด้วยมือได้
  if (import.meta.env.DEV) {
    try {
      await fetch('/__dev/push-subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
    } catch {
      // เงียบไว้ — ผู้ใช้ใช้ปุ่ม copy เป็น fallback ได้
    }
  }

  return { ok: true, subscription: json };
}

export type DevPushTestResult =
  | { ok: true }
  | { ok: false; reason: 'dev-only' | 'send-failed' | 'invalid-response' };

export async function sendDevPushTest(
  subscription: PushSubscriptionJSON,
): Promise<DevPushTestResult> {
  if (!import.meta.env.DEV) return { ok: false, reason: 'dev-only' };

  try {
    const response = await fetch('/__dev/push-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription,
        payload: {
          title: 'มีงานด่วนจาก Mac',
          body: 'ORD-9001 · Push test เข้า iPhone เครื่องนี้',
          url: '/rider/assigned',
          tag: `rider-dev-test-${Date.now()}`,
        },
      }),
    });

    return response.ok ? { ok: true } : { ok: false, reason: 'send-failed' };
  } catch {
    return { ok: false, reason: 'invalid-response' };
  }
}
