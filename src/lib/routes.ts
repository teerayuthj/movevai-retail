export type PageKey =
  | 'overview'
  | 'script_transform'
  | 'inbox'
  | 'queue'
  | 'delivery_tracking'
  | 'tracking_history'
  | 'notifications'
  | 'planning'
  | 'postal'
  | 'drivers'
  | 'messenger'
  | 'customer_tracking'
  | 'not_found';

type RouteDefinition = {
  page: PageKey;
  path: string;
  aliases?: string[];
};

const routeDefinitions: RouteDefinition[] = [
  { page: 'overview', path: '/', aliases: ['/overview'] },
  { page: 'script_transform', path: '/script-transform' },
  { page: 'inbox', path: '/order-inbox' },
  { page: 'queue', path: '/driver-queue' },
  { page: 'delivery_tracking', path: '/delivery-tracking' },
  { page: 'tracking_history', path: '/tracking-history' },
  { page: 'notifications', path: '/notifications' },
  { page: 'planning', path: '/delivery-planning' },
  { page: 'postal', path: '/thai-post' },
  { page: 'drivers', path: '/drivers' },
  { page: 'messenger', path: '/messenger' },
  { page: 'customer_tracking', path: '/track', aliases: ['/customer-track'] },
  // หน้า fallback เมื่อ path ไม่ตรงกับ route ใดเลย — ไม่อยู่ใน sidebar nav
  { page: 'not_found', path: '/404' },
];

const routeByPage = Object.fromEntries(
  routeDefinitions.map((route) => [route.page, route]),
) as Record<PageKey, RouteDefinition>;

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

const customerTrackingPathPrefixes = ['/track', '/customer-track'];

function isCustomerTrackingRoute(pathname: string) {
  return customerTrackingPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getPathForPage(page: PageKey) {
  return routeByPage[page].path;
}

export function getPageFromPath(pathname: string): PageKey {
  const normalizedPath = normalizePath(pathname);

  if (isCustomerTrackingRoute(normalizedPath)) {
    return 'customer_tracking';
  }

  // /messenger และ sub-route ทั้งหมด (/messenger/assigned, /messenger/in-transit, ...) = page 'messenger'
  // tab routing ภายใน /messenger จัดการที่ src/features/messenger (messengerTabs.ts)
  if (normalizedPath === '/messenger' || normalizedPath.startsWith('/messenger/')) {
    return 'messenger';
  }

  const matchedRoute = routeDefinitions.find((route) => {
    if (route.path === normalizedPath) return true;
    return route.aliases?.includes(normalizedPath);
  });

  return matchedRoute?.page ?? 'not_found';
}

export function getCanonicalPath(pathname: string) {
  const page = getPageFromPath(pathname);
  if (page === 'customer_tracking') return normalizePath(pathname);
  // messenger เก็บ sub-path ไว้ (อย่ายุบ /messenger/delivered → /messenger) — ให้ feature redirect เอง
  if (page === 'messenger') return normalizePath(pathname);
  // not_found เก็บ path เดิมไว้บน address bar (อย่า rewrite เป็น /404) เพื่อให้ผู้ใช้เห็นว่าพิมพ์อะไรผิด
  if (page === 'not_found') return normalizePath(pathname);
  return getPathForPage(page);
}
