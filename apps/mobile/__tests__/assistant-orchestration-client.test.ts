import { parseAssistantSnapshotResponse } from '../src/api/contracts';
import { ApiError } from '../src/api/errors';
import { type HttpTransport } from '../src/api/transport';
import type { AuthGateway, AuthSession } from '../src/auth/types';
import { createCarentaRuntime } from '../src/runtime/carentaRuntime';
import { createMemorySessionStorage } from './helpers/memorySessionStorage';

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'jwt-abc',
    refreshToken: 'refresh-1',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
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

const sampleTrigger = {
  id: 'trig-1',
  kind: 'habit_suggestion' as const,
  title: 'Gợi ý thói quen chi tiêu',
  message: 'AI phát hiện thói quen: Bạn có chi Trà sữa 30.000đ như thường lệ không?',
  action_target: 'open_habit_review' as const,
  local_date: '2026-11-28',
  amount_vnd: 30_000,
  habit_candidate: {
    id: 'hab-1',
    date: '2026-11-28',
    amount: 30_000,
    category: 'food',
    note: 'Trà sữa',
    confidence: 0.85,
    matching_days: 5,
  },
  created_at: '2026-11-28T07:35:00+07:00',
};

const sampleSnapshot = {
  budget_summary: sampleBudgetSummary,
  insight: {
    summary: 'Hôm nay đã chi 25.000đ, còn 35.000đ trong hạn mức ngày.',
    source: 'deterministic_fallback' as const,
    ledger_revision: 2,
    generated_at: '2026-11-28T08:00:00+07:00',
  },
  active_triggers: [sampleTrigger],
  habit_candidate: sampleTrigger.habit_candidate,
  ledger_revision: 2,
  evaluated_at: '2026-11-28T08:00:00+07:00',
};

function makeAuthGateway(): AuthGateway {
  return {
    signInWithPassword: async () => makeSession(),
    refreshSession: async () => makeSession(),
    signOut: async () => undefined,
  };
}

describe('Phase 3 assistant/scheduler contracts and runtime client', () => {
  it('rejects non-allowlisted ProactiveTrigger action targets', () => {
    const invalid = {
      ...sampleSnapshot,
      active_triggers: [{ ...sampleTrigger, action_target: 'delete_everything' }],
    };
    expect(() => parseAssistantSnapshotResponse(invalid)).toThrow(ApiError);
  });

  it('fetches Assistant Snapshot with Offline Fallback cleared on signOut', async () => {
    let failNetwork = false;
    const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
    const transport: HttpTransport = {
      send: async (req) => {
        requests.push({ url: req.url, method: req.method, headers: req.headers ?? {} });
        if (failNetwork) {
          throw new ApiError({
            code: 'NETWORK_UNAVAILABLE',
            message: 'Offline',
            retryable: true,
          });
        }
        return {
          ok: true,
          status: 200,
          requestId: 'req-1',
          body: { ok: true, data: sampleSnapshot },
        };
      },
    };

    const storage = createMemorySessionStorage(makeSession());
    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'authenticated', storage, authGateway: makeAuthGateway() },
      httpTransport: transport,
      now: () => 1_700_000_000_000,
      generateRequestId: () => 'mob-test-1',
    });
    await runtime.restore();

    const live = await runtime.apiClient.getAssistantSnapshot();
    expect(live.fromCache).toBe(false);
    expect(live.data.ledger_revision).toBe(2);
    expect(requests[0].headers.Authorization).toBe('Bearer jwt-abc');
    expect(requests[0].headers['X-Request-ID']).toBe('mob-test-1');

    failNetwork = true;
    const cached = await runtime.apiClient.getAssistantSnapshot();
    expect(cached.fromCache).toBe(true);
    expect(cached.data.active_triggers).toHaveLength(1);

    await runtime.signOut();
    await expect(runtime.apiClient.getAssistantSnapshot()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('never queues trigger dismissals or job runs offline and localizes TRIGGER_NOT_FOUND', async () => {
    let mode: 'ok' | 'not_found' | 'offline' = 'ok';
    const transport: HttpTransport = {
      send: async (req) => {
        if (mode === 'offline') {
          throw new ApiError({
            code: 'NETWORK_UNAVAILABLE',
            message: 'Offline',
            retryable: true,
          });
        }
        if (req.url.endsWith('/ready')) {
          return {
            ok: true,
            status: 200,
            requestId: 'req-ready',
            body: {
              ok: true,
              data: {
                status: 'ready',
                service: 'carenta-api',
                auth_mode: 'local_dev',
                scheduler_enabled: false,
                scheduler_running: false,
                insight_provider: 'deterministic_fallback',
                subsystems: { auth: 'local_dev', scheduler: 'disabled' },
              },
            },
          };
        }
        if (req.url.includes('/dismiss') && mode === 'not_found') {
          return {
            ok: false,
            status: 404,
            requestId: 'req-404',
            body: {
              ok: true,
              data: {
                error: {
                  code: 'TRIGGER_NOT_FOUND',
                  message: 'Proactive trigger not found.',
                  request_id: 'req-404',
                },
              },
            },
          };
        }
        if (req.url.includes('/dismiss')) {
          return {
            ok: true,
            status: 200,
            requestId: 'req-dis',
            body: {
              ok: true,
              data: {
                trigger_id: 'trig-1',
                status: 'dismissed',
                cooldown_until: '2026-12-05',
              },
            },
          };
        }
        return {
          ok: true,
          status: 200,
          requestId: 'req-job',
          body: {
            ok: true,
            data: {
              job_name: 'evening_reminder',
              local_date: '2026-11-28',
              status: 'executed',
              triggers_emitted: 1,
              owners_evaluated: 1,
              executed_at: '2026-11-28T20:05:00+07:00',
            },
          },
        };
      },
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'local_dev' },
      httpTransport: transport,
    });

    const readiness = await runtime.apiClient.checkReadiness();
    expect(readiness.status).toBe('ready');

    const dismissed = await runtime.apiClient.dismissProactiveTrigger('trig-1');
    expect(dismissed.cooldown_until).toBe('2026-12-05');

    const jobRun = await runtime.apiClient.runAssistantJob('evening_reminder');
    expect(jobRun.triggers_emitted).toBe(1);

    mode = 'not_found';
    await expect(runtime.apiClient.dismissProactiveTrigger('missing')).rejects.toMatchObject({
      code: 'TRIGGER_NOT_FOUND',
      userMessage: 'Không tìm thấy gợi ý hoặc cảnh báo này.',
    });

    mode = 'offline';
    await expect(runtime.apiClient.dismissProactiveTrigger('trig-1')).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
    await expect(runtime.apiClient.runAssistantJob('evening_reminder')).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });
});
