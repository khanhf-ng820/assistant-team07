import type { AuthSession, SessionStorage } from '../../src/auth/types';

export function createMemorySessionStorage(initial: AuthSession | null = null): SessionStorage {
  let current = initial;
  return {
    async getSession() {
      return current;
    },
    async setSession(session: AuthSession) {
      current = session;
    },
    async clearSession() {
      current = null;
    },
  };
}
