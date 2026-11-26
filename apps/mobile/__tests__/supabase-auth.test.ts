import { ApiError } from '../src/api/errors';
import type { HttpResponse, HttpTransport } from '../src/api/transport';
import { createSupabaseAuthGateway } from '../src/auth/supabaseAuth';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe('createSupabaseAuthGateway', () => {
  const baseOptions = {
    supabaseUrl: 'https://proj.supabase.co/',
    supabaseAnonKey: 'anon-key-placeholder',
  };

  it('signs in with password and parses Supabase session tokens using injected clock', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://proj.supabase.co/auth/v1/token?grant_type=password');
      expect(init?.headers).toMatchObject({ apikey: 'anon-key-placeholder' });
      return jsonResponse({
        access_token: 'access-xyz',
        refresh_token: 'refresh-xyz',
        expires_in: 3600,
        user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
      });
    });

    const gateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
    });

    await expect(gateway.signInWithPassword('sv@hcmus.edu.vn', 'secret')).resolves.toEqual({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-xyz',
      expiresAt: 1_700_003_600,
      user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
    });
  });

  it('maps 400/401 credentials failure, auth-scoped network errors, and malformed responses cleanly', async () => {
    const badCredsGateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: (async () =>
        jsonResponse({ error_description: 'Invalid login credentials' }, 400)
      ) as unknown as typeof fetch,
    });
    await expect(badCredsGateway.signInWithPassword('a@b.com', 'wrong')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 400,
      retryable: false,
      userMessage: 'Email hoặc mật khẩu chưa đúng.',
    });

    const offlineGateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: (async () => {
        throw new TypeError('Network unavailable');
      }) as unknown as typeof fetch,
    });
    await expect(offlineGateway.signInWithPassword('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
      userMessage: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng và thử lại.',
    });

    const badJsonTransport: HttpTransport = {
      send: async (): Promise<HttpResponse> => ({
        ok: true,
        status: 200,
        body: { ok: false },
      }),
    };
    const malformedGateway = createSupabaseAuthGateway({
      ...baseOptions,
      httpTransport: badJsonTransport,
    });
    await expect(malformedGateway.signInWithPassword('a@b.com', 'pw')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      retryable: false,
    });
  });

  it('refreshes session tokens via shared HttpTransport, maps invalid refresh, and tolerates logout failures', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          ok: true,
          data: {
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 3600,
            user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
          },
        },
      } satisfies HttpResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: { ok: true, data: { msg: 'Invalid Refresh Token' } },
      } satisfies HttpResponse)
      .mockRejectedValueOnce(new ApiError({ code: 'NETWORK_UNAVAILABLE', message: 'Offline', retryable: true }));

    const gateway = createSupabaseAuthGateway({
      ...baseOptions,
      httpTransport: { send },
      now: () => 1_700_000_000_000,
    });

    const refreshed = await gateway.refreshSession('refresh-old');
    expect(refreshed.accessToken).toBe('access-new');
    expect(refreshed.refreshToken).toBe('refresh-new');
    expect(refreshed.expiresAt).toBe(1_700_003_600);

    await expect(gateway.refreshSession('revoked')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
      retryable: false,
    });

    await expect(gateway.signOut('access-new')).resolves.toBeUndefined();
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'https://proj.supabase.co/auth/v1/logout',
        parseJson: false,
      })
    );
  });

  it('maps auth request timeout to auth-scoped TIMEOUT error and 5xx refreshes as retryable', async () => {
    jest.useFakeTimers();
    const slowGateway = createSupabaseAuthGateway({
      ...baseOptions,
      timeoutMs: 500,
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        })) as unknown as typeof fetch,
    });

    const pending = slowGateway.refreshSession('refresh-1');
    jest.advanceTimersByTime(500);
    await expect(pending).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
      userMessage: 'Kết nối đăng nhập quá thời gian. Vui lòng thử lại.',
    });
    jest.useRealTimers();

    const transientGateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: (async () => jsonResponse({ msg: 'Supabase down' }, 503)) as unknown as typeof fetch,
    });
    await expect(transientGateway.refreshSession('refresh-1')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      status: 503,
      retryable: true,
    });
  });
});
