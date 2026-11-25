import {
  type AuthIdentity,
  type BudgetConfigRequest,
  type BudgetConfigResponse,
  type BudgetSummaryQuery,
  type BudgetSummaryResponse,
  type GoalAllocationRequest,
  type GoalCreate,
  type GoalResponse,
  type GoalUpdate,
  type HealthResponse,
  type TransactionCreate,
  type TransactionListQuery,
  type TransactionListResponse,
  type TransactionResponse,
  parseAuthIdentity,
  parseBudgetConfigResponse,
  parseBudgetSummary,
  parseGoal,
  parseGoalList,
  parseHealthResponse,
  parseTransaction,
  parseTransactionList,
} from '../api/contracts';
import {
  ApiError,
  createAbortedError,
  createStorageError,
  isApiError,
  isOfflineFallbackError,
  localizeTransportError,
  normalizeHttpError,
} from '../api/errors';
import {
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
  createFetchTransport,
} from '../api/transport';
import { createSecureSessionStorage } from '../auth/storage';
import { createSupabaseAuthGateway } from '../auth/supabaseAuth';
import type {
  AuthGateway,
  AuthSession,
  AuthStatus,
  SessionStorage,
  StudentIdentity,
} from '../auth/types';
import { type RawMobileEnv, resolveMobileConfig } from '../config';

const DEFAULT_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;
const REFRESH_LEEWAY_SECONDS = 30;

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface FallbackReadOptions extends RequestOptions {
  /** Defaults to true. Set false to require a live response with no Offline Fallback. */
  readonly allowOfflineFallback?: boolean;
}

export type ReadResult<T> =
  | { readonly data: T; readonly fromCache: false }
  | {
      readonly data: T;
      readonly fromCache: true;
      readonly cachedAt: number;
      readonly error: ApiError;
    };

export interface CarentaApiClient {
  checkHealth: (options?: RequestOptions) => Promise<HealthResponse>;
  getAuthMe: (options?: RequestOptions) => Promise<AuthIdentity>;
  getBudgetSummary: (
    query?: BudgetSummaryQuery,
    options?: FallbackReadOptions
  ) => Promise<ReadResult<BudgetSummaryResponse>>;
  configureBudget: (
    payload: BudgetConfigRequest,
    options?: RequestOptions
  ) => Promise<BudgetConfigResponse>;
  listTransactions: (
    query?: TransactionListQuery,
    options?: FallbackReadOptions
  ) => Promise<ReadResult<TransactionListResponse>>;
  createTransaction: (
    payload: TransactionCreate,
    options?: RequestOptions
  ) => Promise<TransactionResponse>;
  getTransaction: (id: string, options?: RequestOptions) => Promise<TransactionResponse>;
  listGoals: (today?: string, options?: RequestOptions) => Promise<GoalResponse[]>;
  createGoal: (
    payload: GoalCreate,
    today?: string,
    options?: RequestOptions
  ) => Promise<GoalResponse>;
  getActiveGoal: (
    today?: string,
    options?: FallbackReadOptions
  ) => Promise<ReadResult<GoalResponse>>;
  setActiveGoal: (
    payload: GoalCreate,
    today?: string,
    options?: RequestOptions
  ) => Promise<GoalResponse>;
  updateActiveGoal: (
    payload: GoalUpdate,
    today?: string,
    options?: RequestOptions
  ) => Promise<GoalResponse>;
  allocateToActiveGoal: (
    payload: GoalAllocationRequest,
    today?: string,
    options?: RequestOptions
  ) => Promise<GoalResponse>;
}

export type RuntimeAuthMode =
  | { readonly kind: 'local_dev' }
  | { readonly kind: 'misconfigured'; readonly error: string }
  | {
      readonly kind: 'authenticated';
      readonly storage: SessionStorage;
      readonly authGateway: AuthGateway;
    };

export interface CarentaRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly authMode: RuntimeAuthMode;
  readonly httpTransport?: HttpTransport;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly generateRequestId?: () => string;
}

/** Secret-free view of Auth Session state exposed to UI subscribers. */
export interface AuthSnapshot {
  readonly status: AuthStatus;
  readonly student: StudentIdentity | null;
  readonly error: string | null;
  readonly isApiConfigured: boolean;
  readonly canRetryRestore: boolean;
}

export interface CarentaRuntime {
  getSnapshot: () => AuthSnapshot;
  subscribe: (listener: () => void) => () => void;
  restore: (options?: { readonly force?: boolean }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  readonly apiClient: CarentaApiClient;
}

type RefreshOutcome =
  | { readonly ok: true; readonly session: AuthSession }
  | { readonly ok: false; readonly error: unknown; readonly retryable: boolean };

function defaultRequestId(): string {
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function sameStudent(a: StudentIdentity | null, b: StudentIdentity | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email && a.role === b.role;
}

export function createCarentaRuntime(options: CarentaRuntimeOptions): CarentaRuntime {
  const cleanBaseUrl = options.apiBaseUrl?.trim().replace(/\/+$/, '') || undefined;
  const isApiConfigured = Boolean(cleanBaseUrl);
  const transport = options.httpTransport ?? createFetchTransport();
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nowMs = options.now ?? Date.now;
  const nextRequestId = options.generateRequestId ?? defaultRequestId;

  const initialStatus: AuthStatus =
    options.authMode.kind === 'local_dev'
      ? 'local_dev'
      : options.authMode.kind === 'misconfigured'
        ? 'signed_out'
        : 'restoring';
  const initialError =
    options.authMode.kind === 'misconfigured' ? options.authMode.error : null;

  let snapshot: AuthSnapshot = {
    status: initialStatus,
    student: null,
    error: initialError,
    isApiConfigured,
    canRetryRestore: false,
  };

  let currentSession: AuthSession | null = null;
  let sessionEpoch = 0;
  let restoreSettled = options.authMode.kind !== 'authenticated';
  let pendingRestore: Promise<void> | null = null;
  let pendingRefresh: { epoch: number; promise: Promise<RefreshOutcome> } | null = null;
  let storageQueue: Promise<void> = Promise.resolve();

  const listeners = new Set<() => void>();
  const offlineCache = new Map<string, { data: unknown; cachedAt: number }>();

  function commitSnapshot(next: Omit<AuthSnapshot, 'isApiConfigured'>): void {
    if (
      snapshot.status === next.status &&
      snapshot.error === next.error &&
      snapshot.canRetryRestore === next.canRetryRestore &&
      sameStudent(snapshot.student, next.student)
    ) {
      return;
    }
    snapshot = {
      status: next.status,
      student: next.student ? { ...next.student } : null,
      error: next.error,
      isApiConfigured,
      canRetryRestore: next.canRetryRestore,
    };
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function readStorageSerialized(): Promise<AuthSession | null> {
    if (options.authMode.kind !== 'authenticated') return Promise.resolve(null);
    const storage = options.authMode.storage;
    const task = storageQueue.then(() => storage.getSession());
    storageQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  function persistSessionGuarded(session: AuthSession, expectedEpoch: number): Promise<void> {
    if (options.authMode.kind !== 'authenticated') return Promise.resolve();
    const storage = options.authMode.storage;
    const task = storageQueue.then(async () => {
      if (sessionEpoch !== expectedEpoch) return;
      await storage.setSession(session);
    });
    storageQueue = task.catch(() => {});
    return task;
  }

  function clearStorageSerialized(): Promise<void> {
    if (options.authMode.kind !== 'authenticated') return Promise.resolve();
    const storage = options.authMode.storage;
    const task = storageQueue.then(async () => {
      try {
        await storage.clearSession();
      } catch (err) {
        if (isApiError(err) && err.code === 'STORAGE_CLEAR_FAILED') {
          throw err;
        }
        throw createStorageError('STORAGE_CLEAR_FAILED', err);
      }
    });
    storageQueue = task.catch(() => {});
    return task;
  }

  function getCacheScope(): string | null {
    if (currentSession) {
      return `${currentSession.user.id}::${sessionEpoch}`;
    }
    if (options.authMode.kind === 'local_dev') {
      return `local-dev::${sessionEpoch}`;
    }
    return null;
  }

  function runSingleFlightRefresh(
    refreshToken: string,
    expectedEpoch: number
  ): Promise<RefreshOutcome> {
    if (options.authMode.kind !== 'authenticated') {
      return Promise.resolve({
        ok: false,
        error: new ApiError({
          code: 'AUTH_REQUIRED',
          message: 'Authentication is not active.',
          retryable: false,
        }),
        retryable: false,
      });
    }

    if (pendingRefresh && pendingRefresh.epoch === expectedEpoch) {
      return pendingRefresh.promise;
    }

    const authGateway = options.authMode.authGateway;
    const promise: Promise<RefreshOutcome> = (async () => {
      try {
        const refreshed = await authGateway.refreshSession(refreshToken);
        if (sessionEpoch !== expectedEpoch) {
          return {
            ok: false,
            error: new ApiError({
              code: 'ABORTED',
              message: 'Session epoch changed during refresh.',
              retryable: false,
            }),
            retryable: false,
          };
        }

        let targetEpoch = expectedEpoch;
        if (currentSession && refreshed.user.id !== currentSession.user.id) {
          sessionEpoch += 1;
          targetEpoch = sessionEpoch;
          offlineCache.clear();
        }

        await persistSessionGuarded(refreshed, targetEpoch);
        if (sessionEpoch !== targetEpoch) {
          return {
            ok: false,
            error: new ApiError({
              code: 'ABORTED',
              message: 'Session signed out before refresh persisted.',
              retryable: false,
            }),
            retryable: false,
          };
        }

        currentSession = refreshed;
        commitSnapshot({
          status: 'authenticated',
          student: refreshed.user,
          error: null,
          canRetryRestore: false,
        });
        return { ok: true, session: refreshed };
      } catch (err) {
        return {
          ok: false,
          error: err,
          retryable: isApiError(err) && err.retryable,
        };
      }
    })();

    const tracker = { epoch: expectedEpoch, promise };
    pendingRefresh = tracker;
    return promise.finally(() => {
      if (pendingRefresh === tracker) {
        pendingRefresh = null;
      }
    });
  }

  function deferRestoreRetry(message: string): void {
    restoreSettled = false;
    commitSnapshot({
      status: 'signed_out',
      student: null,
      error: message,
      canRetryRestore: true,
    });
  }

  function asStorageClearError(err: unknown): ApiError {
    return isApiError(err) && err.code === 'STORAGE_CLEAR_FAILED'
      ? err
      : createStorageError('STORAGE_CLEAR_FAILED', err);
  }

  async function resetFailedRestore(): Promise<void> {
    sessionEpoch += 1;
    offlineCache.clear();
    try {
      await clearStorageSerialized();
      restoreSettled = true;
      commitSnapshot({
        status: 'signed_out',
        student: null,
        error: null,
        canRetryRestore: false,
      });
    } catch (err) {
      deferRestoreRetry(asStorageClearError(err).userMessage);
    }
  }

  async function restore(restoreOptions?: { readonly force?: boolean }): Promise<void> {
    if (options.authMode.kind !== 'authenticated') {
      return;
    }
    if (pendingRestore) {
      return pendingRestore;
    }
    if (restoreSettled && !restoreOptions?.force) {
      return;
    }

    const epochAtStart = sessionEpoch;

    if (restoreOptions?.force) {
      commitSnapshot({
        status: 'restoring',
        student: null,
        error: null,
        canRetryRestore: false,
      });
    }

    const task = (async () => {
      try {
        const stored = await readStorageSerialized();
        if (sessionEpoch !== epochAtStart) return;

        if (!stored) {
          restoreSettled = true;
          commitSnapshot({
            status: 'signed_out',
            student: null,
            error: null,
            canRetryRestore: false,
          });
          return;
        }

        const nowSec = Math.floor(nowMs() / 1000);
        if (stored.expiresAt > nowSec + REFRESH_LEEWAY_SECONDS) {
          currentSession = stored;
          restoreSettled = true;
          commitSnapshot({
            status: 'authenticated',
            student: stored.user,
            error: null,
            canRetryRestore: false,
          });
          return;
        }

        const outcome = await runSingleFlightRefresh(stored.refreshToken, epochAtStart);
        if (sessionEpoch !== epochAtStart) return;

        if (outcome.ok) {
          restoreSettled = true;
          return;
        }

        if (outcome.retryable && isApiError(outcome.error)) {
          // Transient startup refresh errors keep storage & cache intact for 1-tap retry.
          deferRestoreRetry(outcome.error.userMessage);
          return;
        }

        await resetFailedRestore();
      } catch (err) {
        if (sessionEpoch !== epochAtStart) return;
        if (isApiError(err) && err.retryable) {
          deferRestoreRetry(err.userMessage);
          return;
        }
        await resetFailedRestore();
      }
    })();

    pendingRestore = task;
    try {
      await task;
    } finally {
      if (pendingRestore === task) {
        pendingRestore = null;
      }
    }
  }

  async function signIn(email: string, password: string): Promise<void> {
    if (options.authMode.kind === 'misconfigured') {
      commitSnapshot({
        status: 'signed_out',
        student: null,
        error: options.authMode.error,
        canRetryRestore: false,
      });
      return;
    }
    if (options.authMode.kind === 'local_dev') {
      commitSnapshot({
        status: snapshot.status,
        student: snapshot.student,
        error: 'Supabase Auth chưa được cấu hình.',
        canRetryRestore: false,
      });
      return;
    }

    // Advance epoch immediately so an overlapping restore() failure cannot wipe or swallow signIn().
    sessionEpoch += 1;
    const epochAtStart = sessionEpoch;
    let expectedErrorEpoch = epochAtStart;
    commitSnapshot({
      status: snapshot.status,
      student: snapshot.student,
      error: null,
      canRetryRestore: snapshot.canRetryRestore,
    });

    try {
      const nextSession = await options.authMode.authGateway.signInWithPassword(
        email.trim(),
        password
      );
      if (sessionEpoch !== epochAtStart) {
        return;
      }
      sessionEpoch += 1;
      offlineCache.clear();
      const commitEpoch = sessionEpoch;
      expectedErrorEpoch = commitEpoch;
      await persistSessionGuarded(nextSession, commitEpoch);
      if (sessionEpoch !== commitEpoch) {
        return;
      }
      currentSession = nextSession;
      restoreSettled = true;
      commitSnapshot({
        status: 'authenticated',
        student: nextSession.user,
        error: null,
        canRetryRestore: false,
      });
    } catch (err) {
      if (sessionEpoch === expectedErrorEpoch) {
        const msg = isApiError(err)
          ? err.userMessage
          : 'Đăng nhập không thành công. Vui lòng thử lại.';
        commitSnapshot({
          status: snapshot.status,
          student: snapshot.student,
          error: msg,
          canRetryRestore: snapshot.canRetryRestore,
        });
      }
      throw err;
    }
  }

  async function signOut(): Promise<void> {
    sessionEpoch += 1;
    offlineCache.clear();

    if (options.authMode.kind === 'local_dev') {
      currentSession = null;
      restoreSettled = true;
      commitSnapshot({
        status: 'local_dev',
        student: null,
        error: null,
        canRetryRestore: false,
      });
      return;
    }

    if (options.authMode.kind === 'misconfigured') {
      currentSession = null;
      restoreSettled = true;
      commitSnapshot({
        status: 'signed_out',
        student: null,
        error: options.authMode.error,
        canRetryRestore: false,
      });
      return;
    }

    const signOutEpoch = sessionEpoch;
    const previousToken = currentSession?.accessToken;
    try {
      await clearStorageSerialized();
    } catch (err) {
      const clearErr = asStorageClearError(err);
      if (sessionEpoch === signOutEpoch) {
        commitSnapshot({
          status: currentSession ? 'authenticated' : snapshot.status,
          student: currentSession ? currentSession.user : snapshot.student,
          error: clearErr.userMessage,
          canRetryRestore: snapshot.canRetryRestore,
        });
      }
      throw clearErr;
    }

    if (sessionEpoch !== signOutEpoch) {
      return;
    }

    currentSession = null;
    restoreSettled = true;
    commitSnapshot({
      status: 'signed_out',
      student: null,
      error: null,
      canRetryRestore: false,
    });

    if (previousToken) {
      await options.authMode.authGateway.signOut(previousToken);
    }
  }

  async function requestJson<T>(
    path: string,
    parse: (raw: unknown) => T,
    config: {
      method?: HttpMethod;
      body?: unknown;
      signal?: AbortSignal;
      authenticated?: boolean;
      timeoutMs?: number;
      allowRetryOn401?: boolean;
    } = {}
  ): Promise<T> {
    if (!cleanBaseUrl) {
      throw new ApiError({
        code: 'CONFIG_MISSING',
        message: 'API base URL is not configured.',
        retryable: false,
        userMessage: 'Chưa cấu hình EXPO_PUBLIC_API_URL.',
      });
    }

    if (config.signal?.aborted) {
      throw createAbortedError();
    }

    const authenticated = config.authenticated ?? true;
    const allowRetry = config.allowRetryOn401 ?? authenticated;
    const startEpoch = sessionEpoch;

    function assertRequestActive() {
      if (config.signal?.aborted || (authenticated && sessionEpoch !== startEpoch)) {
        throw createAbortedError();
      }
    }

    async function sendOnce(tokenOverride?: string): Promise<HttpResponse> {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Request-ID': nextRequestId(),
      };
      if (config.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (authenticated) {
        const token = tokenOverride ?? currentSession?.accessToken;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      try {
        const res = await transport.send({
          url: `${cleanBaseUrl}${path}`,
          method: config.method ?? 'GET',
          headers,
          body: config.body,
          timeoutMs: config.timeoutMs ?? defaultTimeout,
          signal: config.signal,
        });
        assertRequestActive();
        return res;
      } catch (err) {
        assertRequestActive();
        throw isApiError(err) ? localizeTransportError(err, 'backend') : err;
      }
    }

    const sentToken = authenticated ? currentSession?.accessToken : undefined;
    let response = await sendOnce(sentToken);

    if (
      response.status === 401 &&
      allowRetry &&
      options.authMode.kind === 'authenticated' &&
      currentSession &&
      sessionEpoch === startEpoch
    ) {
      const activeRefreshToken = currentSession.refreshToken;
      let retryToken: string | null = null;

      if (currentSession.accessToken !== sentToken && !pendingRefresh) {
        retryToken = currentSession.accessToken;
      } else {
        const outcome = await runSingleFlightRefresh(activeRefreshToken, startEpoch);
        if (!outcome.ok) {
          if (outcome.retryable) {
            assertRequestActive();
            throw outcome.error;
          }
          if (config.signal?.aborted) {
            throw createAbortedError();
          }
          if (sessionEpoch === startEpoch) {
            await signOut();
          }
          throw normalizeHttpError(
            response.status,
            response.body.ok ? response.body.data : undefined,
            response.requestId
          );
        }
        assertRequestActive();
        retryToken = outcome.session.accessToken;
      }

      assertRequestActive();

      if (retryToken) {
        response = await sendOnce(retryToken);
      }
    }

    if (!response.ok) {
      throw normalizeHttpError(
        response.status,
        response.body.ok ? response.body.data : undefined,
        response.requestId
      );
    }

    if (!response.body.ok) {
      throw new ApiError({
        code: 'UNEXPECTED_RESPONSE',
        message: 'Invalid JSON response from server.',
        status: response.status,
        requestId: response.requestId,
        retryable: false,
        userMessage: 'Phản hồi từ máy chủ không hợp lệ.',
      });
    }

    return parse(response.body.data);
  }

  async function readWithFallback<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    readOptions?: FallbackReadOptions
  ): Promise<ReadResult<T>> {
    const allowFallback = readOptions?.allowOfflineFallback ?? true;
    const startScope = getCacheScope();

    try {
      const data = await fetcher();
      if (startScope && getCacheScope() === startScope) {
        offlineCache.set(`${startScope}::${cacheKey}`, {
          data,
          cachedAt: nowMs(),
        });
      }
      return { data, fromCache: false };
    } catch (err) {
      if (
        allowFallback &&
        isOfflineFallbackError(err) &&
        startScope &&
        getCacheScope() === startScope
      ) {
        const cached = offlineCache.get(`${startScope}::${cacheKey}`);
        if (cached) {
          return {
            data: cached.data as T,
            fromCache: true,
            cachedAt: cached.cachedAt,
            error: err,
          };
        }
      }
      throw err;
    }
  }

  const apiClient: CarentaApiClient = {
    checkHealth: (reqOptions) =>
      requestJson('/health', parseHealthResponse, {
        authenticated: false,
        allowRetryOn401: false,
        timeoutMs: HEALTH_TIMEOUT_MS,
        signal: reqOptions?.signal,
      }),
    getAuthMe: (reqOptions) =>
      requestJson('/api/v1/auth/me', parseAuthIdentity, { signal: reqOptions?.signal }),
    getBudgetSummary: (query, readOptions) => {
      const qs = buildQuery({ today: query?.today, days_remaining: query?.days_remaining });
      return readWithFallback(
        `budget:summary:${qs ? qs.slice(1) : 'default'}`,
        () =>
          requestJson(`/api/v1/budget/summary${qs}`, parseBudgetSummary, {
            signal: readOptions?.signal,
          }),
        readOptions
      );
    },
    configureBudget: (payload, reqOptions) =>
      requestJson('/api/v1/budget/config', parseBudgetConfigResponse, {
        method: 'POST',
        body: payload,
        signal: reqOptions?.signal,
      }),
    listTransactions: (query, readOptions) => {
      const qs = buildQuery({
        start_date: query?.start_date,
        end_date: query?.end_date,
        kind: query?.kind,
      });
      return readWithFallback(
        `transactions:list:${qs ? qs.slice(1) : 'default'}`,
        () =>
          requestJson(`/api/v1/transactions${qs}`, parseTransactionList, {
            signal: readOptions?.signal,
          }),
        readOptions
      );
    },
    createTransaction: (payload, reqOptions) =>
      requestJson('/api/v1/transactions', parseTransaction, {
        method: 'POST',
        body: payload,
        signal: reqOptions?.signal,
      }),
    getTransaction: (id, reqOptions) =>
      requestJson(`/api/v1/transactions/${encodeURIComponent(id)}`, parseTransaction, {
        signal: reqOptions?.signal,
      }),
    listGoals: (today, reqOptions) =>
      requestJson(`/api/v1/goals${buildQuery({ today })}`, parseGoalList, {
        signal: reqOptions?.signal,
      }),
    createGoal: (payload, today, reqOptions) =>
      requestJson(`/api/v1/goals${buildQuery({ today })}`, parseGoal, {
        method: 'POST',
        body: payload,
        signal: reqOptions?.signal,
      }),
    getActiveGoal: (today, readOptions) => {
      const qs = buildQuery({ today });
      return readWithFallback(
        `goal:active:${today || 'default'}`,
        () =>
          requestJson(`/api/v1/goal${qs}`, parseGoal, {
            signal: readOptions?.signal,
          }),
        readOptions
      );
    },
    setActiveGoal: (payload, today, reqOptions) =>
      requestJson(`/api/v1/goal${buildQuery({ today })}`, parseGoal, {
        method: 'POST',
        body: payload,
        signal: reqOptions?.signal,
      }),
    updateActiveGoal: (payload, today, reqOptions) =>
      requestJson(`/api/v1/goal${buildQuery({ today })}`, parseGoal, {
        method: 'PATCH',
        body: payload,
        signal: reqOptions?.signal,
      }),
    allocateToActiveGoal: (payload, today, reqOptions) =>
      requestJson(`/api/v1/goal/allocate${buildQuery({ today })}`, parseGoal, {
        method: 'POST',
        body: payload,
        signal: reqOptions?.signal,
      }),
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore,
    signIn,
    signOut,
    apiClient,
  };
}

export function createDefaultCarentaRuntime(env?: RawMobileEnv): CarentaRuntime {
  const resolved = resolveMobileConfig(env);
  const httpTransport = createFetchTransport();

  let authMode: RuntimeAuthMode;
  if (resolved.authMode.kind === 'supabase') {
    authMode = {
      kind: 'authenticated',
      storage: createSecureSessionStorage(),
      authGateway: createSupabaseAuthGateway({
        supabaseUrl: resolved.authMode.supabaseUrl,
        supabaseAnonKey: resolved.authMode.supabaseAnonKey,
        httpTransport,
      }),
    };
  } else if (resolved.authMode.kind === 'misconfigured') {
    authMode = { kind: 'misconfigured', error: resolved.authMode.error };
  } else {
    authMode = { kind: 'local_dev' };
  }

  return createCarentaRuntime({
    apiBaseUrl: resolved.apiBaseUrl,
    authMode,
    httpTransport,
  });
}
