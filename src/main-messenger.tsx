import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MessengerConsolePage } from '@/pages/MessengerConsole';
import { RetailProvider } from '@/state/retailStore';
import { Toaster } from '@/components/ui/sonner';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { registerAppServiceWorker } from './registerServiceWorker';
import { setupNativeShell } from '@/lib/nativeSetup';
import { setupNativePushListeners } from '@/features/messenger/nativePush';

// Entry แยกของ surface "messenger" (mobile app) — /messenger* บน web และเป็น entry
// ที่ Capacitor native bundle ใช้ boot (ดู vite.config.ts → nativeEntryAlias)
// PWA service worker + native shell/push ผูกกับ entry นี้เท่านั้น admin (index.html) ไม่แบกอีกต่อไป
registerAppServiceWorker();
void setupNativeShell();
// foreground/tap handler ของ native push (no-op บน web)
void setupNativePushListeners();

// customer tracking เปิดจากใน native app ได้ (deep link /track/...) — โหลดเป็น chunk แยก
// จะได้ไม่บวมใน bundle หลักของ messenger; บน web ปกติ /track* ถูก rewrite ไป customer.html อยู่แล้ว
const CustomerTrackingPage = lazy(() =>
  import('@/pages/CustomerTracking').then((m) => ({ default: m.CustomerTrackingPage })),
);

const customerTrackingPrefixes = ['/track', '/customer-track'];

const isCustomerTrackingPath = (pathname: string) =>
  customerTrackingPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

const isMessengerPath = (pathname: string) =>
  pathname === '/messenger' || pathname.startsWith('/messenger/');

// ลบ HTML splash หลัง React mount เสร็จ (แบบเดียวกับ SplashGate ใน App.tsx)
function SplashGate() {
  useEffect(() => {
    document.getElementById('app-splash')?.remove();
  }, []);
  return null;
}

function MessengerApp() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    return () => window.removeEventListener('popstate', syncPathname);
  }, []);

  // native boot ('/', '/index.html') หรือ fallback จาก admin ('/messenger.html')
  // ไม่ใช่ path ของ surface ไหนเลย → normalize เป็น /messenger
  useEffect(() => {
    if (isMessengerPath(pathname) || isCustomerTrackingPath(pathname)) return;
    window.history.replaceState({ page: 'messenger' }, '', '/messenger');
    setPathname('/messenger');
  }, [pathname]);

  if (isCustomerTrackingPath(pathname)) {
    return (
      <Suspense fallback={null}>
        <SplashGate />
        <CustomerTrackingPage pathname={pathname} />
      </Suspense>
    );
  }

  return (
    <RetailProvider mode="messenger">
      <SplashGate />
      <MessengerConsolePage />
    </RetailProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MessengerApp />
    <Toaster />
  </React.StrictMode>,
);
