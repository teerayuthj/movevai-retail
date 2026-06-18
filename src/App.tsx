import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { OverviewPage } from '@/pages/Overview';
import { ChatIntakePage } from '@/pages/ChatIntake';
import { ScriptTransformPage } from '@/pages/ScriptTransform';
import { InboxPage } from '@/pages/Inbox';
import { QueuePage } from '@/pages/Queue';
import { DeliveryTrackingPage } from '@/pages/DeliveryTracking';
import { PlanningPage } from '@/pages/Planning';
import { PostalQueuePage } from '@/pages/PostalQueue';
import { DriversPage } from '@/pages/Drivers';
import { RiderConsolePage } from '@/pages/RiderConsole';
import { RetailProvider } from '@/state/retailStore';
import { getCanonicalPath, getPageFromPath, getPathForPage, type PageKey } from '@/lib/routes';

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

  // Rider เป็น "surface แยก" (mobile-first) — render นอก AppShell ของ admin
  // ไม่มี sidebar/topbar ของ admin มาครอบ เพื่อจำลองประสบการณ์เปิดบนมือถือจริง
  if (page === 'rider') {
    return (
      <RetailProvider mode="rider">
        <RiderConsolePage onExit={() => navigateToPage('overview')} />
      </RetailProvider>
    );
  }

  return (
    <RetailProvider>
      <AppShell page={page} onChangePage={navigateToPage}>
        {page === 'overview' && <OverviewPage />}
        {page === 'chat' && <ChatIntakePage onOpenInbox={() => navigateToPage('inbox')} />}
        {page === 'script_transform' && <ScriptTransformPage />}
        {page === 'inbox' && <InboxPage />}
        {page === 'queue' && (
          <QueuePage
            locationSearch={locationSearch}
            onOpenTracking={(search) => navigateToPage('delivery_tracking', { search })}
          />
        )}
        {page === 'delivery_tracking' && (
          <DeliveryTrackingPage
            locationSearch={locationSearch}
            onOpenQueue={(search) => navigateToPage('queue', { search })}
          />
        )}
        {page === 'planning' && <PlanningPage />}
        {page === 'postal' && <PostalQueuePage />}
        {page === 'drivers' && <DriversPage />}
      </AppShell>
    </RetailProvider>
  );
}
