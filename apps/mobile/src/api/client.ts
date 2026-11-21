import {
  type AuthIdentity,
  type BudgetConfigRequest,
  type BudgetConfigResponse,
  type BudgetSummaryQuery,
  type BudgetSummaryResponse,
  type GoalCreate,
  type GoalResponse,
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
} from './contracts';
import { ApiError, normalizeHttpError } from './errors';
import type { ReadCache } from './readCache';

const DEFAULT_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;

export interface CachedRead<T> {
  data: T;
  fromCache: boolean;
  cachedAt?: number;
  error?: ApiError;
}

export interface CarentaApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  onUnauthorized?: () => Promise<string | null>;
  timeoutMs?: number;
  generateRequestId?: () => string;
  readCache?: ReadCache;
  getCacheUserKey?: () => string | null | undefined;
}

export interface CarentaApiClient {
  checkHealth: (signal?: AbortSignal) => Promise<HealthResponse>;
  getAuthMe: (signal?: AbortSignal) => Promise<AuthIdentity>;
  getBudgetSummary: (query?: BudgetSummaryQuery, signal?: AbortSignal) => Promise<BudgetSummaryResponse>;
  getBudgetSummaryWithFallback: (
    query?: BudgetSummaryQuery,
    signal?: AbortSignal
  ) => Promise<CachedRead<BudgetSummaryResponse>>;
  configureBudget: (payload: BudgetConfigRequest, signal?: AbortSignal) => Promise<BudgetConfigResponse>;
  listTransactions: (query?: TransactionListQuery, signal?: AbortSignal) => Promise<TransactionListResponse>;
  listTransactionsWithFallback: (
    query?: TransactionListQuery,
    signal?: AbortSignal
  ) => Promise<CachedRead<TransactionListResponse>>;
  createTransaction: (payload: TransactionCreate, signal?: AbortSignal) => Promise<TransactionResponse>;
  getTransaction: (id: string, signal?: AbortSignal) => Promise<TransactionResponse>;
  listGoals: (today?: string, signal?: AbortSignal) => Promise<GoalResponse[]>;
  createGoal: (payload: GoalCreate, today?: string, signal?: AbortSignal) => Promise<GoalResponse>;
  getActiveGoal: (today?: string, signal?: AbortSignal) => Promise<GoalResponse>;
  getActiveGoalWithFallback: (
    today?: string,
    signal?: AbortSignal
  ) => Promise<CachedRead<GoalResponse>>;
  setActiveGoal: (
    payload: GoalCreate,
    today?: string,
    signal?: AbortSignal
  ) => Promise<GoalResponse>;
}

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

async function parseJsonSafe(response: Response): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}

export function createCarentaApiClient(options: CarentaApiClientOptions): CarentaApiClient {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nextRequestId = options.generateRequestId ?? defaultRequestId;

  let pendingRefresh: Promise<string | null> | null = null;

  function triggerSingleFlightRefresh(): Promise<string | null> | null {
    if (!options.onUnauthorized) return null;
    if (!pendingRefresh) {
      pendingRefresh = options.onUnauthorized().finally(() => {
        pendingRefresh = null;
      });
    }
    return pendingRefresh;
  }

  async function requestJson<T>(
    path: string,
    parse: (raw: unknown) => T,
    config: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
      signal?: AbortSignal;
      authenticated?: boolean;
      timeoutMs?: number;
      allowRetryOn401?: boolean;
    } = {}
  ): Promise<T> {
    if (!options.baseUrl) {
      throw new ApiError({
        code: 'CONFIG_MISSING',
        message: 'API base URL is not configured.',
        retryable: false,
        userMessage: 'Chưa cấu hình EXPO_PUBLIC_API_URL.',
      });
    }

    if (config.signal?.aborted) {
      throw new ApiError({
        code: 'ABORTED',
        message: 'Request cancelled.',
        retryable: false,
      });
    }

    const authenticated = config.authenticated ?? true;
    const allowRetry = config.allowRetryOn401 ?? authenticated;

    async function sendOnce(tokenOverride?: string): Promise<Response> {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Request-ID': nextRequestId(),
      };
      if (config.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (authenticated) {
        const token = tokenOverride ?? options.getAccessToken?.();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.timeoutMs ?? defaultTimeout);

      const onCallerAbort = () => controller.abort();
      config.signal?.addEventListener('abort', onCallerAbort, { once: true });

      const cleanBase = options.baseUrl!.replace(/\/+$/, '');
      try {
        return await fetchFn(`${cleanBase}${path}`, {
          method: config.method ?? 'GET',
          headers,
          body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        if (timedOut) {
          throw new ApiError({
            code: 'TIMEOUT',
            message: 'Request timed out.',
            retryable: true,
            userMessage: 'Kết nối quá thời gian. Vui lòng thử lại.',
          });
        }
        if (config.signal?.aborted) {
          throw new ApiError({
            code: 'ABORTED',
            message: 'Request cancelled.',
            retryable: false,
          });
        }
        throw new ApiError({
          code: 'NETWORK_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Network unavailable.',
          retryable: true,
          userMessage: 'Không thể kết nối máy chủ. Kiểm tra mạng LAN và thử lại.',
        });
      } finally {
        clearTimeout(timer);
        config.signal?.removeEventListener('abort', onCallerAbort);
      }
    }

    const sentToken = authenticated ? options.getAccessToken?.() : undefined;
    let response = await sendOnce(sentToken ?? undefined);
    if (response.status === 401 && allowRetry && options.onUnauthorized) {
      const latestToken = options.getAccessToken?.();
      let retryToken: string | null = null;
      if (latestToken && latestToken !== sentToken && !pendingRefresh) {
        retryToken = latestToken;
      } else {
        const refreshPromise = triggerSingleFlightRefresh();
        retryToken = refreshPromise ? await refreshPromise : null;
      }
      if (config.signal?.aborted) {
        throw new ApiError({
          code: 'ABORTED',
          message: 'Request cancelled.',
          retryable: false,
        });
      }
      if (retryToken) {
        response = await sendOnce(retryToken);
      }
    }

    const headerRequestId = response.headers?.get?.('X-Request-ID') ?? undefined;
    const parsedBody = await parseJsonSafe(response);

    if (!response.ok) {
      throw normalizeHttpError(
        response.status,
        parsedBody.ok ? parsedBody.data : undefined,
        headerRequestId
      );
    }

    if (!parsedBody.ok) {
      throw new ApiError({
        code: 'UNEXPECTED_RESPONSE',
        message: 'Invalid JSON response from server.',
        status: response.status,
        requestId: headerRequestId,
        retryable: false,
        userMessage: 'Phản hồi từ máy chủ không hợp lệ.',
      });
    }

    return parse(parsedBody.data);
  }

  async function readWithFallback<T>(
    cacheKey: string,
    fetcher: () => Promise<T>
  ): Promise<CachedRead<T>> {
    const userKey = options.getCacheUserKey?.() ?? null;
    try {
      const data = await fetcher();
      const activeUserKey = options.getCacheUserKey?.() ?? null;
      if (options.readCache && userKey && activeUserKey === userKey) {
        options.readCache.set(userKey, cacheKey, data);
      }
      return { data, fromCache: false };
    } catch (err) {
      const offlineFailure =
        err instanceof ApiError &&
        (err.code === 'NETWORK_UNAVAILABLE' || err.code === 'TIMEOUT');
      if (offlineFailure && options.readCache && userKey) {
        const cached = options.readCache.get<T>(userKey, cacheKey);
        if (cached) {
          return {
            data: cached.data,
            fromCache: true,
            cachedAt: cached.cachedAt,
            error: err,
          };
        }
      }
      throw err;
    }
  }

  const getBudgetSummary = (query?: BudgetSummaryQuery, signal?: AbortSignal) =>
    requestJson(
      `/api/v1/budget/summary${buildQuery({
        today: query?.today,
        days_remaining: query?.days_remaining,
      })}`,
      parseBudgetSummary,
      { signal }
    );

  const listTransactions = (query?: TransactionListQuery, signal?: AbortSignal) =>
    requestJson(
      `/api/v1/transactions${buildQuery({
        start_date: query?.start_date,
        end_date: query?.end_date,
        kind: query?.kind,
      })}`,
      parseTransactionList,
      { signal }
    );

  const getActiveGoal = (today?: string, signal?: AbortSignal) =>
    requestJson(`/api/v1/goal${buildQuery({ today })}`, parseGoal, { signal });

  return {
    checkHealth: (signal) =>
      requestJson('/health', parseHealthResponse, {
        authenticated: false,
        allowRetryOn401: false,
        timeoutMs: HEALTH_TIMEOUT_MS,
        signal,
      }),
    getAuthMe: (signal) =>
      requestJson('/api/v1/auth/me', parseAuthIdentity, { signal }),
    getBudgetSummary,
    getBudgetSummaryWithFallback: (query, signal) => {
      const qs = buildQuery({ today: query?.today, days_remaining: query?.days_remaining });
      return readWithFallback(`budget:summary:${qs ? qs.slice(1) : 'default'}`, () =>
        getBudgetSummary(query, signal)
      );
    },
    configureBudget: (payload, signal) =>
      requestJson('/api/v1/budget/config', parseBudgetConfigResponse, {
        method: 'POST',
        body: payload,
        signal,
      }),
    listTransactions,
    listTransactionsWithFallback: (query, signal) => {
      const qs = buildQuery({
        start_date: query?.start_date,
        end_date: query?.end_date,
        kind: query?.kind,
      });
      return readWithFallback(`transactions:list:${qs ? qs.slice(1) : 'default'}`, () =>
        listTransactions(query, signal)
      );
    },
    createTransaction: (payload, signal) =>
      requestJson('/api/v1/transactions', parseTransaction, {
        method: 'POST',
        body: payload,
        signal,
      }),
    getTransaction: (id, signal) =>
      requestJson(`/api/v1/transactions/${encodeURIComponent(id)}`, parseTransaction, { signal }),
    listGoals: (today, signal) =>
      requestJson(`/api/v1/goals${buildQuery({ today })}`, parseGoalList, { signal }),
    createGoal: (payload, today, signal) =>
      requestJson(`/api/v1/goals${buildQuery({ today })}`, parseGoal, {
        method: 'POST',
        body: payload,
        signal,
      }),
    getActiveGoal,
    getActiveGoalWithFallback: (today, signal) =>
      readWithFallback(`goal:active:${today || 'default'}`, () => getActiveGoal(today, signal)),
    setActiveGoal: (payload, today, signal) =>
      requestJson(`/api/v1/goal${buildQuery({ today })}`, parseGoal, {
        method: 'POST',
        body: payload,
        signal,
      }),
  };
}
