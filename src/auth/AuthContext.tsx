import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  APP_AUTH_EXPIRED_EVENT,
  APP_TOKEN_KEY,
  clearLocalAppSession,
  fetchRetailMe,
  loginRetailApp,
  logoutRetailApp,
  type RetailCurrentUser,
  type RetailSecurityPolicy,
} from '@/lib/retailApi';

type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: RetailCurrentUser | null;
  policy: RetailSecurityPolicy | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    policy: null,
  });

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(APP_TOKEN_KEY);
    if (!token) {
      setState({ status: 'unauthenticated', user: null, policy: null });
      return;
    }
    try {
      const result = await fetchRetailMe();
      setState({ status: 'authenticated', ...result });
    } catch {
      clearLocalAppSession();
      setState({ status: 'unauthenticated', user: null, policy: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleExpired = () => setState({ status: 'unauthenticated', user: null, policy: null });
    window.addEventListener(APP_AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(APP_AUTH_EXPIRED_EVENT, handleExpired);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRetailApp(email, password);
    localStorage.setItem(APP_TOKEN_KEY, result.token);
    setState({
      status: 'authenticated',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        permissions: result.user.role.permissions,
        session: result.session,
      },
      policy: result.policy,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRetailApp();
    } finally {
      clearLocalAppSession();
      setState({ status: 'unauthenticated', user: null, policy: null });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh }),
    [state, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hook intentionally lives next to its provider to keep auth state private to this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return value;
}
