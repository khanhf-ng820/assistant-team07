import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type CarentaApiClient, createCarentaApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { type ReadCache, createUserScopedReadCache } from '../api/readCache';
import {
  apiBaseUrl as defaultApiBaseUrl,
  isSupabaseAuthConfigured as defaultIsConfigured,
  supabaseAnonKey as defaultAnonKey,
  supabaseUrl as defaultSupabaseUrl,
} from '../config';
import { createSecureSessionStorage } from './storage';
import { createSupabaseAuthGateway } from './supabaseAuth';
import type { AuthGateway, AuthSession, AuthStatus, SessionStorage } from './types';

const REFRESH_LEEWAY_SECONDS = 30;

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  apiClient: CarentaApiClient;
  readCache: ReadCache;
}

export interface AuthProviderProps extends PropsWithChildren {
  baseUrl?: string;
  isConfigured?: boolean;
  storage?: SessionStorage;
  authGateway?: AuthGateway;
  fetchImpl?: typeof fetch;
  readCache?: ReadCache;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  baseUrl = defaultApiBaseUrl,
  isConfigured = defaultIsConfigured,
  storage: injectedStorage,
  authGateway: injectedGateway,
  fetchImpl,
  readCache: injectedCache,
}: AuthProviderProps) {
  const storage = useMemo(
    () => injectedStorage ?? createSecureSessionStorage(),
    [injectedStorage]
  );
  const readCache = useMemo(
    () => injectedCache ?? createUserScopedReadCache(),
    [injectedCache]
  );
  const authGateway = useMemo(() => {
    if (injectedGateway) return injectedGateway;
    if (!isConfigured || !defaultSupabaseUrl || !defaultAnonKey) return undefined;
    return createSupabaseAuthGateway({
      supabaseUrl: defaultSupabaseUrl,
      supabaseAnonKey: defaultAnonKey,
      fetchImpl,
    });
  }, [injectedGateway, isConfigured, fetchImpl]);

  const [status, setStatus] = useState<AuthStatus>(() =>
    isConfigured ? 'restoring' : 'local_dev'
  );
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<AuthSession | null>(null);
  const inflightRefresh = useRef<Promise<string | null> | null>(null);

  const commitSession = useCallback((nextSession: AuthSession | null, nextStatus: AuthStatus) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStatus(nextStatus);
  }, []);

  const signOut = useCallback(async () => {
    const previousToken = sessionRef.current?.accessToken;
    commitSession(null, isConfigured ? 'signed_out' : 'local_dev');
    setError(null);
    readCache.clearAll();
    try {
      await storage.clearSession();
    } catch {
      // Best-effort secure storage wipe.
    }
    if (previousToken && authGateway) {
      await authGateway.signOut(previousToken);
    }
  }, [authGateway, commitSession, isConfigured, readCache, storage]);

  useEffect(() => {
    if (!isConfigured) {
      commitSession(null, 'local_dev');
      return;
    }

    let cancelled = false;
    async function restore() {
      try {
        const stored = await storage.getSession();
        if (cancelled) return;
        if (!stored) {
          commitSession(null, 'signed_out');
          return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        if (stored.expiresAt > nowSec + REFRESH_LEEWAY_SECONDS) {
          commitSession(stored, 'authenticated');
          return;
        }

        if (!authGateway) {
          await storage.clearSession();
          if (!cancelled) commitSession(null, 'signed_out');
          return;
        }

        const refreshed = await authGateway.refreshSession(stored.refreshToken);
        if (cancelled) return;
        await storage.setSession(refreshed);
        if (!cancelled) commitSession(refreshed, 'authenticated');
      } catch {
        readCache.clearAll();
        try {
          await storage.clearSession();
        } catch {
          // Ignore storage wipe errors.
        }
        if (!cancelled) commitSession(null, 'signed_out');
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [authGateway, commitSession, isConfigured, readCache, storage]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!authGateway) {
        setError('Supabase Auth chưa được cấu hình.');
        return;
      }
      setError(null);
      try {
        const nextSession = await authGateway.signInWithPassword(email.trim(), password);
        const previousId = sessionRef.current?.user.id;
        if (previousId && previousId !== nextSession.user.id) {
          readCache.clearAll();
        }
        await storage.setSession(nextSession);
        commitSession(nextSession, 'authenticated');
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.userMessage
            : 'Đăng nhập không thành công. Vui lòng thử lại.';
        setError(msg);
        throw err;
      }
    },
    [authGateway, commitSession, readCache, storage]
  );

  const handleUnauthorized = useCallback(async (): Promise<string | null> => {
    const active = sessionRef.current;
    if (!isConfigured || !authGateway || !active) {
      return null;
    }
    if (!inflightRefresh.current) {
      inflightRefresh.current = (async () => {
        try {
          const refreshed = await authGateway.refreshSession(active.refreshToken);
          await storage.setSession(refreshed);
          commitSession(refreshed, 'authenticated');
          return refreshed.accessToken;
        } catch {
          await signOut();
          return null;
        } finally {
          inflightRefresh.current = null;
        }
      })();
    }
    return inflightRefresh.current;
  }, [authGateway, commitSession, isConfigured, signOut, storage]);

  const apiClient = useMemo(
    () =>
      createCarentaApiClient({
        baseUrl,
        fetchImpl,
        getAccessToken: () => sessionRef.current?.accessToken,
        onUnauthorized: handleUnauthorized,
      }),
    [baseUrl, fetchImpl, handleUnauthorized]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      error,
      signIn,
      signOut,
      apiClient,
      readCache,
    }),
    [status, session, error, signIn, signOut, apiClient, readCache]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
