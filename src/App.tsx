import { lazy, Suspense, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RetailProvider } from '@/state/retailStore';
import { getCanonicalPath, getPageFromPath, getPathForPage, type PageKey } from '@/lib/routes';

// Lazy-load แต่ละหน้าเป็น chunk แยก เพื่อไม่ให้ surface ของ messenger ต้องโหลด
// dashboard admin + recharts ทั้งก้อน (เดิม bundle เดียว ~1.4MB → จอขาวตอนเปิดครั้งแรก)
const OverviewPage = lazy(() =>
  import('@/pages/Overview').then((m) => ({ default: m.OverviewPage })),
);
const ChatIntakePage = lazy(() =>
  import('@/pages/ChatIntake').then((m) => ({ default: m.ChatIntakePage })),
);
const ScriptTransformPage = lazy(() =>
  import('@/pages/ScriptTransform').then((m) => ({ default: m.ScriptTransformPage })),
);
const InboxPage = lazy(() => import('@/pages/Inbox').then((m) => ({ default: m.InboxPage })));
const QueuePage = lazy(() => import('@/pages/Queue').then((m) => ({ default: m.QueuePage })));
const DeliveryTrackingPage = lazy(() =>
  import('@/pages/DeliveryTracking').then((m) => ({ default: m.DeliveryTrackingPage })),
);
const TrackingHistoryPage = lazy(() =>
  import('@/pages/TrackingHistory').then((m) => ({ default: m.TrackingHistoryPage })),
);
const PlanningPage = lazy(() =>
  import('@/pages/Planning').then((m) => ({ default: m.PlanningPage })),
);
const PostalQueuePage = lazy(() =>
  import('@/pages/PostalQueue').then((m) => ({ default: m.PostalQueuePage })),
);
const DriversPage = lazy(() => import('@/pages/Drivers').then((m) => ({ default: m.DriversPage })));
const MessengerConsolePage = lazy(() =>
  import('@/pages/MessengerConsole').then((m) => ({ default: m.MessengerConsolePage })),
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

export default function App() {
  const [page, setPage] = useState<PageKey>(() => getPageFromPath(window.location.pathname));
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);

  useEffect(() => {
    const syncPageWithLocation = () => {
      const nextPage = getPageFromPath(window.location.pathname);
      const canonicalPath = getCanonicalPath(window.location.pathname);

      if (window.location.pathname !== canonicalPath) {
        window.history.replaceState(window.history.state, '', canonicalPath);
      }

      setPage(nextPage);
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
    setLocationSearch(options?.search ?? '');
  };

  // Messenger เป็น "surface แยก" (mobile-first) — render นอก AppShell ของ admin
  // ไม่มี sidebar/topbar ของ admin มาครอบ เพื่อจำลองประสบการณ์เปิดบนมือถือจริง
  if (page === 'messenger') {
    return (
      <RetailProvider mode="messenger">
        <Suspense fallback={null}>
          <SplashGate />
          <MessengerConsolePage onExit={() => navigateToPage('overview')} />
        </Suspense>
      </RetailProvider>
    );
  }

  return (
    <RetailProvider>
      <AppShell page={page} onChangePage={navigateToPage}>
        <Suspense fallback={null}>
          <SplashGate />
          {page === 'overview' && <OverviewPage />}
          {page === 'chat' && <ChatIntakePage onOpenInbox={() => navigateToPage('inbox')} />}
          {page === 'script_transform' && <ScriptTransformPage />}
          {page === 'inbox' && <InboxPage />}
          {page === 'queue' && (
            <QueuePage
              locationSearch={locationSearch}
              onOpenTracking={(search) => navigateToPage('delivery_tracking', { search })}
              onOpenPlanning={(search) => navigateToPage('planning', { search })}
            />
          )}
          {page === 'delivery_tracking' && (
            <DeliveryTrackingPage
              locationSearch={locationSearch}
              onOpenQueue={(search) => navigateToPage('queue', { search })}
            />
          )}
          {page === 'tracking_history' && <TrackingHistoryPage />}
          {page === 'planning' && <PlanningPage locationSearch={locationSearch} />}
          {page === 'postal' && <PostalQueuePage />}
          {page === 'drivers' && <DriversPage />}
        </Suspense>
      </AppShell>
    </RetailProvider>
  );
}
