import { ApiError } from '../src/api/errors';
import { createSupabaseAuthGateway } from '../src/auth/supabaseAuth';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('createSupabaseAuthGateway', () => {
  const baseOptions = {
    supabaseUrl: 'https://proj.supabase.co/',
    supabaseAnonKey: 'anon-key-placeholder',
  };

  it('signs in with password and parses Supabase session tokens', async () => {
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://proj.supabase.co/auth/v1/token?grant_type=password');
      expect(init?.headers).toMatchObject({ apikey: 'anon-key-placeholder' });
      return jsonResponse({
        access_token: 'access-xyz',
        refresh_token: 'refresh-xyz',
        expires_at: 1890000000,
        user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
      });
    });

    const gateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(gateway.signInWithPassword('sv@hcmus.edu.vn', 'secret')).resolves.toEqual({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-xyz',
      expiresAt: 1890000000,
      user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
    });
  });

  it('maps 400/401 credentials failure and network failure cleanly', async () => {
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
    });
  });

  it('refreshes session tokens, maps invalid refresh to AUTH_TOKEN_EXPIRED, and tolerates logout network errors', async () => {
    const refreshMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 3600,
          user: { id: 'student-42', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ msg: 'Invalid Refresh Token' }, 401))
      .mockRejectedValueOnce(new TypeError('Offline during signOut'));

    const gateway = createSupabaseAuthGateway({
      ...baseOptions,
      fetchImpl: refreshMock as unknown as typeof fetch,
    });

    const refreshed = await gateway.refreshSession('refresh-old');
    expect(refreshed.accessToken).toBe('access-new');
    expect(refreshed.refreshToken).toBe('refresh-new');
    expect(refreshed.user.id).toBe('student-42');

    await expect(gateway.refreshSession('revoked')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });

    await expect(gateway.signOut('access-new')).resolves.toBeUndefined();
  });

  it('aborts hung auth requests on timeout and maps transient 5xx refreshes as retryable', async () => {
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
