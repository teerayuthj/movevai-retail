// Web Push ฝั่ง client — ขอ permission, subscribe กับ push service, และยิง local notification ทดสอบ
// public key มาจาก env (VITE_VAPID_PUBLIC_KEY) — ดู .env.example
export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const MESSENGER_API_BASE_URL =
  (import.meta.env.VITE_MESSENGER_API_BASE_URL as string | undefined) ?? '/api/messenger';
export const DEFAULT_MESSENGER_CODE =
  (import.meta.env.VITE_MESSENGER_CODE as string | undefined) ?? 'D-02';

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

export async function clearMessengerAppBadge() {
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
    registration.active?.postMessage({ type: 'movevai:messenger-clear-badge' });
    navigator.serviceWorker.controller?.postMessage({ type: 'movevai:messenger-clear-badge' });
  } catch {
    // ถ้า service worker ยังไม่พร้อม ให้ข้าม ไม่กระทบ flow messenger
  }
}

async function ensurePermission(): Promise<NotifPermission> {
  if (!isPushSupported()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  return permission as NotifPermission;
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

function subscriptionUsesKey(subscription: PushSubscription, expectedKey: Uint8Array<ArrayBuffer>) {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) return false;

  const current = new Uint8Array(currentKey);
  return (
    current.length === expectedKey.length &&
    current.every((value, index) => value === expectedKey[index])
  );
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscriptionJSON }
  | {
      ok: false;
      reason: NotifPermission | 'no-vapid-key' | 'backend-registration-failed';
      status?: number;
    };

/** subscribe กับ push service และผูกเครื่องนี้กับ messenger ใน backend */
export async function subscribeToPush(
  driverCode = DEFAULT_MESSENGER_CODE,
): Promise<SubscribeResult> {
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-vapid-key' };

  const permission = await ensurePermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  let existing = await registration.pushManager.getSubscription();
  if (existing && !subscriptionUsesKey(existing, applicationServerKey)) {
    await existing.unsubscribe();
    existing = null;
  }
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  const json = subscription.toJSON();

  try {
    const response = await fetch(
      `${MESSENGER_API_BASE_URL.replace(/\/$/, '')}/push-subscriptions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${localStorage.getItem('movevai:messenger-token') ?? ''}`,
        },
        body: JSON.stringify({
          driverCode,
          subscription: json,
          userAgent: navigator.userAgent,
        }),
      },
    );

    if (!response.ok) {
      return { ok: false, reason: 'backend-registration-failed', status: response.status };
    }
  } catch {
    return { ok: false, reason: 'backend-registration-failed' };
  }

  // เก็บ dev sink ไว้สำหรับ manual smoke test เท่านั้น
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
