export type PageKey =
  | 'overview'
  | 'chat'
  | 'script_transform'
  | 'inbox'
  | 'queue'
  | 'delivery_tracking'
  | 'planning'
  | 'postal'
  | 'drivers'
  | 'rider';

type RouteDefinition = {
  page: PageKey;
  path: string;
  aliases?: string[];
};

const routeDefinitions: RouteDefinition[] = [
  { page: 'overview', path: '/', aliases: ['/overview'] },
  { page: 'chat', path: '/chat-intake' },
  { page: 'script_transform', path: '/script-transform' },
  { page: 'inbox', path: '/order-inbox' },
  { page: 'queue', path: '/driver-queue' },
  { page: 'delivery_tracking', path: '/delivery-tracking' },
  { page: 'planning', path: '/delivery-planning' },
  { page: 'postal', path: '/thai-post' },
  { page: 'drivers', path: '/drivers' },
  { page: 'rider', path: '/rider' },
];

const routeByPage = Object.fromEntries(
  routeDefinitions.map((route) => [route.page, route]),
) as Record<PageKey, RouteDefinition>;

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

export function getPathForPage(page: PageKey) {
  return routeByPage[page].path;
}

export function getPageFromPath(pathname: string): PageKey {
  const normalizedPath = normalizePath(pathname);

  // /rider และ sub-route ทั้งหมด (/rider/assigned, /rider/in-transit, ...) = page 'rider'
  // tab routing ภายใน /rider จัดการที่ src/features/rider (riderTabs.ts)
  if (normalizedPath === '/rider' || normalizedPath.startsWith('/rider/')) {
    return 'rider';
  }

  const matchedRoute = routeDefinitions.find((route) => {
    if (route.path === normalizedPath) return true;
    return route.aliases?.includes(normalizedPath);
  });

  return matchedRoute?.page ?? 'overview';
}

export function getCanonicalPath(pathname: string) {
  const page = getPageFromPath(pathname);
  // rider เก็บ sub-path ไว้ (อย่ายุบ /rider/delivered → /rider) — ให้ feature redirect เอง
  if (page === 'rider') return normalizePath(pathname);
  return getPathForPage(page);
}
