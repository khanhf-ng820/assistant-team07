import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  type AuthSnapshot,
  type CarentaApiClient,
  type CarentaRuntime,
  createDefaultCarentaRuntime,
} from '../runtime/carentaRuntime';

export interface AuthContextValue extends AuthSnapshot {
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly retryRestore: () => Promise<void>;
  readonly apiClient: CarentaApiClient;
}

export interface AuthProviderProps extends PropsWithChildren {
  readonly runtime?: CarentaRuntime;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, runtime: injectedRuntime }: AuthProviderProps) {
  const defaultRuntimeRef = useRef<CarentaRuntime | null>(null);
  if (!injectedRuntime && !defaultRuntimeRef.current) {
    defaultRuntimeRef.current = createDefaultCarentaRuntime();
  }
  const runtime = injectedRuntime ?? defaultRuntimeRef.current!;

  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  );

  useEffect(() => {
    void runtime.restore();
  }, [runtime]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      signIn: runtime.signIn,
      signOut: runtime.signOut,
      retryRestore: () => runtime.restore({ force: true }),
      apiClient: runtime.apiClient,
    }),
    [snapshot, runtime]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
