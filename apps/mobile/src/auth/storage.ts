import * as SecureStore from 'expo-secure-store';
import { createStorageError } from '../api/errors';
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
      let raw: string | null;
      try {
        raw = await SecureStore.getItemAsync(SESSION_KEY);
      } catch (err) {
        throw createStorageError('STORAGE_READ_FAILED', err);
      }
      if (!raw) return null;

      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidSession(parsed)) return parsed;
      } catch {
        // Fall through to best-effort cleanup of corrupt persisted payload.
      }

      try {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } catch {
        // Ignore delete errors during corrupt storage cleanup.
      }
      return null;
    },
    async setSession(session: AuthSession): Promise<void> {
      try {
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
      } catch (err) {
        throw createStorageError('STORAGE_WRITE_FAILED', err);
      }
    },
    async clearSession(): Promise<void> {
      try {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } catch (err) {
        throw createStorageError('STORAGE_CLEAR_FAILED', err);
      }
    },
  };
}
