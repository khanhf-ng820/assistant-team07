import { createCarentaApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { createUserScopedReadCache } from '../src/api/readCache';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const sampleSummary = {
  cash: 1200000,
  total_income: 1500000,
  total_expense: 300000,
  unpaid_commitments: 200000,
  savings_allocated: 100000,
  savings_reserved: 100000,
  protected: 400000,
  safe_to_spend: 800000,
  funding_shortfall: 0,
  days_remaining: 10,
  daily_budget: 80000,
  spent_today: 0,
  remaining_today: 80000,
  is_overspent_today: false,
  overspent_amount_today: 0,
  subsequent_daily_budget: 80000,
  is_period_exhausted: false,
  engine: 'deterministic_zero_llm_math',
};

const sampleTxList = {
  items: [
    {
      id: 'tx-1',
      amount: 30000,
      kind: 'expense',
      category: 'food',
      date: '2026-11-21',
      note: 'Banh mi',
      created_at: '2026-11-21T01:00:00Z',
    },
  ],
  total: 1,
  total_income: 0,
  total_expense: 30000,
};

const sampleGoal = {
  id: 'goal-1',
  title: 'Hoc phi',
  target_amount: 3000000,
  deadline: '2026-12-25',
  allocated_amount: 1000000,
  remaining_target: 2000000,
  saving_days: 34,
  suggested_daily_saving: 58824,
  is_completed: false,
  created_at: '2026-11-01T00:00:00Z',
};

describe('User-scoped read-only Offline Fallback', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('caches fresh reads per Student Identity and serves cached data on NETWORK_UNAVAILABLE or TIMEOUT', async () => {
    const readCache = createUserScopedReadCache(() => 1_700_000_000_000);
    let currentUser: string | null = 'user-a';
    let offline = false;

    const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
      if (offline) throw new TypeError('Network unavailable');
      const target = String(url);
      if (target.includes('budget/summary')) return jsonResponse(sampleSummary);
      if (target.includes('transactions')) return jsonResponse(sampleTxList);
      return jsonResponse(sampleGoal);
    });

    const client = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      fetchImpl: fetchMock as unknown as typeof fetch,
      readCache,
      getCacheUserKey: () => currentUser,
    });

    const liveSummary = await client.getBudgetSummaryWithFallback();
    expect(liveSummary).toEqual({ data: sampleSummary, fromCache: false });
    await expect(client.listTransactionsWithFallback()).resolves.toEqual({ data: sampleTxList, fromCache: false });
    await expect(client.getActiveGoalWithFallback()).resolves.toEqual({ data: sampleGoal, fromCache: false });

    offline = true;
    const cachedSummary = await client.getBudgetSummaryWithFallback();
    expect(cachedSummary.fromCache).toBe(true);
    expect(cachedSummary.data).toEqual(sampleSummary);
    expect(cachedSummary.cachedAt).toBe(1_700_000_000_000);
    expect(cachedSummary.error).toBeInstanceOf(ApiError);
    expect(cachedSummary.error?.code).toBe('NETWORK_UNAVAILABLE');

    const cachedTxs = await client.listTransactionsWithFallback();
    expect(cachedTxs.fromCache).toBe(true);
    expect(cachedTxs.data).toEqual(sampleTxList);

    const cachedGoal = await client.getActiveGoalWithFallback();
    expect(cachedGoal.fromCache).toBe(true);
    expect(cachedGoal.data).toEqual(sampleGoal);

    // Switching users isolates cache: user-b MUST NOT see user-a snapshots
    currentUser = 'user-b';
    await expect(client.getBudgetSummaryWithFallback()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });

    // Switching back and clearing cache on sign-out removes stale snapshots
    currentUser = 'user-a';
    readCache.clearAll();
    await expect(client.getBudgetSummaryWithFallback()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('falls back on TIMEOUT, never falls back on 401/422, and never queues writes offline', async () => {
    jest.useFakeTimers();
    const readCache = createUserScopedReadCache(() => 1_700_000_000_500);
    readCache.set('user-a', 'budget:summary:default', sampleSummary);

    const timeoutClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      timeoutMs: 500,
      readCache,
      getCacheUserKey: () => 'user-a',
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        })) as unknown as typeof fetch,
    });

    const timeoutPromise = timeoutClient.getBudgetSummaryWithFallback();
    jest.advanceTimersByTime(500);
    const timeoutResult = await timeoutPromise;
    expect(timeoutResult.fromCache).toBe(true);
    expect(timeoutResult.error?.code).toBe('TIMEOUT');
    expect(timeoutResult.data).toEqual(sampleSummary);

    jest.useRealTimers();

    const authErrorClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      readCache,
      getCacheUserKey: () => 'user-a',
      fetchImpl: (async () =>
        jsonResponse({ error: { code: 'AUTH_REQUIRED', message: 'Auth required', request_id: 'r1' } }, 401)
      ) as unknown as typeof fetch,
    });
    await expect(authErrorClient.getBudgetSummaryWithFallback()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });

    const offlineWriteClient = createCarentaApiClient({
      baseUrl: 'http://192.168.1.10:8000',
      readCache,
      getCacheUserKey: () => 'user-a',
      fetchImpl: (async () => { throw new TypeError('Offline'); }) as unknown as typeof fetch,
    });
    await expect(
      offlineWriteClient.createTransaction({
        amount: 25000,
        kind: 'expense',
        category: 'food',
        date: '2026-11-21',
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });
  });
});
