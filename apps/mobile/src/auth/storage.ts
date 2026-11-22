import * as SecureStore from 'expo-secure-store';
import type { AuthSession, SessionStorage } from './types';

const SESSION_KEY = 'carenta.auth.session.v1';

function isValidSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.accessToken !== 'string' || !obj.accessToken ||
    typeof obj.refreshToken !== 'string' || !obj.refreshToken ||
    typeof obj.expiresAt !== 'number' || !Number.isFinite(obj.expiresAt) ||
    !obj.user || typeof obj.user !== 'object'
  ) {
    return false;
  }
  const user = obj.user as Record<string, unknown>;
  return (
    typeof user.id === 'string' && Boolean(user.id) &&
    (user.email === null || typeof user.email === 'string') &&
    typeof user.role === 'string'
  );
}

export function createSecureSessionStorage(): SessionStorage {
  return {
    async getSession(): Promise<AuthSession | null> {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (isValidSession(parsed)) return parsed;
        await SecureStore.deleteItemAsync(SESSION_KEY);
        return null;
      } catch {
        try {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        } catch {
          // Ignore delete errors on corrupt storage cleanup.
        }
        return null;
      }
    },
    async setSession(session: AuthSession): Promise<void> {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    },
    async clearSession(): Promise<void> {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    },
  };
}
