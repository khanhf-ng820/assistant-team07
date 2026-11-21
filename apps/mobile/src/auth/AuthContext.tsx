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
  isSupabasePartialConfig as defaultIsPartialConfig,
  supabaseAnonKey as defaultAnonKey,
  supabaseConfigError as defaultConfigError,
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
  isPartialConfig?: boolean;
  configError?: string | null;
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
  isPartialConfig = defaultIsPartialConfig,
  configError = defaultConfigError,
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

  const initialStatus: AuthStatus = isPartialConfig
    ? 'signed_out'
    : isConfigured
      ? 'restoring'
      : 'local_dev';

  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(() =>
    isPartialConfig ? (configError ?? 'Cấu hình Supabase chưa đầy đủ.') : null
  );

  const sessionRef = useRef<AuthSession | null>(null);
  const authEpochRef = useRef(0);

  const commitSession = useCallback((nextSession: AuthSession | null, nextStatus: AuthStatus) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStatus(nextStatus);
  }, []);

  const signOut = useCallback(async () => {
    authEpochRef.current += 1;
    const previousToken = sessionRef.current?.accessToken;
    commitSession(null, isConfigured || isPartialConfig ? 'signed_out' : 'local_dev');
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
  }, [authGateway, commitSession, isConfigured, isPartialConfig, readCache, storage]);

  useEffect(() => {
    if (isPartialConfig) {
      commitSession(null, 'signed_out');
      setError(configError ?? 'Cấu hình Supabase chưa đầy đủ.');
      return;
    }

    if (!isConfigured) {
      commitSession(null, 'local_dev');
      return;
    }

    let cancelled = false;
    const epochAtStart = authEpochRef.current;

    async function restore() {
      try {
        const stored = await storage.getSession();
        if (cancelled || epochAtStart !== authEpochRef.current) return;
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
          if (!cancelled && epochAtStart === authEpochRef.current) {
            commitSession(null, 'signed_out');
          }
          return;
        }

        const refreshed = await authGateway.refreshSession(stored.refreshToken);
        if (cancelled || epochAtStart !== authEpochRef.current) return;
        await storage.setSession(refreshed);
        if (!cancelled && epochAtStart === authEpochRef.current) {
          commitSession(refreshed, 'authenticated');
        }
      } catch (err) {
        if (cancelled || epochAtStart !== authEpochRef.current) return;
        const isTransient = err instanceof ApiError && err.retryable;
        if (isTransient) {
          setError(err.userMessage);
          commitSession(null, 'signed_out');
          return;
        }
        readCache.clearAll();
        try {
          await storage.clearSession();
        } catch {
          // Ignore storage wipe errors.
        }
        if (!cancelled && epochAtStart === authEpochRef.current) {
          commitSession(null, 'signed_out');
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [authGateway, commitSession, configError, isConfigured, isPartialConfig, readCache, storage]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isPartialConfig) {
        setError(configError ?? 'Cấu hình Supabase chưa đầy đủ.');
        return;
      }
      if (!authGateway) {
        setError('Supabase Auth chưa được cấu hình.');
        return;
      }
      setError(null);
      const epochAtStart = authEpochRef.current;
      try {
        const nextSession = await authGateway.signInWithPassword(email.trim(), password);
        if (epochAtStart !== authEpochRef.current) {
          return;
        }
        const previousId = sessionRef.current?.user.id;
        if (previousId && previousId !== nextSession.user.id) {
          readCache.clearAll();
        }
        await storage.setSession(nextSession);
        authEpochRef.current += 1;
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
    [authGateway, commitSession, configError, isPartialConfig, readCache, storage]
  );

  const handleUnauthorized = useCallback(async (): Promise<string | null> => {
    const active = sessionRef.current;
    if (!isConfigured || !authGateway || !active) {
      return null;
    }
    const epochAtStart = authEpochRef.current;
    try {
      const refreshed = await authGateway.refreshSession(active.refreshToken);
      if (epochAtStart !== authEpochRef.current) {
        return null;
      }
      await storage.setSession(refreshed);
      if (epochAtStart !== authEpochRef.current) {
        return null;
      }
      commitSession(refreshed, 'authenticated');
      return refreshed.accessToken;
    } catch {
      if (epochAtStart === authEpochRef.current) {
        await signOut();
      }
      return null;
    }
  }, [authGateway, commitSession, isConfigured, signOut, storage]);

  const apiClient = useMemo(
    () =>
      createCarentaApiClient({
        baseUrl,
        fetchImpl,
        getAccessToken: () => sessionRef.current?.accessToken,
        onUnauthorized: handleUnauthorized,
        readCache,
        getCacheUserKey: () =>
          sessionRef.current?.user.id ?? (!isConfigured && !isPartialConfig ? 'local-dev' : null),
      }),
    [baseUrl, fetchImpl, handleUnauthorized, isConfigured, isPartialConfig, readCache]
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
