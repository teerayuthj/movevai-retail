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
};

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? 'มีงานใหม่เข้ามา 🛵';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? 'แตะเพื่อเปิดดูงาน',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag ?? 'rider-new-job',
      data: { url: payload.url ?? '/rider/assigned' },
    }),
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

// อัปเดต SW ใหม่ทันที (ให้ push handler ล่าสุดมีผลเร็ว)
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
