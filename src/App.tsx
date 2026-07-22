import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RetailProvider } from '@/state/retailStore';
import { getCanonicalPath, getPageFromPath, getPathForPage, type PageKey } from '@/lib/routes';
import { AdminAuthProvider, useAdminAuth } from '@/auth/AuthContext';
import { canAccessPage } from '@/auth/permissions';
import { LoginPage } from '@/pages/Login';
import { AccessDeniedPage } from '@/pages/AccessDenied';

// Lazy-load แต่ละหน้าเป็น chunk แยก เพื่อไม่ให้ surface ของ messenger ต้องโหลด
// dashboard admin + recharts ทั้งก้อน (เดิม bundle เดียว ~1.4MB → จอขาวตอนเปิดครั้งแรก)
const OverviewPage = lazy(() =>
  import('@/pages/Overview').then((m) => ({ default: m.OverviewPage })),
);
const ScriptTransformPage = lazy(() =>
  import('@/pages/ScriptTransform').then((m) => ({ default: m.ScriptTransformPage })),
);
const InboxPage = lazy(() => import('@/pages/Inbox').then((m) => ({ default: m.InboxPage })));
const RouteBuilderPage = lazy(() =>
  import('@/pages/RouteBuilder').then((m) => ({ default: m.RouteBuilderPage })),
);
const DeliveryWorkspacePage = lazy(() =>
  import('@/pages/DeliveryWorkspace').then((m) => ({ default: m.DeliveryWorkspacePage })),
);
const DeliveryTrackingPage = lazy(() =>
  import('@/pages/DeliveryTracking').then((m) => ({ default: m.DeliveryTrackingPage })),
);
const LiveViewPage = lazy(() =>
  import('@/pages/LiveView').then((m) => ({ default: m.LiveViewPage })),
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
const PostalQueuePage = lazy(() =>
  import('@/pages/PostalQueue').then((m) => ({ default: m.PostalQueuePage })),
);
const DriversPage = lazy(() => import('@/pages/Drivers').then((m) => ({ default: m.DriversPage })));
const CustomersPage = lazy(() =>
  import('@/pages/Customers').then((m) => ({ default: m.CustomersPage })),
);
const UsersPage = lazy(() => import('@/pages/Users').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('@/pages/Roles').then((m) => ({ default: m.RolesPage })));
const SecuritySessionPage = lazy(() =>
  import('@/pages/SecuritySession').then((m) => ({ default: m.SecuritySessionPage })),
);
const ProfilePage = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })));
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

type AdminSurfaceProps = {
  page: PageKey;
  locationSearch: string;
  navigateToPage: (page: PageKey, options?: { search?: string }) => void;
};

function buildWorkspaceSearch(search: string | undefined, mode: 'immediate' | 'planning') {
  const params = new URLSearchParams(search ?? '');
  params.set('view', 'manage');
  params.set('mode', mode);
  return `?${params.toString()}`;
}

function normalizeLegacyWorkspaceSearch(pathname: string, search: string) {
  if (pathname !== '/driver-queue' && pathname !== '/delivery-planning') return search;
  const params = new URLSearchParams(search);
  if (!params.has('view')) params.set('view', 'manage');
  if (!params.has('mode')) {
    params.set('mode', pathname === '/delivery-planning' ? 'planning' : 'immediate');
  }
  return `?${params.toString()}`;
}

function AdminSurface({ page, locationSearch, navigateToPage }: AdminSurfaceProps) {
  const { status, user } = useAdminAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <SplashGate />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <>
        <SplashGate />
        <LoginPage />
      </>
    );
  }

  return (
    <RetailProvider>
      <AppShell page={page} onChangePage={navigateToPage}>
        <Suspense fallback={null}>
          <SplashGate />
          {!canAccessPage(user, page) ? (
            <AccessDeniedPage />
          ) : (
            <>
              {page === 'overview' && <OverviewPage />}
              {page === 'script_transform' && <ScriptTransformPage />}
              {page === 'inbox' && (
                <InboxPage
                  locationSearch={locationSearch}
                  onOpenQueue={(search) =>
                    navigateToPage('delivery_workspace', {
                      search: buildWorkspaceSearch(search, 'immediate'),
                    })
                  }
                  onOpenPlanning={(search) =>
                    navigateToPage('delivery_workspace', {
                      search: buildWorkspaceSearch(search, 'planning'),
                    })
                  }
                />
              )}
              {page === 'route_builder' && (
                <RouteBuilderPage
                  locationSearch={locationSearch}
                  onOpenPlanning={(search) =>
                    navigateToPage('delivery_workspace', {
                      search: buildWorkspaceSearch(search, 'planning'),
                    })
                  }
                  onOpenTracking={(search) => navigateToPage('delivery_tracking', { search })}
                />
              )}
              {page === 'delivery_workspace' && (
                <DeliveryWorkspacePage
                  locationSearch={locationSearch}
                  onOpenInbox={(search) => navigateToPage('inbox', { search })}
                  onOpenTracking={(search) => navigateToPage('delivery_tracking', { search })}
                />
              )}
              {page === 'delivery_tracking' && (
                <DeliveryTrackingPage
                  locationSearch={locationSearch}
                  onOpenQueue={(search) =>
                    navigateToPage('delivery_workspace', {
                      search: buildWorkspaceSearch(search, 'immediate'),
                    })
                  }
                  onOpenTrackingHistory={() => navigateToPage('tracking_history')}
                  onOpenDeliveryReport={() => navigateToPage('delivery_report')}
                />
              )}
              {page === 'live_view' && <LiveViewPage />}
              {page === 'delivery_report' && <DeliveryReportPage />}
              {page === 'tracking_history' && (
                <TrackingHistoryPage locationSearch={locationSearch} />
              )}
              {page === 'notifications' && <NotificationsPage />}
              {page === 'postal' && <PostalQueuePage locationSearch={locationSearch} />}
              {page === 'drivers' && (
                <DriversPage
                  onOpenTrackingHistory={(driverCode) =>
                    navigateToPage('tracking_history', {
                      search: `?driverCode=${encodeURIComponent(driverCode)}&rangeDays=90`,
                    })
                  }
                />
              )}
              {page === 'customers' && <CustomersPage locationSearch={locationSearch} />}
              {page === 'users' && <UsersPage />}
              {page === 'roles' && <RolesPage />}
              {page === 'security' && <SecuritySessionPage />}
              {page === 'profile' && <ProfilePage />}
            </>
          )}
        </Suspense>
      </AppShell>
    </RetailProvider>
  );
}

export default function App() {
  const [page, setPage] = useState<PageKey>(() => getPageFromPath(window.location.pathname));
  const [locationPathname, setLocationPathname] = useState(() => window.location.pathname);
  const [locationSearch, setLocationSearch] = useState(() =>
    normalizeLegacyWorkspaceSearch(window.location.pathname, window.location.search),
  );

  useEffect(() => {
    const syncPageWithLocation = () => {
      const nextPage = getPageFromPath(window.location.pathname);
      const canonicalPath = getCanonicalPath(window.location.pathname);
      const normalizedSearch = normalizeLegacyWorkspaceSearch(
        window.location.pathname,
        window.location.search,
      );
      const canonicalUrl = `${canonicalPath}${normalizedSearch}`;

      if (`${window.location.pathname}${window.location.search}` !== canonicalUrl) {
        window.history.replaceState(window.history.state, '', canonicalUrl);
      }

      setPage(nextPage);
      setLocationPathname(window.location.pathname);
      setLocationSearch(normalizedSearch);
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
    <AdminAuthProvider>
      <AdminSurface page={page} locationSearch={locationSearch} navigateToPage={navigateToPage} />
    </AdminAuthProvider>
  );
}
