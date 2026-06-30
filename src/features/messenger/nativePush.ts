// Native push (Capacitor) — iOS = APNs, Android = FCM
// ใช้ @capacitor/push-notifications: ขอ permission → register → ได้ device token แล้วผูกกับคนขับใน backend
// บน web ฟังก์ชันเหล่านี้ไม่ทำอะไร (guard ด้วย isNativePlatform)
import { Capacitor } from '@capacitor/core';
import { MESSENGER_API_BASE_URL, MESSENGER_TOKEN_STORAGE_KEY } from './push';

export type NativePushResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'not-native' | 'denied' | 'registration-failed' | 'backend-failed';
      status?: number;
    };

function nativePlatform(): 'ios' | 'android' | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

export function isNativePushSupported(): boolean {
  return nativePlatform() !== null;
}

async function registerTokenWithBackend(
  driverCode: string,
  deviceToken: string,
  platform: 'ios' | 'android',
): Promise<{ ok: true } | { ok: false; status?: number }> {
  try {
    const response = await fetch(
      `${MESSENGER_API_BASE_URL.replace(/\/$/, '')}/push-subscriptions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${localStorage.getItem(MESSENGER_TOKEN_STORAGE_KEY) ?? ''}`,
        },
        body: JSON.stringify({
          driverCode,
          deviceToken,
          platform,
          userAgent: navigator.userAgent,
        }),
      },
    );
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function clearNativeDeliveredNotifications(
  PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications,
) {
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // iOS Capacitor rejects this until APNs registration has reported back once.
  }
}

/** ขอ permission + register APNs/FCM + ผูก device token กับคนขับใน backend */
export async function registerNativePush(driverCode: string): Promise<NativePushResult> {
  const platform = nativePlatform();
  if (!platform) return { ok: false, reason: 'not-native' };

  const { PushNotifications } = await import('@capacitor/push-notifications');

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') return { ok: false, reason: 'denied' };

  return new Promise<NativePushResult>((resolve) => {
    let settled = false;
    const finish = (result: NativePushResult) => {
      if (settled) return;
      settled = true;
      void registrationHandle.then((handle) => handle.remove());
      void errorHandle.then((handle) => handle.remove());
      resolve(result);
    };

    const registrationHandle = PushNotifications.addListener('registration', async (token) => {
      const backend = await registerTokenWithBackend(driverCode, token.value, platform);
      if (backend.ok) void clearNativeDeliveredNotifications(PushNotifications);
      finish(
        backend.ok
          ? { ok: true, token: token.value }
          : { ok: false, reason: 'backend-failed', status: backend.status },
      );
    });

    const errorHandle = PushNotifications.addListener('registrationError', () => {
      finish({ ok: false, reason: 'registration-failed' });
    });

    void PushNotifications.register();

    // กันค้าง: ถ้าไม่มี event ภายใน 15 วินาที ถือว่า register ไม่สำเร็จ
    setTimeout(() => finish({ ok: false, reason: 'registration-failed' }), 15_000);
  });
}

let listenersReady = false;

/**
 * ตั้ง listener สำหรับ push ที่เข้ามาตอนแอปเปิดอยู่ (foreground) และตอนผู้ใช้แตะ notification
 * เรียกครั้งเดียวตอน bootstrap (idempotent)
 */
export async function setupNativePushListeners(onOpen?: (url: string) => void): Promise<void> {
  if (listenersReady || !isNativePushSupported()) return;
  listenersReady = true;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  // push เข้ามาตอนแอปเปิดอยู่ (foreground) iOS เด้ง native banner เองจาก
  // presentationOptions ใน capacitor.config.ts — ไม่ต้องโชว์ in-app toast ซ้ำ

  // แตะ notification → เปิดงานที่เกี่ยวข้อง (deep link จาก data.url ถ้ามี)
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = (action.notification.data as { url?: string } | undefined)?.url ?? '/messenger';
    if (onOpen) onOpen(url);
    else window.location.assign('/messenger');
  });
}
