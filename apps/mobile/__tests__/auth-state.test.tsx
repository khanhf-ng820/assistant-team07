import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, Pressable, View } from 'react-native';
import StatsScreen from '../app/(tabs)/index';
import { createUserScopedReadCache } from '../src/api/readCache';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { createMemorySessionStorage } from '../src/auth/storage';
import type { AuthGateway, AuthSession } from '../src/auth/types';
import { SignInGate } from '../src/components/SignInGate';

function ProtectedProbe() {
  const { status, session, signOut, apiClient } = useAuth();
  if (status === 'restoring') {
    return <Text>Đang khôi phục phiên…</Text>;
  }
  if (status === 'signed_out') {
    return <SignInGate />;
  }
  return (
    <View>
      <Text testID="auth-status">{status}</Text>
      <Text testID="user-email">{session?.user.email ?? 'no-email'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gọi API"
        onPress={() => {
          void apiClient.getAuthMe().catch(() => {});
        }}
      >
        <Text>Gọi API</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Đăng xuất" onPress={() => { void signOut(); }}>
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
    await render(
      <AuthProvider isConfigured={false} baseUrl="http://192.168.1.10:8000">
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

    await render(
      <AuthProvider isConfigured storage={storage} authGateway={authGateway} baseUrl="http://example.test">
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

  it('restores expired persisted session via refresh and wipes cache on signOut', async () => {
    const expiredSession = makeSession({
      accessToken: 'old-token',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    const refreshedSession = makeSession({ accessToken: 'fresh-token' });
    const storage = createMemorySessionStorage(expiredSession);
    const readCache = createUserScopedReadCache();
    readCache.set('student-1', 'budget:summary:default', { safe_to_spend: 100000 });

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => refreshedSession),
      refreshSession: jest.fn(async () => refreshedSession),
      signOut: jest.fn(async () => {}),
    };

    await render(
      <AuthProvider
        isConfigured
        storage={storage}
        authGateway={authGateway}
        readCache={readCache}
        baseUrl="http://example.test"
      >
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await expect(storage.getSession()).resolves.toEqual(refreshedSession);
    expect(readCache.get('student-1', 'budget:summary:default')).toBeDefined();

    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await expect(storage.getSession()).resolves.toBeNull();
    expect(readCache.get('student-1', 'budget:summary:default')).toBeUndefined();
  });

  it('clears storage and cache and transitions to signed_out when 401 refresh fails', async () => {
    const validSession = makeSession();
    const storage = createMemorySessionStorage(validSession);
    const readCache = createUserScopedReadCache();
    readCache.set('student-1', 'budget:summary:default', { safe_to_spend: 50000 });

    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => validSession),
      refreshSession: jest.fn(async () => {
        throw new Error('Refresh revoked');
      }),
      signOut: jest.fn(async () => {}),
    };

    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Revoked', request_id: 'r1' } }),
    })) as unknown as typeof fetch;

    await render(
      <AuthProvider
        isConfigured
        storage={storage}
        authGateway={authGateway}
        readCache={readCache}
        fetchImpl={fetchImpl}
        baseUrl="http://example.test"
      >
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await fireEvent.press(screen.getByRole('button', { name: 'Gọi API' }));

    await waitFor(() => {
      expect(screen.getByText('Đăng nhập CARENTA')).toBeVisible();
    });
    await expect(storage.getSession()).resolves.toBeNull();
    expect(readCache.get('student-1', 'budget:summary:default')).toBeUndefined();
  });

  it('refuses silent local_dev on partial Supabase config and validates empty SignInGate submit', async () => {
    await render(
      <AuthProvider isConfigured={false} isPartialConfig configError="Thiếu ANON_KEY" baseUrl="http://example.test">
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

    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired', request_id: 'r1' } }),
    })) as unknown as typeof fetch;

    await render(
      <AuthProvider isConfigured storage={storage} authGateway={authGateway} fetchImpl={fetchImpl} baseUrl="http://example.test">
        <ProtectedProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    await fireEvent.press(screen.getByRole('button', { name: 'Gọi API' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));

    resolveRefresh(makeSession({ accessToken: 'late-token' }));

    expect(await screen.findByText('Đăng nhập CARENTA')).toBeVisible();
    await expect(storage.getSession()).resolves.toBeNull();
  });

  it('renders SessionStatusBar on StatsScreen in authenticated mode and signs out cleanly', async () => {
    const validSession = makeSession();
    const storage = createMemorySessionStorage(validSession);
    const readCache = createUserScopedReadCache();
    readCache.set('student-1', 'budget:summary:default', { safe_to_spend: 100000 });
    const authGateway: AuthGateway = {
      signInWithPassword: jest.fn(async () => validSession),
      refreshSession: jest.fn(async () => validSession),
      signOut: jest.fn(async () => {}),
    };

    await render(
      <AuthProvider
        isConfigured
        storage={storage}
        authGateway={authGateway}
        readCache={readCache}
        baseUrl="http://example.test"
      >
        <StatsScreen />
      </AuthProvider>
    );

    expect(await screen.findByText('sv@hcmus.edu.vn')).toBeVisible();
    const logoutBtn = screen.getByRole('button', { name: 'Đăng xuất' });
    await fireEvent.press(logoutBtn);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    });
    expect(screen.queryByText('sv@hcmus.edu.vn')).toBeNull();
    await expect(storage.getSession()).resolves.toBeNull();
    expect(readCache.get('student-1', 'budget:summary:default')).toBeUndefined();
  });
});
