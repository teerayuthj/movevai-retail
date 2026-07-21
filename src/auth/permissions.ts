import type { PageKey } from '@/lib/routes';
import type { RetailCurrentUser, RetailPermission } from '@/lib/retailApi';

export const PAGE_PERMISSION: Partial<Record<PageKey, RetailPermission>> = {
  overview: 'overview.view',
  script_transform: 'script_transform.use',
  inbox: 'inbox.manage',
  route_builder: 'route_builder.manage',
  delivery_tracking: 'delivery_tracking.view',
  live_view: 'live_view.view',
  notifications: 'notifications.manage',
  delivery_report: 'delivery_report.view',
  tracking_history: 'tracking_history.view',
  postal: 'postal.manage',
  drivers: 'drivers.manage',
  customers: 'customers.view',
  messenger: 'messenger.open',
  users: 'settings.users.manage',
  roles: 'settings.roles.manage',
  security: 'settings.security.manage',
};

export function canAccessPage(user: RetailCurrentUser, page: PageKey) {
  if (user.role.code === 'admin' || page === 'profile') return true;
  if (page === 'delivery_workspace') {
    return (
      user.permissions.includes('queue.manage') || user.permissions.includes('planning.manage')
    );
  }
  const permission = PAGE_PERMISSION[page];
  return permission ? user.permissions.includes(permission) : false;
}

export function firstAccessiblePage(user: RetailCurrentUser): PageKey {
  const candidates: PageKey[] = [
    'overview',
    'inbox',
    'delivery_workspace',
    'route_builder',
    'delivery_tracking',
    'drivers',
    'customers',
    'profile',
  ];
  return candidates.find((page) => canAccessPage(user, page)) ?? 'profile';
}
