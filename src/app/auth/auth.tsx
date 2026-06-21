import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { readJsonResponse, resolveApiErrorMessage } from '@/lib/http';

export type AuthRole = 'administrator' | 'client' | 'executive' | 'supervisor';

export type AuthUser = {
  id: string;
  login: string;
  displayName: string;
  role: AuthRole;
  clientCode: string | null;
  canAccessAllClients: boolean;
};

type AuthStoredState = {
  token: string;
  user: AuthUser;
  expiresAt?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
};

type AuthContextValue = AuthState & {
  login: (login: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

type AuthLoginResponse = {
  ok?: boolean;
  token?: string;
  expiresAt?: string;
  user?: AuthUser;
  error?: string;
  message?: string;
};

type AuthMeResponse = {
  ok?: boolean;
  user?: AuthUser;
  error?: string;
  message?: string;
};

const AUTH_STORAGE_KEY = 'ember:auth-session';
const AUTH_EVENT_NAME = 'ember:auth-session-change';

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<AuthUser>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.login !== 'string' ||
    typeof candidate.displayName !== 'string' ||
    typeof candidate.role !== 'string'
  ) {
    return null;
  }

  if (!['administrator', 'client', 'executive', 'supervisor'].includes(candidate.role)) {
    return null;
  }

  return {
    id: candidate.id,
    login: candidate.login,
    displayName: candidate.displayName,
    role: candidate.role as AuthRole,
    clientCode: typeof candidate.clientCode === 'string' ? candidate.clientCode : null,
    canAccessAllClients: candidate.canAccessAllClients === true,
  };
}

function normalizeStoredState(value: unknown): AuthStoredState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<AuthStoredState>;
  const token = typeof candidate.token === 'string' ? candidate.token.trim() : '';
  const user = normalizeAuthUser(candidate.user);
  if (!token || !user) {
    return null;
  }

  return {
    token,
    user,
    expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : null,
  };
}

function readStoredAuthState(): AuthStoredState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeStoredState(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeStoredAuthState(state: AuthStoredState | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!state) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function broadcastAuthChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_EVENT_NAME));
}

function handleUnauthorizedResponse() {
  writeStoredAuthState(null);
  broadcastAuthChange();
}

function readCurrentToken() {
  return readStoredAuthState()?.token ?? null;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = readCurrentToken();
  const headers = new Headers(init.headers ?? undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    handleUnauthorizedResponse();
  }

  return response;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    token: readStoredAuthState()?.token ?? null,
    isLoading: true,
  }));

  const syncFromStorage = useCallback(() => {
    const storedState = readStoredAuthState();
    setState({
      user: storedState?.user ?? null,
      token: storedState?.token ?? null,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleSessionEvent = () => {
      if (!cancelled) {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleSessionEvent);
    window.addEventListener(AUTH_EVENT_NAME, handleSessionEvent);

    const storedState = readStoredAuthState();

    if (!storedState?.token) {
      setState({
        user: null,
        token: null,
        isLoading: false,
      });
      return () => {
        cancelled = true;
        window.removeEventListener('storage', handleSessionEvent);
        window.removeEventListener(AUTH_EVENT_NAME, handleSessionEvent);
      };
    }

    const verifySession = async () => {
      try {
        const response = await authFetch('/recorder-api/auth/me', {
          method: 'GET',
        });
        const payload = await readJsonResponse<AuthMeResponse>(response);

        if (!response.ok || !payload?.ok || !payload.user) {
          handleUnauthorizedResponse();
          if (!cancelled) {
            setState({
              user: null,
              token: null,
              isLoading: false,
            });
          }
          return;
        }

        const normalizedUser = normalizeAuthUser(payload.user);
        if (!normalizedUser) {
          handleUnauthorizedResponse();
          if (!cancelled) {
            setState({
              user: null,
              token: null,
              isLoading: false,
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            user: normalizedUser,
            token: storedState.token,
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            user: null,
            token: null,
            isLoading: false,
          });
        }
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleSessionEvent);
      window.removeEventListener(AUTH_EVENT_NAME, handleSessionEvent);
    };
  }, [syncFromStorage]);

  const login = useCallback(async (loginValue: string, password: string) => {
    const response = await fetch('/recorder-api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        login: loginValue,
        password,
      }),
    });

    const payload = await readJsonResponse<AuthLoginResponse>(response);
    if (!response.ok || !payload?.ok || !payload.token || !payload.user) {
      throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo iniciar sesión.'));
    }

    const normalizedUser = normalizeAuthUser(payload.user);
    if (!normalizedUser) {
      throw new Error('La respuesta de autenticación no es válida.');
    }

    writeStoredAuthState({
      token: payload.token,
      user: normalizedUser,
      expiresAt: payload.expiresAt ?? null,
    });
    setState({
      user: normalizedUser,
      token: payload.token,
      isLoading: false,
    });
    broadcastAuthChange();
    return normalizedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch('/recorder-api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Intentamos cerrar sesión local incluso si el backend ya no responde.
    }

    writeStoredAuthState(null);
    setState({
      user: null,
      token: null,
      isLoading: false,
    });
    broadcastAuthChange();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
    }),
    [login, logout, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }
  return context;
}

function FullScreenLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <p className="text-sm text-white/70">{message}</p>
      </div>
    </div>
  );
}

export function AuthGate() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenLoading message="Cargando la sesión..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function AdminGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoading message="Verificando permisos..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'administrator') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function useAuthToken() {
  return readCurrentToken();
}
