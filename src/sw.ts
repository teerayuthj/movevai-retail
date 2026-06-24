/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa: injectManifest)
// - precache app-shell (เหมือน generateSW เดิม)
// - รับ push event → showNotification (ฝั่งรับของ Web Push)
// - notificationclick → โฟกัส/เปิดแอปไปหน้างาน
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST?: Array<{ url: string }> };

const precacheManifest = self.__WB_MANIFEST ?? [];
precacheAndRoute(precacheManifest);

// SPA fallback — ใช้เฉพาะ build ที่มี index.html ใน precache แล้ว
if (precacheManifest.some((entry) => entry.url === 'index.html' || entry.url === '/index.html')) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
}

type PushPayload = {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  badgeCount?: number;
  unreadCount?: number;
  orderId?: string;
  orderCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  totalValue?: number;
  assignedDriverId?: string;
  data?: unknown;
};

type BadgeNavigator = WorkerNavigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

const badgeCacheName = 'movevai-messenger-badge';
const badgeCountUrl = new URL('/__movevai/messenger-badge-count', self.location.origin).toString();

function normalizePushPayload(payload: PushPayload): PushPayload {
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return payload;
  }

  const data = payload.data as Partial<PushPayload> & { code?: string };
  return {
    ...data,
    ...payload,
    orderCode: payload.orderCode ?? data.orderCode ?? data.code,
    data: payload.data,
  };
}

async function readStoredBadgeCount() {
  const cache = await caches.open(badgeCacheName);
  const response = await cache.match(badgeCountUrl);
  if (!response) return 0;

  try {
    const data = (await response.json()) as { count?: unknown };
    return typeof data.count === 'number' && Number.isFinite(data.count)
      ? Math.max(0, Math.floor(data.count))
      : 0;
  } catch {
    return 0;
  }
}

async function writeStoredBadgeCount(count: number) {
  const cache = await caches.open(badgeCacheName);
  await cache.put(
    badgeCountUrl,
    new Response(JSON.stringify({ count }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function applyAppBadge(count: number) {
  const badgeNavigator = self.navigator as BadgeNavigator;
  if (count > 0 && badgeNavigator.setAppBadge) {
    await badgeNavigator.setAppBadge(count);
    return;
  }
  if (count === 0 && badgeNavigator.clearAppBadge) {
    await badgeNavigator.clearAppBadge();
  }
}

function getPayloadBadgeCount(payload: PushPayload) {
  const explicitCount = payload.badgeCount ?? payload.unreadCount;
  if (typeof explicitCount !== 'number' || !Number.isFinite(explicitCount)) return null;
  return Math.max(0, Math.floor(explicitCount));
}

async function incrementBadgeCount(payload: PushPayload) {
  const nextCount = getPayloadBadgeCount(payload) ?? (await readStoredBadgeCount()) + 1;
  await writeStoredBadgeCount(nextCount);
  await applyAppBadge(nextCount);
  return nextCount;
}

async function clearBadgeCount() {
  await writeStoredBadgeCount(0);
  await applyAppBadge(0);
}

async function notifyOpenClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'movevai:messenger-push-job-added' }));
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  payload = normalizePushPayload(payload);

  const title = payload.title ?? 'มีงานใหม่เข้ามา 🛵';
  event.waitUntil(
    (async () => {
      const badgeCount = await incrementBadgeCount(payload);
      await notifyOpenClients();

      await self.registration.showNotification(title, {
        body: payload.body ?? 'แตะเพื่อเปิดดูงาน',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag ?? 'messenger-new-job',
        data: { url: payload.url ?? '/messenger/assigned', badgeCount, orderId: payload.orderId },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string })?.url ?? '/messenger';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          void client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type !== 'movevai:messenger-clear-badge') return;

  event.waitUntil(clearBadgeCount());
});

// อัปเดต SW ใหม่ทันที (ให้ push handler ล่าสุดมีผลเร็ว)
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([caches.delete('movevai-messenger-push-jobs'), self.clients.claim()]),
  );
});
