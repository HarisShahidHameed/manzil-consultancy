import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import api, { setAccessToken } from '../api/axios';
import type { AuthState, AuthUser, LoginResponse } from '../types';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (...permissions: string[]) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTH'; payload: { user: AuthUser; roles: string[]; permissions: string[]; accessToken: string } }
  | { type: 'CLEAR_AUTH' };

const initialState: AuthState = {
  user: null,
  roles: [],
  permissions: [],
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_AUTH':
      return {
        ...state,
        user: action.payload.user,
        roles: action.payload.roles,
        permissions: action.payload.permissions,
        accessToken: action.payload.accessToken,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'CLEAR_AUTH':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresInMs: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(expiresInMs - 60_000, 10_000); // refresh 1 min before expiry
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
        const token = res.data.data?.accessToken;
        if (token) {
          setAccessToken(token);
          const payload = parseJwt(token);
          scheduleRefresh((payload.exp * 1000) - Date.now());
        }
      } catch {
        dispatch({ type: 'CLEAR_AUTH' });
        setAccessToken(null);
      }
    }, delay);
  }, []);

  const setAuth = useCallback((data: LoginResponse) => {
    setAccessToken(data.accessToken);
    dispatch({ type: 'SET_AUTH', payload: { ...data } });
    const payload = parseJwt(data.accessToken);
    if (payload?.exp) scheduleRefresh((payload.exp * 1000) - Date.now());
  }, [scheduleRefresh]);

  // Silent refresh on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
        if (cancelled) return;
        const token = res.data.data?.accessToken;
        if (token) {
          setAccessToken(token);
          const meRes = await api.get<{ data: { id: string; email: string; firstName: string; lastName: string; roles: string[]; permissions: string[] } }>('/auth/me');
          if (cancelled) return;
          const me = meRes.data.data!;
          dispatch({
            type: 'SET_AUTH',
            payload: {
              user: { id: me.id, email: me.email, firstName: me.firstName, lastName: me.lastName },
              roles: me.roles,
              permissions: me.permissions,
              accessToken: token,
            },
          });
          const payload = parseJwt(token);
          if (payload?.exp) scheduleRefresh((payload.exp * 1000) - Date.now());
        } else {
          dispatch({ type: 'CLEAR_AUTH' });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'CLEAR_AUTH' });
      }
    })();
    return () => { cancelled = true; };
  }, [scheduleRefresh]);

  // Handle forced logout event from axios interceptor
  useEffect(() => {
    const handler = () => { dispatch({ type: 'CLEAR_AUTH' }); setAccessToken(null); };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loginRes = await api.post<{ data: LoginResponse }>('/auth/login', { email, password });
    const loginData = loginRes.data.data!;
    // Fetch full profile so firstName/lastName are available immediately
    setAccessToken(loginData.accessToken);
    try {
      const meRes = await api.get<{ data: { id: string; email: string; firstName: string; lastName: string; roles: string[]; permissions: string[] } }>('/auth/me');
      const me = meRes.data.data!;
      loginData.user = { id: me.id, email: me.email, firstName: me.firstName, lastName: me.lastName };
    } catch { /* use login response user as fallback */ }
    setAuth(loginData);
  }, [setAuth]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    dispatch({ type: 'CLEAR_AUTH' });
  }, []);

  const hasPermission = useCallback((...perms: string[]) =>
    perms.every(p => state.permissions.includes(p)), [state.permissions]);

  const hasAnyPermission = useCallback((...perms: string[]) =>
    perms.some(p => state.permissions.includes(p)), [state.permissions]);

  const hasRole = useCallback((...roles: string[]) =>
    roles.some(r => state.roles.includes(r)), [state.roles]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission, hasAnyPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};

function parseJwt(token: string): Record<string, number> {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}
