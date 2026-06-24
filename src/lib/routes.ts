export type PageKey =
  | 'overview'
  | 'chat'
  | 'script_transform'
  | 'inbox'
  | 'queue'
  | 'delivery_tracking'
  | 'tracking_history'
  | 'planning'
  | 'postal'
  | 'drivers'
  | 'messenger';

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
  { page: 'tracking_history', path: '/tracking-history' },
  { page: 'planning', path: '/delivery-planning' },
  { page: 'postal', path: '/thai-post' },
  { page: 'drivers', path: '/drivers' },
  { page: 'messenger', path: '/messenger' },
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

  // /messenger และ sub-route ทั้งหมด (/messenger/assigned, /messenger/in-transit, ...) = page 'messenger'
  // tab routing ภายใน /messenger จัดการที่ src/features/messenger (messengerTabs.ts)
  if (normalizedPath === '/messenger' || normalizedPath.startsWith('/messenger/')) {
    return 'messenger';
  }

  const matchedRoute = routeDefinitions.find((route) => {
    if (route.path === normalizedPath) return true;
    return route.aliases?.includes(normalizedPath);
  });

  return matchedRoute?.page ?? 'overview';
}

export function getCanonicalPath(pathname: string) {
  const page = getPageFromPath(pathname);
  // messenger เก็บ sub-path ไว้ (อย่ายุบ /messenger/delivered → /messenger) — ให้ feature redirect เอง
  if (page === 'messenger') return normalizePath(pathname);
  return getPathForPage(page);
}
