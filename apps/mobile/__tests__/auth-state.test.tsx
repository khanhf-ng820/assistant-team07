import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import StatsScreen from '../app/(tabs)/index';
import { ApiError } from '../src/api/errors';
import { createFetchTransport } from '../src/api/transport';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import type { AuthGateway, AuthSession } from '../src/auth/types';
import { SignInGate } from '../src/components/SignInGate';
import { LedgerProvider } from '../src/context/LedgerContext';
import { createCarentaRuntime } from '../src/runtime/carentaRuntime';
import { createMemorySessionStorage } from './helpers/memorySessionStorage';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const sampleSummary = {
  cash: 1_200_000,
  total_income: 1_500_000,
  total_expense: 300_000,
  unpaid_commitments: 200_000,
  savings_allocated: 100_000,
  savings_reserved: 100_000,
  protected: 400_000,
  safe_to_spend: 800_000,
  funding_shortfall: 0,
  days_remaining: 10,
  daily_budget: 80_000,
  spent_today: 0,
  remaining_today: 80_000,
  is_overspent_today: false,
  overspent_amount_today: 0,
  subsequent_daily_budget: 80_000,
  is_period_exhausted: false,
  engine: 'deterministic_zero_llm_math',
};

function ProtectedProbe() {
  const { status, student, signOut, apiClient } = useAuth();
  if (status === 'restoring') {
    return <Text>Đang khôi phục phiên…</Text>;
  }
  if (status === 'signed_out') {
    return <SignInGate />;
  }
  return (
    <View>
      <Text testID="auth-status">{status}</Text>
      <Text testID="user-email">{student?.email ?? 'no-email'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gọi API"
        onPress={() => {
          void apiClient.getAuthMe().catch(() => {});
        }}
      >
        <Text>Gọi API</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đăng xuất"
        onPress={() => {
          void signOut();
        }}
      >
        <Text>Đăng xuất</Text>
      </Pressable>
    </View>
  );
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'student-1', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
    ...overrides,
  };
}

describe('AuthProvider and SignInGate', () => {
  it('enters local_dev synchronously without gating when Supabase is not configured', async () => {
    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: { kind: 'local_dev' },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('local_dev');
    expect(screen.queryByText('Đăng nhập CARENTA')).toBeNull();
  });

  it('shows SignInGate when configured with no persisted session and signs in cleanly', async () => {
    const storage = createMemorySessionStorage(null);
    const createdSession = makeSession();
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => createdSession),
      refreshSession: jest.fn(async () => createdSession),
      signOut: jest.fn(async () => {}),
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sv@hcmus.edu.vn');
    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'secret-pass');
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('sv@hcmus.edu.vn');
    await expect(storage.getSession()).resolves.toEqual(createdSession);
  });

  it('restores expired persisted session via refresh and wipes storage and cache on signOut', async () => {
    const expiredSession = makeSession({
      accessToken: 'old-token',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    const refreshedSession = makeSession({ accessToken: 'fresh-token' });
    const storage = createMemorySessionStorage(expiredSession);

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => refreshedSession),
      refreshSession: jest.fn(async () => refreshedSession),
      signOut: jest.fn(async () => {}),
    };

    let offline = false;
    const fetchMock = jest.fn(async () => {
      if (offline) throw new TypeError('Network unavailable');
      return jsonResponse(sampleSummary);
    });

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await expect(storage.getSession()).resolves.toEqual(refreshedSession);

    // Prime private Offline Fallback cache with live read, verify offline hit, then verify signOut wipes it
    await expect(runtime.apiClient.getBudgetSummary()).resolves.toMatchObject({ fromCache: false });
    offline = true;
    await expect(runtime.apiClient.getBudgetSummary()).resolves.toMatchObject({ fromCache: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await expect(storage.getSession()).resolves.toBeNull();
    await expect(runtime.apiClient.getBudgetSummary()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('offers 1-tap restore retry on SignInGate when startup refresh fails transiently', async () => {
    const expiredSession = makeSession({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const recoveredSession = makeSession({ accessToken: 'recovered-jwt' });
    const storage = createMemorySessionStorage(expiredSession);

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => recoveredSession),
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
        .mockResolvedValueOnce(recoveredSession),
      signOut: jest.fn(async () => {}),
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByText('Không thể kết nối dịch vụ đăng nhập.')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử khôi phục phiên' }));

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await expect(storage.getSession()).resolves.toEqual(recoveredSession);
  });

  it('clears storage and transitions to signed_out when non-retryable 401 refresh fails', async () => {
    const validSession = makeSession();
    const storage = createMemorySessionStorage(validSession);

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => validSession),
      refreshSession: jest.fn(async () => {
        throw new ApiError({
          code: 'AUTH_TOKEN_EXPIRED',
          status: 401,
          message: 'Refresh revoked',
          retryable: false,
        });
      }),
      signOut: jest.fn(async () => {}),
    };

    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Revoked', request_id: 'r1' } }, 401)
    );

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await fireEvent.press(screen.getByRole('button', { name: 'Gọi API' }));

    await waitFor(() => {
      expect(screen.getByText('Đăng nhập CARENTA')).toBeVisible();
    });
    await expect(storage.getSession()).resolves.toBeNull();
  });

  it('refuses silent local_dev on partial Supabase config and validates empty SignInGate submit', async () => {
    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'misconfigured', error: 'Thiếu ANON_KEY' },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(screen.getByText('Đăng nhập CARENTA')).toBeVisible();
    expect(screen.getByText('Thiếu ANON_KEY')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập đầy đủ email và mật khẩu.')).toBeVisible();
  });

  it('does not resurrect a signed-out session if signOut runs mid-401-refresh', async () => {
    const validSession = makeSession();
    const storage = createMemorySessionStorage(validSession);
    let resolveRefresh!: (s: AuthSession) => void;
    const refreshDeferred = new Promise<AuthSession>((resolve) => {
      resolveRefresh = resolve;
    });

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => validSession),
      refreshSession: jest.fn(() => refreshDeferred),
      signOut: jest.fn(async () => {}),
    };

    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } }, 401)
    );

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
      httpTransport: createFetchTransport({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await fireEvent.press(screen.getByRole('button', { name: 'Gọi API' }));
    await waitFor(() => {
      expect(authGateway.refreshSession).toHaveBeenCalledTimes(1);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    resolveRefresh(makeSession({ accessToken: 'late-token' }));

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await expect(storage.getSession()).resolves.toBeNull();
  });

  it('renders SessionStatusBar on StatsScreen in authenticated mode and signs out cleanly', async () => {
    const validSession = makeSession();
    const storage = createMemorySessionStorage(validSession);
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => validSession),
      refreshSession: jest.fn(async () => validSession),
      signOut: jest.fn(async () => {}),
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <LedgerProvider>
          <StatsScreen />
        </LedgerProvider>
      </AuthProvider>
    );

    expect(await screen.findByText('sv@hcmus.edu.vn')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    });
    expect(screen.queryByText('sv@hcmus.edu.vn')).toBeNull();
    await expect(storage.getSession()).resolves.toBeNull();
  });

  it('offers 1-tap restore retry on SignInGate when storage read fails natively', async () => {
    const validSession = makeSession();
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
      .mockResolvedValueOnce(validSession);

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: {
        kind: 'authenticated',
        storage: { getSession, setSession: jest.fn(async () => {}), clearSession },
        authGateway: {
          signInWithPassword: jest.fn(async () => validSession),
          refreshSession: jest.fn(async () => validSession),
          signOut: jest.fn(async () => {}),
        },
      },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(
      await screen.findByText('Không thể đọc phiên đăng nhập từ bộ nhớ bảo mật. Vui lòng thử lại.')
    ).toBeVisible();
    expect(clearSession).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Thử khôi phục phiên' }));
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
  });

  it('surfaces error in SessionStatusBar and keeps user signed in when signOut storage wipe fails until retry succeeds', async () => {
    const validSession = makeSession();
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

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: {
        kind: 'authenticated',
        storage: {
          getSession: jest.fn(async () => validSession),
          setSession: jest.fn(async () => {}),
          clearSession,
        },
        authGateway: {
          signInWithPassword: jest.fn(async () => validSession),
          refreshSession: jest.fn(async () => validSession),
          signOut: jest.fn(async () => {}),
        },
      },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <LedgerProvider>
          <StatsScreen />
        </LedgerProvider>
      </AuthProvider>
    );

    expect(await screen.findByText('sv@hcmus.edu.vn')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(
      await screen.findByText(
        'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.'
      )
    ).toBeVisible();
    expect(screen.getByText('sv@hcmus.edu.vn')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    });
  });

  it('surfaces localized STORAGE_WRITE_FAILED error on SignInGate when setSession fails during signIn', async () => {
    const baseStorage = createMemorySessionStorage(null);
    const createdSession = makeSession();
    const storage = {
      ...baseStorage,
      setSession: jest.fn(async () => {
        throw new ApiError({
          code: 'STORAGE_WRITE_FAILED',
          message: 'Keychain write blocked',
          retryable: true,
          userMessage: 'Không thể lưu phiên đăng nhập vào bộ nhớ bảo mật. Vui lòng thử lại.',
        });
      }),
    };
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => createdSession),
      refreshSession: jest.fn(async () => createdSession),
      signOut: jest.fn(async () => {}),
    };

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://example.test',
      authMode: { kind: 'authenticated', storage, authGateway },
    });

    await render(
      <AuthProvider runtime={runtime}>
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sv@hcmus.edu.vn');
    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'secret-pass');
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Không thể lưu phiên đăng nhập vào bộ nhớ bảo mật. Vui lòng thử lại.')
    ).toBeVisible();
    expect(screen.getByText('Đăng nhập CARENTA')).toBeVisible();
  });
});
