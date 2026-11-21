import { createCarentaApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';

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

const sampleBudgetSummary = {
  cash: 1500000,
  total_income: 2000000,
  total_expense: 500000,
  unpaid_commitments: 300000,
  savings_allocated: 200000,
  savings_reserved: 100000,
  protected: 600000,
  safe_to_spend: 900000,
  funding_shortfall: 0,
  days_remaining: 15,
  daily_budget: 60000,
  spent_today: 25000,
  remaining_today: 35000,
  is_overspent_today: false,
  overspent_amount_today: 0,
  subsequent_daily_budget: 62500,
  is_period_exhausted: false,
  engine: 'deterministic_zero_llm_math',
};

const sampleTransaction = {
  id: 'tx-1',
  amount: 35000,
  kind: 'expense',
  category: 'food',
  date: '2026-11-21',
  note: 'Com suon',
  created_at: '2026-11-21T05:00:00Z',
};

const sampleGoal = {
  id: 'goal-1',
  title: 'Laptop moi',
  target_amount: 2000000,
  deadline: '2026-12-21',
  allocated_amount: 1250000,
  remaining_target: 750000,
  saving_days: 30,
  suggested_daily_saving: 25000,
  is_completed: false,
  created_at: '2026-11-01T00:00:00Z',
};

describe('CARENTA SDK API client', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('attaches Bearer token and X-Request-ID and validates PR #60 financial contracts', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/health')) {
        expect(init?.headers).not.toEqual(expect.objectContaining({ Authorization: expect.any(String) }));
        return jsonResponse({ status: 'ok', service: 'carenta-api' });
      }
      if (target.endsWith('/api/v1/auth/me')) {
        return jsonResponse({ user_id: 'u-1', email: 'sv@hcmus.edu.vn', role: 'authenticated', auth_mode: 'supabase_jwt' });
      }
      if (target.includes('/api/v1/budget/summary')) {
        return jsonResponse(sampleBudgetSummary);
      }
      if (target.endsWith('/api/v1/budget/config')) {
        return jsonResponse({ status: 'ok', message: 'Budget parameters updated' });
      }
      if (target.includes('/api/v1/transactions?') || target.endsWith('/api/v1/transactions')) {
        if (init?.method === 'POST') return jsonResponse(sampleTransaction, 201);
        return jsonResponse({ items: [sampleTransaction], total: 1, total_income: 0, total_expense: 35000 });
      }
      if (target.endsWith('/api/v1/transactions/tx-1')) {
        return jsonResponse(sampleTransaction);
      }
      if (target.includes('/api/v1/goals')) {
        if (init?.method === 'POST') return jsonResponse(sampleGoal, 201);
        return jsonResponse([sampleGoal]);
      }
      if (target.includes('/api/v1/goal')) {
        return jsonResponse(sampleGoal, init?.method === 'POST' ? 201 : 200);
      }
      throw new Error(`Unexpected URL ${target}`);
    });

    const client = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000/',
      fetchImpl: fetchMock as unknown as typeof fetch,
      getAccessToken: () => 'jwt-abc',
      generateRequestId: () => 'req-fixed-1',
    });

    await expect(client.checkHealth()).resolves.toEqual({ status: 'ok', service: 'carenta-api' });
    await expect(client.getAuthMe()).resolves.toEqual({
      user_id: 'u-1', email: 'sv@hcmus.edu.vn', role: 'authenticated', auth_mode: 'supabase_jwt',
    });
    await expect(client.getBudgetSummary({ today: '2026-11-21', days_remaining: 15 })).resolves.toEqual(sampleBudgetSummary);
    await expect(client.configureBudget({ opening_balance: 500000 })).resolves.toEqual({
      status: 'ok', message: 'Budget parameters updated',
    });
    await expect(client.listTransactions({ kind: 'expense' })).resolves.toEqual({
      items: [sampleTransaction], total: 1, total_income: 0, total_expense: 35000,
    });
    await expect(client.createTransaction({
      amount: 35000, kind: 'expense', category: 'food', date: '2026-11-21', note: 'Com suon', idempotency_key: 'idem-12345678',
    })).resolves.toEqual(sampleTransaction);
    await expect(client.getTransaction('tx-1')).resolves.toEqual(sampleTransaction);
    await expect(client.listGoals()).resolves.toEqual([sampleGoal]);
    await expect(client.createGoal({
      title: 'Laptop moi', target_amount: 2000000, deadline: '2026-12-21', initial_allocated: 1250000,
    })).resolves.toEqual(sampleGoal);
    await expect(client.getActiveGoal()).resolves.toEqual(sampleGoal);
    await expect(client.setActiveGoal({
      title: 'Laptop moi', target_amount: 2000000, deadline: '2026-12-21', initial_allocated: 1250000,
    })).resolves.toEqual(sampleGoal);

    const authHeaderCalls = fetchMock.mock.calls.filter(([u]) => !String(u).endsWith('/health'));
    for (const [, init] of authHeaderCalls) {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer jwt-abc',
        'X-Request-ID': 'req-fixed-1',
        Accept: 'application/json',
      });
    }
  });

  it('normalizes structured CARENTA errors, FastAPI detail strings, and 422 validation arrays', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Session expired', request_id: 'srv-1' } },
          401,
          { 'X-Request-ID': 'srv-1' }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ detail: 'Transaction not found' }, 404, { 'X-Request-ID': 'srv-2' }))
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: [{ loc: ['body', 'amount'], msg: 'Input should be greater than 0' }] },
          422
        )
      );

    const client = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.getAuthMe()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Session expired',
      status: 401,
      requestId: 'srv-1',
      retryable: false,
      userMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    });

    await expect(client.getTransaction('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Transaction not found',
      status: 404,
      requestId: 'srv-2',
      retryable: false,
      userMessage: 'Không tìm thấy dữ liệu yêu cầu.',
    });

    await expect(client.createTransaction({
      amount: 0, kind: 'expense', category: 'food', date: '2026-11-21',
    })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      retryable: false,
      userMessage: 'Dữ liệu không hợp lệ (amount). Vui lòng kiểm tra lại.',
    });
  });

  it('rejects non-integer VND responses as UNEXPECTED_RESPONSE and enforces missing baseUrl', async () => {
    const missingClient = createCarentaApiClient({ baseUrl: undefined });
    await expect(missingClient.getAuthMe()).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
      retryable: false,
    });

    const badClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: (async () => jsonResponse({ ...sampleTransaction, amount: 35.5 })) as unknown as typeof fetch,
    });
    await expect(badClient.getTransaction('tx-1')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      retryable: false,
    });
  });

  it('maps network errors, timeouts, and caller cancellations distinctly', async () => {
    const offlineClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch,
    });
    await expect(offlineClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });

    jest.useFakeTimers();
    const slowClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      timeoutMs: 1000,
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        })) as unknown as typeof fetch,
    });
    const slowPromise = slowClient.getBudgetSummary();
    jest.advanceTimersByTime(1000);
    await expect(slowPromise).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });

    const callerController = new AbortController();
    callerController.abort();
    await expect(slowClient.getBudgetSummary(undefined, callerController.signal)).rejects.toMatchObject({
      code: 'ABORTED',
      retryable: false,
    });
  });

  it('deduplicates concurrent 401 refreshes (single-flight) and stops if refresh fails', async () => {
    let activeToken = 'expired-token';
    const onUnauthorized = jest.fn(async () => {
      activeToken = 'fresh-token';
      return 'fresh-token';
    });

    const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer fresh-token') {
        return jsonResponse(
          { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } },
          401
        );
      }
      if (String(_url).includes('budget/summary')) return jsonResponse(sampleBudgetSummary);
      return jsonResponse({ items: [sampleTransaction], total: 1, total_income: 0, total_expense: 35000 });
    });

    const client = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: fetchMock as unknown as typeof fetch,
      getAccessToken: () => activeToken,
      onUnauthorized,
    });

    const [summary, txs] = await Promise.all([
      client.getBudgetSummary(),
      client.listTransactions(),
    ]);

    expect(summary).toEqual(sampleBudgetSummary);
    expect(txs.items).toEqual([sampleTransaction]);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    const failingClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: (async () =>
        jsonResponse({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Bad token', request_id: 'r2' } }, 401)
      ) as unknown as typeof fetch,
      getAccessToken: () => 'bad-token',
      onUnauthorized: async () => null,
    });
    await expect(failingClient.getAuthMe()).rejects.toBeInstanceOf(ApiError);
  });
});
