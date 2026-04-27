export type PageKey =
  | "overview"
  | "chat"
  | "inbox"
  | "queue"
  | "postal"
  | "drivers";

type RouteDefinition = {
  page: PageKey;
  path: string;
  aliases?: string[];
};

const routeDefinitions: RouteDefinition[] = [
  { page: "overview", path: "/", aliases: ["/overview"] },
  { page: "chat", path: "/chat-intake" },
  { page: "inbox", path: "/order-inbox" },
  { page: "queue", path: "/driver-queue" },
  { page: "postal", path: "/thai-post" },
  { page: "drivers", path: "/drivers" },
];

const routeByPage = Object.fromEntries(
  routeDefinitions.map((route) => [route.page, route])
) as Record<PageKey, RouteDefinition>;

function normalizePath(pathname: string) {
  if (!pathname) return "/";
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function getPathForPage(page: PageKey) {
  return routeByPage[page].path;
}

export function getPageFromPath(pathname: string): PageKey {
  const normalizedPath = normalizePath(pathname);

  const matchedRoute = routeDefinitions.find((route) => {
    if (route.path === normalizedPath) return true;
    return route.aliases?.includes(normalizedPath);
  });

  return matchedRoute?.page ?? "overview";
}

export function getCanonicalPath(pathname: string) {
  return getPathForPage(getPageFromPath(pathname));
}
