import { lazy, Suspense, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RetailProvider } from '@/state/retailStore';
import { getCanonicalPath, getPageFromPath, getPathForPage, type PageKey } from '@/lib/routes';

// Lazy-load แต่ละหน้าเป็น chunk แยก เพื่อไม่ให้ surface ของ messenger ต้องโหลด
// dashboard admin + recharts ทั้งก้อน (เดิม bundle เดียว ~1.4MB → จอขาวตอนเปิดครั้งแรก)
const OverviewPage = lazy(() =>
  import('@/pages/Overview').then((m) => ({ default: m.OverviewPage })),
);
const ScriptTransformPage = lazy(() =>
  import('@/pages/ScriptTransform').then((m) => ({ default: m.ScriptTransformPage })),
);
const InboxPage = lazy(() => import('@/pages/Inbox').then((m) => ({ default: m.InboxPage })));
const QueuePage = lazy(() => import('@/pages/Queue').then((m) => ({ default: m.QueuePage })));
const DeliveryTrackingPage = lazy(() =>
  import('@/pages/DeliveryTracking').then((m) => ({ default: m.DeliveryTrackingPage })),
);
const DeliveryReportPage = lazy(() =>
  import('@/pages/DeliveryReport').then((m) => ({ default: m.DeliveryReportPage })),
);
const TrackingHistoryPage = lazy(() =>
  import('@/pages/TrackingHistory').then((m) => ({ default: m.TrackingHistoryPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/Notifications').then((m) => ({ default: m.NotificationsPage })),
);
const PlanningPage = lazy(() =>
  import('@/pages/Planning').then((m) => ({ default: m.PlanningPage })),
);
const PostalQueuePage = lazy(() =>
  import('@/pages/PostalQueue').then((m) => ({ default: m.PostalQueuePage })),
);
const DriversPage = lazy(() => import('@/pages/Drivers').then((m) => ({ default: m.DriversPage })));
const CustomersPage = lazy(() =>
  import('@/pages/Customers').then((m) => ({ default: m.CustomersPage })),
);
const CustomerTrackingPage = lazy(() =>
  import('@/pages/CustomerTracking').then((m) => ({ default: m.CustomerTrackingPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })),
);

// อยู่ "ใน" Suspense → จะ mount ก็ต่อเมื่อ chunk ของหน้าโหลดเสร็จแล้ว
// (ตอน suspend ทั้ง subtree ถูกแทนด้วย fallback, effect นี้จึงยังไม่ยิง)
// พอ mount จริงค่อยลบ HTML splash → ไม่มีจอขาวคั่นระหว่างรอ chunk
function SplashGate() {
  useEffect(() => {
    document.getElementById('app-splash')?.remove();
  }, []);
  return null;
}

// fallback เมื่อ /messenger* มาโหลด index.html (rewrite ที่ hosting ยังไม่ตั้ง)
// เปิด messenger.html ตรงๆ — entry นั้น normalize path กลับเป็น /messenger เอง
function MessengerEntryRedirect() {
  useEffect(() => {
    window.location.replace('/messenger.html');
  }, []);
  return null;
}

export default function App() {
  const [page, setPage] = useState<PageKey>(() => getPageFromPath(window.location.pathname));
  const [locationPathname, setLocationPathname] = useState(() => window.location.pathname);
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);

  useEffect(() => {
    const syncPageWithLocation = () => {
      const nextPage = getPageFromPath(window.location.pathname);
      const canonicalPath = getCanonicalPath(window.location.pathname);

      if (window.location.pathname !== canonicalPath) {
        window.history.replaceState(window.history.state, '', canonicalPath);
      }

      setPage(nextPage);
      setLocationPathname(window.location.pathname);
      setLocationSearch(window.location.search);
    };

    syncPageWithLocation();
    window.addEventListener('popstate', syncPageWithLocation);

    return () => window.removeEventListener('popstate', syncPageWithLocation);
  }, []);

  const navigateToPage = (nextPage: PageKey, options?: { search?: string }) => {
    const nextPath = getPathForPage(nextPage);
    const nextUrl = `${nextPath}${options?.search ?? ''}`;

    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState({ page: nextPage }, '', nextUrl);
    }

    setPage(nextPage);
    setLocationPathname(nextPath);
    setLocationSearch(options?.search ?? '');
  };

  // Messenger ย้ายไป entry แยกแล้ว (messenger.html → src/main-messenger.tsx)
  // ปกติ dev middleware / hosting rewrite เสิร์ฟ messenger.html ให้ /messenger* โดยตรง
  // ถ้า rewrite หลุดมาโหลด index.html (admin) ให้ส่งต่อแบบ full load — admin bundle ไม่มี messenger code แล้ว
  if (page === 'messenger') {
    return <MessengerEntryRedirect />;
  }

  // หมายเหตุ: surface "ลูกค้า" (/track) ย้ายไป entry แยกแล้ว (customer.html → src/main-customer.tsx)
  // ปกติ vite/hosting rewrite จะเสิร์ฟ customer.html โดยตรง
  // แต่ถ้า hosting/dev fallback ผิดมาโหลด index.html ให้แสดง customer surface แบบไม่มี AppShell
  // เพื่อไม่ให้ sidebar/topbar ของ admin หลุดไปหน้าลูกค้า
  if (page === 'customer_tracking') {
    return (
      <Suspense fallback={null}>
        <SplashGate />
        <CustomerTrackingPage pathname={locationPathname} />
      </Suspense>
    );
  }

  // Unknown paths must not expose the admin shell/sidebar to public users.
  if (page === 'not_found') {
    return (
      <Suspense fallback={null}>
        <SplashGate />
        <NotFoundPage pathname={locationPathname} />
      </Suspense>
    );
  }

  return (
    <RetailProvider>
      <AppShell page={page} onChangePage={navigateToPage}>
        <Suspense fallback={null}>
          <SplashGate />
          {page === 'overview' && <OverviewPage />}
          {page === 'script_transform' && <ScriptTransformPage />}
          {page === 'inbox' && (
            <InboxPage
              locationSearch={locationSearch}
              onOpenQueue={(search) => navigateToPage('queue', { search })}
              onOpenPlanning={(search) => navigateToPage('planning', { search })}
            />
          )}
          {page === 'queue' && (
            <QueuePage
              locationSearch={locationSearch}
              onOpenInbox={(search) => navigateToPage('inbox', { search })}
              onOpenTracking={(search) => navigateToPage('delivery_tracking', { search })}
            />
          )}
          {page === 'delivery_tracking' && (
            <DeliveryTrackingPage
              locationSearch={locationSearch}
              onOpenQueue={(search) => navigateToPage('queue', { search })}
            />
          )}
          {page === 'delivery_report' && <DeliveryReportPage />}
          {page === 'tracking_history' && <TrackingHistoryPage />}
          {page === 'notifications' && <NotificationsPage />}
          {page === 'planning' && (
            <PlanningPage
              locationSearch={locationSearch}
              onOpenInbox={(search) => navigateToPage('inbox', { search })}
            />
          )}
          {page === 'postal' && <PostalQueuePage />}
          {page === 'drivers' && <DriversPage />}
          {page === 'customers' && <CustomersPage locationSearch={locationSearch} />}
        </Suspense>
      </AppShell>
    </RetailProvider>
  );
}
