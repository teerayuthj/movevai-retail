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
};

type RiderPushJob = {
  id: string;
  code: string;
  title?: string;
  body?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  totalValue?: number;
  assignedDriverId: string;
  receivedAt: string;
};

type BadgeNavigator = WorkerNavigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

const badgeCacheName = 'movevai-rider-badge';
const badgeCountUrl = new URL('/__movevai/rider-badge-count', self.location.origin).toString();
const pushJobCacheName = 'movevai-rider-push-jobs';
const pushJobsUrl = new URL('/__movevai/rider-push-jobs', self.location.origin).toString();
const defaultRiderId = 'D-02';

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

function extractOrderCode(payload: PushPayload) {
  if (payload.orderCode?.trim()) return payload.orderCode.trim();
  const text = `${payload.title ?? ''} ${payload.body ?? ''}`;
  return text.match(/(?:#?[A-Z]{2,}|ORD)-[0-9A-Z-]+/i)?.[0]?.replace(/^#/, '') ?? 'PUSH-JOB';
}

function buildRiderPushJob(payload: PushPayload): RiderPushJob {
  const receivedAt = new Date().toISOString();
  const code = extractOrderCode(payload);

  return {
    id: payload.orderId?.trim() || `PUSH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code,
    title: payload.title,
    body: payload.body,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerAddress: payload.customerAddress,
    totalValue:
      typeof payload.totalValue === 'number' && Number.isFinite(payload.totalValue)
        ? payload.totalValue
        : undefined,
    assignedDriverId: payload.assignedDriverId ?? defaultRiderId,
    receivedAt,
  };
}

async function readQueuedPushJobs() {
  const cache = await caches.open(pushJobCacheName);
  const response = await cache.match(pushJobsUrl);
  if (!response) return [] as RiderPushJob[];

  try {
    const data = (await response.json()) as { jobs?: unknown };
    return Array.isArray(data.jobs) ? (data.jobs as RiderPushJob[]) : [];
  } catch {
    return [] as RiderPushJob[];
  }
}

async function enqueuePushJob(payload: PushPayload) {
  const cache = await caches.open(pushJobCacheName);
  const jobs = await readQueuedPushJobs();
  const job = buildRiderPushJob(payload);
  const nextJobs = [...jobs, job].slice(-50);

  await cache.put(
    pushJobsUrl,
    new Response(JSON.stringify({ jobs: nextJobs }), {
      headers: { 'content-type': 'application/json' },
    }),
  );

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'movevai:rider-push-job-added' }));

  return job;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? 'มีงานใหม่เข้ามา 🛵';
  event.waitUntil(
    (async () => {
      const badgeCount = await incrementBadgeCount(payload);
      const job = await enqueuePushJob(payload);

      await self.registration.showNotification(title, {
        body: payload.body ?? 'แตะเพื่อเปิดดูงาน',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag ?? 'rider-new-job',
        data: { url: payload.url ?? '/rider/assigned', badgeCount, orderId: job.id },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string })?.url ?? '/rider';

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
  if (data?.type !== 'movevai:rider-clear-badge') return;

  event.waitUntil(clearBadgeCount());
});

// อัปเดต SW ใหม่ทันที (ให้ push handler ล่าสุดมีผลเร็ว)
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
