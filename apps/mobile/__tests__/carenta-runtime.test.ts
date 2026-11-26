import { ApiError } from '../src/api/errors';
import { createFetchTransport, type HttpTransport } from '../src/api/transport';
import type { AuthGateway, AuthSession, SessionStorage } from '../src/auth/types';
import { SUPABASE_PARTIAL_CONFIG_ERROR, resolveMobileConfig } from '../src/config';
import { createCarentaRuntime, createDefaultCarentaRuntime } from '../src/runtime/carentaRuntime';
import { createMemorySessionStorage } from './helpers/memorySessionStorage';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        const lower = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === lower) return v;
        }
        return null;
      },
    },
    json: async () => body,
  } as unknown as Response;
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'jwt-abc',
    refreshToken: 'refresh-1',
    expiresAt: Math.floor(1_700_003_600),
    user: { id: 'student-1', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
    ...overrides,
  };
}

const sampleBudgetSummary = {
  cash: 1_500_000,
  total_income: 2_000_000,
  total_expense: 500_000,
  unpaid_commitments: 300_000,
  savings_allocated: 200_000,
  savings_reserved: 100_000,
  protected: 600_000,
  safe_to_spend: 900_000,
  funding_shortfall: 0,
  days_remaining: 15,
  daily_budget: 60_000,
  spent_today: 25_000,
  remaining_today: 35_000,
  is_overspent_today: false,
  overspent_amount_today: 0,
  subsequent_daily_budget: 62_500,
  is_period_exhausted: false,
  engine: 'deterministic_zero_llm_math',
};

const sampleTransaction = {
  id: 'tx-1',
  amount: 35_000,
  kind: 'expense',
  category: 'food',
  date: '2026-11-21',
  note: 'Com suon',
  idempotency_key: 'idem-12345678',
  created_at: '2026-11-21T05:00:00Z',
};

const sampleTransactionList = {
  items: [sampleTransaction],
  total: 1,
  total_income: 0,
  total_expense: 35_000,
};

const sampleGoal = {
  id: 'goal-1',
  title: 'Laptop moi',
  target_amount: 2_000_000,
  deadline: '2026-12-21',
  allocated_amount: 1_250_000,
  remaining_target: 750_000,
  saving_days: 30,
  suggested_daily_saving: 25_000,
  status: 'on_track',
  is_completed: false,
  created_at: '2026-11-01T00:00:00Z',
};

describe('resolveMobileConfig', () => {
  it('resolves local_dev, partial_config refusal, and trimmed supabase config', () => {
    expect(resolveMobileConfig({})).toEqual({
      apiBaseUrl: undefined,
      isApiConfigured: false,
      authMode: { kind: 'local_dev' },
    });

    expect(
      resolveMobileConfig({ apiBaseUrl: 'http://192.168.1.10:8000///', supabaseUrl: 'https://proj.supabase.co/' })
    ).toEqual({
      apiBaseUrl: 'http://192.168.1.10:8000',
      isApiConfigured: true,
      authMode: { kind: 'misconfigured', error: SUPABASE_PARTIAL_CONFIG_ERROR },
    });

    expect(
      resolveMobileConfig({ apiBaseUrl: '   ', supabaseAnonKey: 'anon-only' }).authMode
    ).toEqual({ kind: 'misconfigured', error: SUPABASE_PARTIAL_CONFIG_ERROR });

    expect(
      resolveMobileConfig({
        apiBaseUrl: ' http://192.168.1.10:8000/ ',
        supabaseUrl: ' https://proj.supabase.co/ ',
        supabaseAnonKey: ' anon-123 ',
      })
    ).toEqual({
      apiBaseUrl: 'http://192.168.1.10:8000',
      isApiConfigured: true,
      authMode: {
        kind: 'supabase',
        supabaseUrl: 'https://proj.supabase.co',
        supabaseAnonKey: 'anon-123',
      },
    });
  });
});

describe('CarentaRuntime /health contract (replacing legacy health.ts tests)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests /health with normalized URL, zero Authorization header, and validates payload', async () => {
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toEqual(expect.objectContaining({ Authorization: expect.any(String) }));
      return jsonResponse({ status: 'ok', service: 'carenta-api' });
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000/',
      authMode: { kind: 'local_dev' },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
    });

    await expect(runtime.apiClient.checkHealth()).resolves.toEqual({
      status: 'ok',
      service: 'carenta-api',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:8000/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('rejects non-success HTTP status and unexpected /health payloads', async () => {
    const badStatusRuntime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'local_dev' },
      httpTransport: createFetchTransport({
        fetchImpl: (async () =>
          jsonResponse({ status: 'ok', service: 'carenta-api' }, 503)) as unknown as typeof fetch,
      }),
    });
    await expect(badStatusRuntime.apiClient.checkHealth()).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      status: 503,
      retryable: true,
    });

    const malformedPayloads = [
      null,
      [],
      {},
      { status: 'ok' },
      { status: 'error', service: 'carenta-api' },
      { status: 'ok', service: 'another-service' },
    ];
    for (const payload of malformedPayloads) {
      const badBodyRuntime = createCarentaRuntime({
        apiBaseUrl: 'http://example.test',
        authMode: { kind: 'local_dev' },
        httpTransport: createFetchTransport({
          fetchImpl: (async () => jsonResponse(payload)) as unknown as typeof fetch,
        }),
      });
      await expect(badBodyRuntime.apiClient.checkHealth()).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
        retryable: false,
      });
    }

    const badJsonRuntime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'local_dev' },
      httpTransport: createFetchTransport({
        fetchImpl: (async () => ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => {
            throw new SyntaxError('Invalid JSON');
          },
        })) as unknown as typeof fetch,
      }),
    });
    await expect(badJsonRuntime.apiClient.checkHealth()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      retryable: false,
    });
  });

  it('propagates caller abort and enforces 5s timeout on /health', async () => {
    jest.useFakeTimers();
    const hangTransport: HttpTransport = createFetchTransport({
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        })) as unknown as typeof fetch,
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'local_dev' },
      httpTransport: hangTransport,
    });

    const abortedController = new AbortController();
    abortedController.abort();
    await expect(
      runtime.apiClient.checkHealth({ signal: abortedController.signal })
    ).rejects.toMatchObject({ code: 'ABORTED', retryable: false });

    const timedOutProbe = runtime.apiClient.checkHealth();
    jest.advanceTimersByTime(5000);
    await expect(timedOutProbe).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});

describe('CarentaRuntime FastAPI contracts & error normalization', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('attaches Bearer token and X-Request-ID and validates all 11 PR #60 endpoints', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/health')) {
        return jsonResponse({ status: 'ok', service: 'carenta-api' });
      }
      if (target.endsWith('/api/v1/auth/me')) {
        return jsonResponse({
          user_id: 'student-1',
          email: 'sv@hcmus.edu.vn',
          role: 'authenticated',
          auth_mode: 'supabase_jwt',
        });
      }
      if (target.includes('/api/v1/budget/summary')) {
        return jsonResponse(sampleBudgetSummary);
      }
      if (target.endsWith('/api/v1/budget/config')) {
        return jsonResponse({ status: 'ok', message: 'Budget parameters updated' });
      }
      if (target.includes('/api/v1/transactions?') || target.endsWith('/api/v1/transactions')) {
        if (init?.method === 'POST') return jsonResponse(sampleTransaction, 201);
        return jsonResponse(sampleTransactionList);
      }
      if (target.endsWith('/api/v1/transactions/tx-1')) {
        return jsonResponse(sampleTransaction);
      }
      if (target.includes('/api/v1/goals')) {
        return jsonResponse(init?.method === 'POST' ? sampleGoal : [sampleGoal], init?.method === 'POST' ? 201 : 200);
      }
      if (target.includes('/api/v1/goal')) {
        return jsonResponse(sampleGoal, init?.method === 'POST' ? 201 : 200);
      }
      throw new Error(`Unexpected URL ${target}`);
    });

    const storage = createMemorySessionStorage(makeSession());
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => makeSession()),
      refreshSession: jest.fn(async () => makeSession()),
      signOut: jest.fn(async () => {}),
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000/',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
      generateRequestId: () => 'req-fixed-1',
    });

    await runtime.restore();

    await expect(runtime.apiClient.checkHealth()).resolves.toEqual({
      status: 'ok',
      service: 'carenta-api',
    });
    await expect(runtime.apiClient.getAuthMe()).resolves.toEqual({
      user_id: 'student-1',
      email: 'sv@hcmus.edu.vn',
      role: 'authenticated',
      auth_mode: 'supabase_jwt',
    });
    await expect(
      runtime.apiClient.getBudgetSummary({ today: '2026-11-21', days_remaining: 15 })
    ).resolves.toEqual({ data: sampleBudgetSummary, fromCache: false });
    await expect(runtime.apiClient.configureBudget({ opening_balance: 500_000 })).resolves.toEqual({
      status: 'ok',
      message: 'Budget parameters updated',
    });
    await expect(runtime.apiClient.listTransactions({ kind: 'expense' })).resolves.toEqual({
      data: sampleTransactionList,
      fromCache: false,
    });
    await expect(
      runtime.apiClient.createTransaction({
        amount: 35_000,
        kind: 'expense',
        category: 'food',
        date: '2026-11-21',
        note: 'Com suon',
        idempotency_key: 'idem-12345678',
      })
    ).resolves.toEqual(sampleTransaction);
    await expect(runtime.apiClient.getTransaction('tx-1')).resolves.toEqual(sampleTransaction);
    await expect(runtime.apiClient.listGoals()).resolves.toEqual([sampleGoal]);
    await expect(
      runtime.apiClient.createGoal({
        title: 'Laptop moi',
        target_amount: 2_000_000,
        deadline: '2026-12-21',
      })
    ).resolves.toEqual(sampleGoal);
    await expect(runtime.apiClient.getActiveGoal()).resolves.toEqual({
      data: sampleGoal,
      fromCache: false,
    });
    await expect(
      runtime.apiClient.setActiveGoal({
        title: 'Laptop moi',
        target_amount: 2_000_000,
        deadline: '2026-12-21',
      })
    ).resolves.toEqual(sampleGoal);
    await expect(
      runtime.apiClient.updateActiveGoal({ target_amount: 2_500_000 })
    ).resolves.toEqual(sampleGoal);
    await expect(
      runtime.apiClient.allocateToActiveGoal({ amount: 200_000 })
    ).resolves.toEqual(sampleGoal);

    const authHeaderCalls = fetchMock.mock.calls.filter(([u]) => !String(u).endsWith('/health'));
    for (const [, init] of authHeaderCalls) {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer jwt-abc',
        'X-Request-ID': 'req-fixed-1',
        Accept: 'application/json',
      });
    }
  });

  it('normalizes structured CARENTA errors, FastAPI details, 422 arrays, non-integer VND, and missing config', async () => {
    const missingRuntime = createCarentaRuntime({ authMode: { kind: 'local_dev' } });
    expect(missingRuntime.getSnapshot().isApiConfigured).toBe(false);
    await expect(missingRuntime.apiClient.getAuthMe()).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
      retryable: false,
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Session expired', request_id: 'srv-1' } },
          401,
          { 'X-Request-ID': 'srv-1' }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Transaction not found' }, 404, { 'X-Request-ID': 'srv-2' })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: [{ loc: ['body', 'amount'], msg: 'Input should be greater than 0' }] },
          422
        )
      )
      .mockResolvedValueOnce(jsonResponse({ ...sampleTransaction, amount: 35.5 }))
      .mockResolvedValueOnce(jsonResponse({ ...sampleGoal, status: 'bogus_status' }));

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'local_dev' },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
    });

    await expect(runtime.apiClient.getAuthMe()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
      requestId: 'srv-1',
      retryable: false,
      userMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    });

    await expect(runtime.apiClient.getTransaction('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Transaction not found',
      status: 404,
      requestId: 'srv-2',
      retryable: false,
    });

    await expect(
      runtime.apiClient.createTransaction({
        amount: 0,
        kind: 'expense',
        category: 'food',
        date: '2026-11-21',
        idempotency_key: 'idem-422',
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      retryable: false,
      userMessage: 'Dữ liệu không hợp lệ (amount). Vui lòng kiểm tra lại.',
    });

    await expect(runtime.apiClient.getTransaction('tx-1')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      retryable: false,
    });

    await expect(runtime.apiClient.getActiveGoal()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      retryable: false,
    });
  });
});

describe('CarentaRuntime Auth Session lifecycle, concurrency fencing, and Q3 refresh policy', () => {
  it('starts in local_dev or signed_out misconfigured synchronously and handles restore retry/wipe cleanly', async () => {
    const localRuntime = createCarentaRuntime({ authMode: { kind: 'local_dev' } });
    expect(localRuntime.getSnapshot()).toEqual({
      status: 'local_dev',
      student: null,
      error: null,
      isApiConfigured: false,
      canRetryRestore: false,
    });

    const misconfiguredRuntime = createCarentaRuntime({
      authMode: { kind: 'misconfigured', error: SUPABASE_PARTIAL_CONFIG_ERROR },
    });
    expect(misconfiguredRuntime.getSnapshot()).toEqual({
      status: 'signed_out',
      student: null,
      error: SUPABASE_PARTIAL_CONFIG_ERROR,
      isApiConfigured: false,
      canRetryRestore: false,
    });

    // Transient retryable startup refresh preserves storage and offers canRetryRestore
    const expired = makeSession({ expiresAt: 1_699_999_000 });
    const refreshed = makeSession({ accessToken: 'jwt-recovered' });
    const transientStorage = createMemorySessionStorage(expired);
    const flakyGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => refreshed),
      refreshSession: jest
        .fn()
        .mockRejectedValueOnce(
          new ApiError({
            code: 'NETWORK_UNAVAILABLE',
            message: 'Offline',
            retryable: true,
            userMessage: 'Không thể kết nối dịch vụ đăng nhập.',
          })
        )
        .mockResolvedValueOnce(refreshed),
      signOut: jest.fn(async () => {}),
    };

    const retryRuntime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage: transientStorage, authGateway: flakyGateway },
      now: () => 1_700_000_000_000,
    });

    expect(retryRuntime.getSnapshot().status).toBe('restoring');
    await retryRuntime.restore();
    expect(retryRuntime.getSnapshot()).toMatchObject({
      status: 'signed_out',
      student: null,
      error: 'Không thể kết nối dịch vụ đăng nhập.',
      canRetryRestore: true,
    });
    await expect(transientStorage.getSession()).resolves.toEqual(expired);

    // Retrying with force recovers the persisted Auth Session
    await retryRuntime.restore({ force: true });
    expect(retryRuntime.getSnapshot()).toMatchObject({
      status: 'authenticated',
      student: refreshed.user,
      error: null,
      canRetryRestore: false,
    });
    await expect(transientStorage.getSession()).resolves.toEqual(refreshed);

    // Non-retryable startup refresh wipes storage
    const permanentStorage = createMemorySessionStorage(expired);
    const revokedGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => refreshed),
      refreshSession: jest.fn(async () => {
        throw new ApiError({
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Revoked',
          status: 401,
          retryable: false,
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    const wipedRuntime = createCarentaRuntime({
      authMode: { kind: 'authenticated', storage: permanentStorage, authGateway: revokedGateway },
      now: () => 1_700_000_000_000,
    });
    await wipedRuntime.restore();
    expect(wipedRuntime.getSnapshot()).toMatchObject({
      status: 'signed_out',
      student: null,
      error: null,
      canRetryRestore: false,
    });
    await expect(permanentStorage.getSession()).resolves.toBeNull();
  });

  it('deduplicates concurrent 401 refreshes without emitting React re-render notifications for silent rotation', async () => {
    const initial = makeSession({ accessToken: 'jwt-stale' });
    const fresh = makeSession({ accessToken: 'jwt-fresh' });
    const storage = createMemorySessionStorage(initial);

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => fresh),
      refreshSession: jest.fn(async () => fresh),
      signOut: jest.fn(async () => {}),
    };

    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer jwt-fresh') {
        return jsonResponse(
          { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } },
          401
        );
      }
      return String(url).includes('budget/summary')
        ? jsonResponse(sampleBudgetSummary)
        : jsonResponse(sampleTransactionList);
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();
    const initialSnapshot = runtime.getSnapshot();
    const listener = jest.fn();
    const unsubscribe = runtime.subscribe(listener);

    const [summary, txs] = await Promise.all([
      runtime.apiClient.getBudgetSummary(),
      runtime.apiClient.listTransactions(),
    ]);

    expect(summary).toEqual({ data: sampleBudgetSummary, fromCache: false });
    expect(txs).toEqual({ data: sampleTransactionList, fromCache: false });
    expect(authGateway.refreshSession).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(runtime.getSnapshot()).toBe(initialSnapshot);
    await expect(storage.getSession()).resolves.toEqual(fresh);
    unsubscribe();
  });

  it('serializes storage writes so an in-flight refresh cannot resurrect SessionStorage after signOut', async () => {
    const initial = makeSession({ accessToken: 'jwt-stale' });
    const refreshed = makeSession({ accessToken: 'jwt-refreshed' });

    let persisted: AuthSession | null = initial;
    let releaseSet!: () => void;
    let markSetStarted!: () => void;
    const waitSetStarted = new Promise<void>((resolve) => {
      markSetStarted = resolve;
    });

    const slowStorage = {
      async getSession() {
        return persisted;
      },
      async setSession(session: AuthSession) {
        markSetStarted();
        await new Promise<void>((resolve) => {
          releaseSet = resolve;
        });
        persisted = session;
      },
      async clearSession() {
        persisted = null;
      },
    };

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => refreshed),
      refreshSession: jest.fn(async () => refreshed),
      signOut: jest.fn(async () => {}),
    };

    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } }, 401)
    );

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage: slowStorage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();

    const apiPromise = runtime.apiClient.getAuthMe().catch(() => null);
    await waitSetStarted;

    // signOut runs while refresh's storage.setSession is still in flight
    const signOutPromise = runtime.signOut();
    releaseSet();

    await signOutPromise;
    await apiPromise;

    expect(runtime.getSnapshot()).toMatchObject({ status: 'signed_out', student: null });
    expect(persisted).toBeNull();
  });

  it('preserves SessionStorage and Offline Fallback cache on retryable 401 refresh failure and wipes both only on non-retryable failure (Q3)', async () => {
    const valid = makeSession({ accessToken: 'jwt-old' });
    const transientStorage = createMemorySessionStorage(valid);
    const transientGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => valid),
      refreshSession: jest.fn(async () => {
        throw new ApiError({
          code: 'SERVER_ERROR',
          status: 503,
          message: 'Supabase down',
          retryable: true,
          userMessage: 'Dịch vụ xác thực đang bận, vui lòng thử lại sau.',
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    let transientMode: 'summary' | '401' | 'offline' = 'summary';
    const transientTransport = createFetchTransport({
      fetchImpl: (async () => {
        if (transientMode === 'offline') throw new TypeError('Network unavailable');
        if (transientMode === '401') {
          return jsonResponse(
            { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } },
            401
          );
        }
        return jsonResponse(sampleBudgetSummary);
      }) as unknown as typeof fetch,
    });

    const transientRuntime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage: transientStorage, authGateway: transientGateway },
      httpTransport: transientTransport,
      now: () => 1_700_000_000_000,
    });

    await transientRuntime.restore();
    await expect(transientRuntime.apiClient.getBudgetSummary()).resolves.toMatchObject({
      fromCache: false,
      data: sampleBudgetSummary,
    });

    transientMode = '401';
    await expect(transientRuntime.apiClient.getAuthMe()).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      retryable: true,
    });
    expect(transientRuntime.getSnapshot().status).toBe('authenticated');
    await expect(transientStorage.getSession()).resolves.toEqual(valid);

    transientMode = 'offline';
    await expect(transientRuntime.apiClient.getBudgetSummary()).resolves.toMatchObject({
      fromCache: true,
      data: sampleBudgetSummary,
    });

    // Non-retryable 401 refresh failure wipes storage + cache and signs out
    const permanentStorage = createMemorySessionStorage(valid);
    const permanentGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => valid),
      refreshSession: jest.fn(async () => {
        throw new ApiError({
          code: 'AUTH_TOKEN_EXPIRED',
          status: 401,
          message: 'Revoked',
          retryable: false,
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    let permanentMode: 'summary' | '401' | 'offline' = 'summary';
    const permanentTransport = createFetchTransport({
      fetchImpl: (async () => {
        if (permanentMode === 'offline') throw new TypeError('Network unavailable');
        if (permanentMode === '401') {
          return jsonResponse(
            { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } },
            401
          );
        }
        return jsonResponse(sampleBudgetSummary);
      }) as unknown as typeof fetch,
    });

    const permanentRuntime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage: permanentStorage, authGateway: permanentGateway },
      httpTransport: permanentTransport,
      now: () => 1_700_000_000_000,
    });

    await permanentRuntime.restore();
    await expect(permanentRuntime.apiClient.getBudgetSummary()).resolves.toMatchObject({
      fromCache: false,
      data: sampleBudgetSummary,
    });

    permanentMode = '401';
    await expect(permanentRuntime.apiClient.getAuthMe()).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });
    expect(permanentRuntime.getSnapshot()).toMatchObject({ status: 'signed_out', student: null });
    await expect(permanentStorage.getSession()).resolves.toBeNull();

    permanentMode = 'offline';
    await expect(permanentRuntime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('invalidates dead Auth Session in memory, signs out UI, wipes cache, and preserves AUTH_TOKEN_EXPIRED when revoked 401 refresh coincides with STORAGE_CLEAR_FAILED', async () => {
    const revokedSession = makeSession({ accessToken: 'revoked-jwt' });
    const storage: SessionStorage = {
      getSession: jest.fn(async () => revokedSession),
      setSession: jest.fn(async () => {}),
      clearSession: jest.fn(async () => {
        throw new ApiError({
          code: 'STORAGE_CLEAR_FAILED',
          message: 'Keychain delete failed',
          retryable: true,
          userMessage: 'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.',
        });
      }),
    };
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => revokedSession),
      refreshSession: jest.fn(async () => {
        throw new ApiError({
          code: 'AUTH_TOKEN_EXPIRED',
          status: 401,
          message: 'Refresh token revoked',
          retryable: false,
          userMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    let mode: 'summary' | '401' | 'offline' = 'summary';
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      if (mode === 'offline') throw new TypeError('Network unavailable');
      if (mode === '401') {
        return jsonResponse(
          { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'req-401' } },
          401
        );
      }
      return jsonResponse(sampleBudgetSummary);
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();
    await expect(runtime.apiClient.getBudgetSummary()).resolves.toMatchObject({
      fromCache: false,
      data: sampleBudgetSummary,
    });

    mode = '401';
    await expect(runtime.apiClient.getAuthMe()).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'signed_out',
      student: null,
      error: 'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.',
      canRetryRestore: false,
    });

    mode = 'offline';
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });

    mode = '401';
    await expect(runtime.apiClient.getAuthMe()).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });
    const lastHeaders = fetchMock.mock.calls.at(-1)?.[1]?.headers as Record<string, string> | undefined;
    expect(lastHeaders?.Authorization).toBeUndefined();
  });

  it('serializes restore reads behind pending signOut clearSession and protects explicit signIn against slower failed restore', async () => {
    // 1. FIFO storage read ordering: restore({ force: true }) must wait for signOut().clearSession()
    const ops: string[] = [];
    let persisted: AuthSession | null = makeSession();
    let releaseClear!: () => void;
    let markClearStarted!: () => void;
    const clearStarted = new Promise<void>((resolve) => {
      markClearStarted = resolve;
    });

    const fifoStorage = {
      async getSession() {
        ops.push('getSession');
        return persisted;
      },
      async setSession(session: AuthSession) {
        ops.push('setSession');
        persisted = session;
      },
      async clearSession() {
        ops.push('clearSession:start');
        markClearStarted();
        await new Promise<void>((resolve) => {
          releaseClear = resolve;
        });
        persisted = null;
        ops.push('clearSession:end');
      },
    };

    const fifoGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => makeSession({ accessToken: 'new-jwt' })),
      refreshSession: jest.fn(async () => makeSession({ accessToken: 'ref-jwt' })),
      signOut: jest.fn(async () => {}),
    };

    const fifoRuntime = createCarentaRuntime({
      authMode: { kind: 'authenticated', storage: fifoStorage, authGateway: fifoGateway },
      now: () => 1_700_000_000_000,
    });
    await fifoRuntime.restore();

    const pendingSignOut = fifoRuntime.signOut();
    await clearStarted;
    const pendingForceRestore = fifoRuntime.restore({ force: true });
    releaseClear();
    await Promise.all([pendingSignOut, pendingForceRestore]);

    expect(ops).toEqual(['getSession', 'clearSession:start', 'clearSession:end', 'getSession']);
    expect(fifoRuntime.getSnapshot()).toMatchObject({ status: 'signed_out', student: null });

    // 2. Concurrent non-retryable restore() failure must NOT wipe or swallow explicit signIn()
    const expired = makeSession({ expiresAt: 1_699_999_000 });
    const signedInSession = makeSession({ accessToken: 'explicit-jwt' });
    const raceStorage = createMemorySessionStorage(expired);
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    let rejectRestoreRefresh!: (err: Error) => void;
    const raceGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => signedInSession),
      refreshSession: jest.fn(() => {
        markRefreshStarted();
        return new Promise<AuthSession>((_resolve, reject) => {
          rejectRestoreRefresh = reject;
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    const raceRuntime = createCarentaRuntime({
      authMode: { kind: 'authenticated', storage: raceStorage, authGateway: raceGateway },
      now: () => 1_700_000_000_000,
    });

    const restorePromise = raceRuntime.restore();
    await refreshStarted;
    await raceRuntime.signIn('sv@hcmus.edu.vn', 'secret');
    rejectRestoreRefresh(
      new ApiError({ code: 'AUTH_TOKEN_EXPIRED', message: 'Revoked', status: 401, retryable: false })
    );
    await restorePromise;

    expect(raceRuntime.getSnapshot()).toMatchObject({
      status: 'authenticated',
      student: signedInSession.user,
      error: null,
    });
    await expect(raceStorage.getSession()).resolves.toEqual(signedInSession);
  });

  it('wires local_dev, misconfigured, and supabase branches cleanly in createDefaultCarentaRuntime', () => {
    const local = createDefaultCarentaRuntime({});
    expect(local.getSnapshot()).toEqual({
      status: 'local_dev',
      student: null,
      error: null,
      isApiConfigured: false,
      canRetryRestore: false,
    });

    const misconfigured = createDefaultCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      supabaseUrl: 'https://proj.supabase.co',
    });
    expect(misconfigured.getSnapshot()).toEqual({
      status: 'signed_out',
      student: null,
      error: SUPABASE_PARTIAL_CONFIG_ERROR,
      isApiConfigured: true,
      canRetryRestore: false,
    });

    const supabase = createDefaultCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      supabaseUrl: 'https://proj.supabase.co',
      supabaseAnonKey: 'anon-key',
    });
    expect(supabase.getSnapshot()).toEqual({
      status: 'restoring',
      student: null,
      error: null,
      isApiConfigured: true,
      canRetryRestore: false,
    });
  });

  it('preserves storage and offers canRetryRestore on STORAGE_READ_FAILED without deleting valid sessions', async () => {
    const valid = makeSession();
    const clearSession = jest.fn(async () => {});
    const getSession = jest
      .fn<Promise<AuthSession | null>, []>()
      .mockRejectedValueOnce(
        new ApiError({
          code: 'STORAGE_READ_FAILED',
          message: 'Keychain locked',
          retryable: true,
          userMessage: 'Không thể đọc phiên đăng nhập từ bộ nhớ bảo mật. Vui lòng thử lại.',
        })
      )
      .mockResolvedValueOnce(valid);

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: {
        kind: 'authenticated',
        storage: { getSession, setSession: jest.fn(async () => {}), clearSession },
        authGateway: {
          signInWithPassword: jest.fn(async () => valid),
          refreshSession: jest.fn(async () => valid),
          signOut: jest.fn(async () => {}),
        },
      },
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();
    expect(clearSession).not.toHaveBeenCalled();
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'signed_out',
      student: null,
      error: 'Không thể đọc phiên đăng nhập từ bộ nhớ bảo mật. Vui lòng thử lại.',
      canRetryRestore: true,
    });

    await runtime.restore({ force: true });
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'authenticated',
      student: valid.user,
      error: null,
      canRetryRestore: false,
    });
  });

  it('keeps authenticated status with error and wipes Offline Fallback cache when signOut storage wipe fails', async () => {
    const valid = makeSession();
    const clearSession = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(
        new ApiError({
          code: 'STORAGE_CLEAR_FAILED',
          message: 'Keychain busy',
          retryable: true,
          userMessage:
            'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.',
        })
      )
      .mockResolvedValueOnce(undefined);

    let offline = false;
    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: {
        kind: 'authenticated',
        storage: {
          getSession: jest.fn(async () => valid),
          setSession: jest.fn(async () => {}),
          clearSession,
        },
        authGateway: {
          signInWithPassword: jest.fn(async () => valid),
          refreshSession: jest.fn(async () => valid),
          signOut: jest.fn(async () => {}),
        },
      },
      httpTransport: createFetchTransport({
        fetchImpl: (async () => {
          if (offline) throw new TypeError('Offline');
          return jsonResponse(sampleBudgetSummary);
        }) as unknown as typeof fetch,
      }),
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();
    await expect(runtime.apiClient.getBudgetSummary()).resolves.toMatchObject({ fromCache: false });

    await expect(runtime.signOut()).rejects.toMatchObject({
      code: 'STORAGE_CLEAR_FAILED',
      retryable: true,
    });

    // Must NOT appear signed_out while persisted Auth Session still exists
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'authenticated',
      student: valid.user,
      error: 'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.',
    });

    // Offline Fallback cache was cleared synchronously even though storage deletion failed
    offline = true;
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });

    // Retrying signOut succeeds once storage wipe succeeds
    await runtime.signOut();
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'signed_out',
      student: null,
      error: null,
    });
  });
});

describe('CarentaRuntime private (Student Identity, sessionEpoch) Offline Fallback', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves Offline Fallback on NETWORK_UNAVAILABLE / TIMEOUT, enforces allowOfflineFallback, never queues writes, and isolates identities & epochs', async () => {
    const sessionA = makeSession({ accessToken: 'jwt-a1', user: { id: 'user-a', email: 'a@edu.vn', role: 'authenticated' } });
    const sessionB = makeSession({ accessToken: 'jwt-b1', user: { id: 'user-b', email: 'b@edu.vn', role: 'authenticated' } });
    const sessionA2 = makeSession({ accessToken: 'jwt-a2', user: { id: 'user-a', email: 'a@edu.vn', role: 'authenticated' } });

    const storage = createMemorySessionStorage(sessionA);
    let nextSignInSession = sessionB;
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => nextSignInSession),
      refreshSession: jest.fn(async () => sessionA),
      signOut: jest.fn(async () => {}),
    };

    let mode: 'ok' | 'offline' | '422' | 'hang' = 'ok';
    const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (mode === 'offline') return Promise.reject(new TypeError('Network unavailable'));
      if (mode === '422') {
        return Promise.resolve(
          jsonResponse({ detail: [{ loc: ['body', 'amount'], msg: 'Invalid' }] }, 422)
        );
      }
      if (mode === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        });
      }
      const target = String(url);
      if (target.includes('budget/summary')) return Promise.resolve(jsonResponse(sampleBudgetSummary));
      if (target.includes('transactions')) return Promise.resolve(jsonResponse(sampleTransactionList));
      return Promise.resolve(jsonResponse(sampleGoal));
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      timeoutMs: 500,
      now: () => 1_700_000_000_000,
    });

    await runtime.restore();

    // Prime all 3 cacheable read endpoints live
    await expect(runtime.apiClient.getBudgetSummary()).resolves.toEqual({
      data: sampleBudgetSummary,
      fromCache: false,
    });
    await expect(runtime.apiClient.listTransactions()).resolves.toEqual({
      data: sampleTransactionList,
      fromCache: false,
    });
    await expect(runtime.apiClient.getActiveGoal()).resolves.toEqual({
      data: sampleGoal,
      fromCache: false,
    });

    // NETWORK_UNAVAILABLE triggers ReadResult fromCache: true
    mode = 'offline';
    const cachedSummary = await runtime.apiClient.getBudgetSummary();
    expect(cachedSummary.fromCache).toBe(true);
    if (cachedSummary.fromCache) {
      expect(cachedSummary.cachedAt).toBe(1_700_000_000_000);
      expect(cachedSummary.error.code).toBe('NETWORK_UNAVAILABLE');
    }
    await expect(runtime.apiClient.listTransactions()).resolves.toMatchObject({
      fromCache: true,
      data: sampleTransactionList,
    });
    await expect(runtime.apiClient.getActiveGoal()).resolves.toMatchObject({
      fromCache: true,
      data: sampleGoal,
    });

    // allowOfflineFallback: false bypasses cache cleanly
    await expect(
      runtime.apiClient.getBudgetSummary(undefined, { allowOfflineFallback: false })
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });

    // Financial writes never queue offline
    await expect(
      runtime.apiClient.createTransaction({
        amount: 25_000,
        kind: 'expense',
        category: 'food',
        date: '2026-11-21',
        idempotency_key: 'idem-offline',
      })
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', retryable: true });

    // TIMEOUT also triggers Offline Fallback
    jest.useFakeTimers();
    mode = 'hang';
    const timeoutRead = runtime.apiClient.getBudgetSummary();
    jest.advanceTimersByTime(500);
    await expect(timeoutRead).resolves.toMatchObject({
      fromCache: true,
      data: sampleBudgetSummary,
      error: expect.objectContaining({ code: 'TIMEOUT' }),
    });
    jest.useRealTimers();

    // Validation / server-rejected reads never serve stale cache
    mode = '422';
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });

    // Switching users isolates cache: user-b does NOT see user-a snapshots
    await runtime.signOut();
    await runtime.signIn('b@edu.vn', 'pw');
    mode = 'offline';
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });

    // Switching back to user-a after signOut has zero leftover cache from prior session
    nextSignInSession = sessionA2;
    await runtime.signOut();
    await runtime.signIn('a@edu.vn', 'pw');
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  function createDeferredReadRuntime(initialSession: AuthSession, signInSession: AuthSession) {
    const storage = createMemorySessionStorage(initialSession);
    let resolvePending!: (res: Response) => void;
    let offline = false;

    const fetchMock = jest.fn(() => {
      if (offline) return Promise.reject(new TypeError('Offline'));
      return new Promise<Response>((resolve) => {
        resolvePending = resolve;
      });
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: {
        kind: 'authenticated',
        storage,
        authGateway: {
          signInWithPassword: jest.fn(async () => signInSession),
          refreshSession: jest.fn(async () => signInSession),
          signOut: jest.fn(async () => {}),
        },
      },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
    });

    return {
      runtime,
      resolvePending: (res: Response) => resolvePending(res),
      setOffline: (next: boolean) => {
        offline = next;
      },
    };
  }

  it('cancels slow GET from earlier epoch after sign-out/re-sign-in and blocks cache poisoning', async () => {
    const session1 = makeSession({ accessToken: 'jwt-1' });
    const session2 = makeSession({ accessToken: 'jwt-2' });
    const { runtime, resolvePending, setOffline } = createDeferredReadRuntime(session1, session2);

    await runtime.restore();

    const inflightRead = runtime.apiClient.getBudgetSummary();
    await runtime.signOut();
    await runtime.signIn('sv@hcmus.edu.vn', 'secret');

    resolvePending(jsonResponse(sampleBudgetSummary));
    await expect(inflightRead).rejects.toMatchObject({
      code: 'ABORTED',
      retryable: false,
    });

    setOffline(true);
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });
  });

  it('rejects stale Student A responses after switching to Student B before parsing and leaves unauthenticated checkHealth unaffected', async () => {
    const sessionA = makeSession({
      accessToken: 'jwt-a',
      user: { id: 'user-a', email: 'a@edu.vn', role: 'authenticated' },
    });
    const sessionB = makeSession({
      accessToken: 'jwt-b',
      user: { id: 'user-b', email: 'b@edu.vn', role: 'authenticated' },
    });
    const { runtime, resolvePending, setOffline } = createDeferredReadRuntime(sessionA, sessionB);

    await runtime.restore();

    // 1. Student A starts getBudgetSummary(), then switches to Student B before it resolves
    const inflightStudentA = runtime.apiClient.getBudgetSummary();
    await runtime.signOut();
    await runtime.signIn('b@edu.vn', 'secret');

    resolvePending(jsonResponse({ ...sampleBudgetSummary, cash: 9_999_999 }));
    await expect(inflightStudentA).rejects.toMatchObject({
      code: 'ABORTED',
      retryable: false,
    });

    // Offline cache must remain empty for Student B
    setOffline(true);
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });
    setOffline(false);

    // 2. Stale authenticated responses are rejected BEFORE schema parsing (not UNEXPECTED_RESPONSE)
    const inflightStudentB = runtime.apiClient.getAuthMe();
    await runtime.signOut();
    resolvePending(jsonResponse({ invalid: true }));
    await expect(inflightStudentB).rejects.toMatchObject({
      code: 'ABORTED',
      retryable: false,
    });

    // 3. Unauthenticated health probe stays unaffected by session changes
    const inflightHealth = runtime.apiClient.checkHealth();
    await runtime.signIn('b@edu.vn', 'secret');
    resolvePending(jsonResponse({ status: 'ok', service: 'carenta-api' }));
    await expect(inflightHealth).resolves.toEqual({ status: 'ok', service: 'carenta-api' });
  });
});
