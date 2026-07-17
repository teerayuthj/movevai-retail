import { APP_API_BASE, request } from './client';

export const RETAIL_PERMISSIONS = [
  'overview.view',
  'script_transform.use',
  'inbox.manage',
  'queue.manage',
  'route_builder.manage',
  'planning.manage',
  'delivery_tracking.view',
  'live_view.view',
  'notifications.manage',
  'delivery_report.view',
  'tracking_history.view',
  'postal.manage',
  'drivers.manage',
  'customers.view',
  'messenger.open',
  'settings.users.manage',
  'settings.roles.manage',
  'settings.security.manage',
] as const;

export type RetailPermission = (typeof RETAIL_PERMISSIONS)[number];

export type RetailRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: RetailPermission[];
  isSystem: boolean;
  isActive: boolean;
  isProtected: boolean;
  userCount?: number;
};

export type RetailUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: RetailRole;
  activeSessionCount?: number;
};

export type RetailSecurityPolicy = {
  id: string;
  sessionDurationHours: number;
  idleTimeoutMinutes: number;
  maxDevicesPerUser: number;
  revokeSessionsOnPasswordChange: boolean;
  auditRetentionDays: number;
  updatedAt: string;
};

export type RetailSessionInfo = {
  id?: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
};

export type RetailCurrentUser = {
  id: string;
  email: string;
  name: string;
  role: RetailRole;
  permissions: RetailPermission[];
  session: RetailSessionInfo;
};

type LoginResponse = {
  token: string;
  user: RetailUser;
  session: RetailSessionInfo;
  policy: RetailSecurityPolicy;
};

export function loginRetailApp(email: string, password: string) {
  return request<LoginResponse>(`${APP_API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchRetailMe() {
  const response = await request<{
    user: {
      sub: string;
      email: string;
      name: string;
      role: { id: string; code: string; name: string };
      permissions: RetailPermission[];
      session: RetailSessionInfo;
    };
    policy: RetailSecurityPolicy;
  }>(`${APP_API_BASE}/auth/me`);
  return {
    user: {
      id: response.user.sub,
      email: response.user.email,
      name: response.user.name,
      role: {
        ...response.user.role,
        description: null,
        permissions: response.user.permissions,
        isSystem: true,
        isActive: true,
        isProtected: response.user.role.code === 'admin',
      },
      permissions: response.user.permissions,
      session: response.user.session,
    } satisfies RetailCurrentUser,
    policy: response.policy,
  };
}

export function logoutRetailApp() {
  return request<{ ok: true }>(`${APP_API_BASE}/auth/logout`, { method: 'POST' });
}

export function fetchRetailUsers() {
  return request<RetailUser[]>(`${APP_API_BASE}/admin/users`);
}

export function createRetailUser(input: {
  name: string;
  email: string;
  password: string;
  roleId: string;
}) {
  return request<RetailUser>(`${APP_API_BASE}/admin/users`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRetailUser(
  id: string,
  input: Partial<Pick<RetailUser, 'name' | 'email' | 'isActive'>> & { roleId?: string },
) {
  return request<RetailUser>(`${APP_API_BASE}/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function resetRetailUserPassword(id: string, password: string) {
  return request<{ ok: true; sessionsRevoked: boolean }>(
    `${APP_API_BASE}/admin/users/${encodeURIComponent(id)}/reset-password`,
    { method: 'POST', body: JSON.stringify({ password }) },
  );
}

export function revokeRetailUserSessions(id: string) {
  return request<{ ok: true; revoked: number }>(
    `${APP_API_BASE}/admin/users/${encodeURIComponent(id)}/revoke-sessions`,
    { method: 'POST' },
  );
}

export function fetchRetailRoles() {
  return request<RetailRole[]>(`${APP_API_BASE}/admin/roles`);
}

export function updateRetailRole(
  id: string,
  input: { name?: string; description?: string | null; permissions: RetailPermission[] },
) {
  return request<RetailRole>(`${APP_API_BASE}/admin/roles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchRetailSecurityPolicy() {
  return request<RetailSecurityPolicy>(`${APP_API_BASE}/admin/security-policy`);
}

export function updateRetailSecurityPolicy(input: Omit<RetailSecurityPolicy, 'id' | 'updatedAt'>) {
  return request<RetailSecurityPolicy>(`${APP_API_BASE}/admin/security-policy`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type RetailAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  target: { name: string; email?: string } | null;
};

export type RetailAuditLogPage = {
  items: RetailAuditLog[];
  nextCursor: string | null;
};

export function fetchRetailAuditLogs(options: { take?: number; cursor?: string } = {}) {
  const params = new URLSearchParams({ take: String(options.take ?? 50) });
  if (options.cursor) params.set('cursor', options.cursor);
  return request<RetailAuditLogPage>(`${APP_API_BASE}/admin/audit-logs?${params.toString()}`);
}
