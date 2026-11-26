import * as SecureStore from 'expo-secure-store';
import { ApiError } from '../src/api/errors';
import * as storageModule from '../src/auth/storage';
import { createSecureSessionStorage } from '../src/auth/storage';
import type { AuthSession } from '../src/auth/types';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const MANIFEST_KEY = 'carenta.auth.session.v2.manifest';
const LEGACY_KEY = 'carenta.auth.session.v1';

function chunkKey(gen: number, index: number): string {
  return `carenta.auth.session.v2.g${gen}.c${index}`;
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function makeBackingStore(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    return store.get(key) ?? null;
  });
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

const sampleSession: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1890000000,
  user: { id: 'student-1', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
};

describe('createSecureSessionStorage (iOS 2048-byte safe chunking)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('persists small AuthSession under 1800 UTF-8 bytes per key, reads, and clears cleanly', async () => {
    const store = makeBackingStore();
    const storage = createSecureSessionStorage();

    await storage.setSession(sampleSession);

    expect(store.has(MANIFEST_KEY)).toBe(true);
    expect(store.has(chunkKey(1, 0))).toBe(true);
    for (const val of store.values()) {
      expect(utf8Bytes(val)).toBeLessThanOrEqual(1800);
    }

    await expect(storage.getSession()).resolves.toEqual(sampleSession);

    await storage.clearSession();
    expect(store.size).toBe(0);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(chunkKey(1, 0));
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(LEGACY_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(MANIFEST_KEY);
    expect('createMemorySessionStorage' in storageModule).toBe(false);
  });

  it('splits oversized >4500-byte multi-byte Vietnamese & emoji AuthSessions without exceeding 1800 UTF-8 bytes per SecureStore value', async () => {
    const store = makeBackingStore({ [LEGACY_KEY]: JSON.stringify(sampleSession) });
    const storage = createSecureSessionStorage();
    const hugeToken = `header.${'Ng\u00e0y_chi_ti\u00eau_\u{1F3AF}\u{1F1FB}\u{1F1F3}_'.repeat(160)}.sig`;
    const oversized: AuthSession = {
      ...sampleSession,
      accessToken: hugeToken,
      refreshToken: `refresh-${'abc123_'.repeat(120)}`,
    };
    expect(utf8Bytes(JSON.stringify(oversized))).toBeGreaterThan(4500);

    await storage.setSession(oversized);

    const manifest1 = JSON.parse(store.get(MANIFEST_KEY)!);
    expect(manifest1.v).toBe(2);
    expect(manifest1.gen).toBe(1);
    expect(manifest1.chunks).toBeGreaterThanOrEqual(3);
    expect(store.has(LEGACY_KEY)).toBe(false);

    for (const [key, value] of store.entries()) {
      expect(utf8Bytes(value)).toBeLessThanOrEqual(1800);
      if (key.startsWith('carenta.auth.session.v2.g')) {
        expect(() => encodeURIComponent(value)).not.toThrow();
      }
    }

    await expect(storage.getSession()).resolves.toEqual(oversized);

    // Overwriting with a smaller session advances generation and sweeps previous generation chunks
    await storage.setSession(sampleSession);
    expect(JSON.parse(store.get(MANIFEST_KEY)!)).toEqual({ v: 2, gen: 2, chunks: 1 });
    expect(store.has(chunkKey(1, 0))).toBe(false);
    expect(store.has(chunkKey(1, 1))).toBe(false);
    expect(store.has(chunkKey(2, 0))).toBe(true);
    await expect(storage.getSession()).resolves.toEqual(sampleSession);
  });

  it('reads legacy carenta.auth.session.v1 when v2 manifest is absent and cleans corrupt legacy data', async () => {
    const store = makeBackingStore({ [LEGACY_KEY]: JSON.stringify(sampleSession) });
    const storage = createSecureSessionStorage();

    await expect(storage.getSession()).resolves.toEqual(sampleSession);

    store.set(LEGACY_KEY, '{broken-json');
    await expect(storage.getSession()).resolves.toBeNull();
    expect(store.has(LEGACY_KEY)).toBe(false);

    store.set(LEGACY_KEY, JSON.stringify({ accessToken: 'missing-user' }));
    await expect(storage.getSession()).resolves.toBeNull();
    expect(store.has(LEGACY_KEY)).toBe(false);
  });

  it('cleans up missing chunks or invalid v2 manifest cleanly without throwing', async () => {
    const store = makeBackingStore();
    const storage = createSecureSessionStorage();

    await storage.setSession({
      ...sampleSession,
      accessToken: 'tok-'.repeat(700),
    });
    expect(store.has(chunkKey(1, 1))).toBe(true);

    // Delete middle chunk to simulate partial truncation
    store.delete(chunkKey(1, 1));
    await expect(storage.getSession()).resolves.toBeNull();
    expect(store.has(MANIFEST_KEY)).toBe(false);
    expect(store.has(chunkKey(1, 0))).toBe(false);

    // Invalid manifest JSON
    store.set(MANIFEST_KEY, '{bad-manifest');
    await expect(storage.getSession()).resolves.toBeNull();
    expect(store.has(MANIFEST_KEY)).toBe(false);
  });

  it('throws retryable STORAGE_READ_FAILED without deleting on native SecureStore read error for manifest or chunk', async () => {
    makeBackingStore();
    const storage = createSecureSessionStorage();

    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Keychain locked'));
    await expect(storage.getSession()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'STORAGE_READ_FAILED',
      retryable: true,
    });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();

    // Manifest succeeds, chunk read fails -> still throws STORAGE_READ_FAILED without deleting
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify({ v: 2, gen: 1, chunks: 2 }))
      .mockResolvedValueOnce('{"accessToken":')
      .mockRejectedValueOnce(new Error('Chunk keychain locked'));
    await expect(storage.getSession()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'STORAGE_READ_FAILED',
      retryable: true,
    });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('preserves previous valid AuthSession if overwrite fails with STORAGE_WRITE_FAILED, and keeps retryable chunks if clearSession fails', async () => {
    const store = makeBackingStore();
    const storage = createSecureSessionStorage();
    const nextSession = { ...sampleSession, accessToken: 'tok-'.repeat(700) };

    await storage.setSession(sampleSession);
    expect(JSON.parse(store.get(MANIFEST_KEY)!)).toEqual({ v: 2, gen: 1, chunks: 1 });

    // Overwrite fails on 2nd generation's second chunk: prior v2 gen-1 session remains intact!
    (SecureStore.setItemAsync as jest.Mock)
      .mockImplementationOnce(async (k: string, v: string) => {
        store.set(k, v);
      })
      .mockRejectedValueOnce(new Error('Keychain write blocked'));

    await expect(storage.setSession(nextSession)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'STORAGE_WRITE_FAILED',
      retryable: true,
    });
    await expect(storage.getSession()).resolves.toEqual(sampleSession);

    // Clear failure while deleting chunk keeps manifest intact so retry wipes everything cleanly
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Keychain delete blocked')
    );
    await expect(storage.clearSession()).rejects.toBeInstanceOf(ApiError);
    expect(store.has(MANIFEST_KEY)).toBe(true);

    // Retry clearSession succeeds and wipes remaining entries
    await storage.clearSession();
    expect(store.size).toBe(0);
  });
});
