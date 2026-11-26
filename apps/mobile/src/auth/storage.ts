import * as SecureStore from 'expo-secure-store';
import { createStorageError } from '../api/errors';
import type { AuthSession, SessionStorage } from './types';

const LEGACY_SESSION_KEY = 'carenta.auth.session.v1';
const MANIFEST_KEY = 'carenta.auth.session.v2.manifest';
const MANIFEST_VERSION = 2;
// Stay well under iOS SecureStore's historic 2048-byte value limit per entry.
const MAX_CHUNK_BYTES = 1800;

interface SessionManifest {
  v: typeof MANIFEST_VERSION;
  gen: number;
  chunks: number;
}

function chunkKey(gen: number, index: number): string {
  return `carenta.auth.session.v2.g${gen}.c${index}`;
}

function utf8CharBytes(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

function splitIntoUtf8Chunks(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of value) {
    const chBytes = utf8CharBytes(ch);
    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }

  if (current.length > 0 || chunks.length === 0) {
    chunks.push(current);
  }
  return chunks;
}

function parseManifest(raw: string): SessionManifest | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (
      obj.v === MANIFEST_VERSION &&
      typeof obj.gen === 'number' &&
      Number.isInteger(obj.gen) &&
      obj.gen >= 1 &&
      typeof obj.chunks === 'number' &&
      Number.isInteger(obj.chunks) &&
      obj.chunks >= 1
    ) {
      return { v: MANIFEST_VERSION, gen: obj.gen, chunks: obj.chunks };
    }
  } catch {
    // Malformed manifest falls through as null.
  }
  return null;
}

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

function tryParseValidSession(raw: string): AuthSession | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function safeGetItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    throw createStorageError('STORAGE_READ_FAILED', err);
  }
}

async function readManifestForWrite(): Promise<SessionManifest | null> {
  try {
    const raw = await SecureStore.getItemAsync(MANIFEST_KEY);
    return raw ? parseManifest(raw) : null;
  } catch (err) {
    throw createStorageError('STORAGE_WRITE_FAILED', err);
  }
}

async function sweepOrphanedGenerationBestEffort(gen: number): Promise<void> {
  if (gen < 1) return;
  for (let i = 0; ; i += 1) {
    const key = chunkKey(gen, i);
    let exists = false;
    try {
      exists = (await SecureStore.getItemAsync(key)) !== null;
    } catch {
      return;
    }
    if (!exists) return;
    await safeDeleteBestEffort(key);
  }
}

async function safeDeleteBestEffort(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore delete errors during corrupt payload or stale-generation cleanup.
  }
}

async function cleanupGenerationBestEffort(manifest: SessionManifest): Promise<void> {
  for (let i = 0; i < manifest.chunks; i += 1) {
    await safeDeleteBestEffort(chunkKey(manifest.gen, i));
  }
  await safeDeleteBestEffort(MANIFEST_KEY);
}

export function createSecureSessionStorage(): SessionStorage {
  return {
    async getSession(): Promise<AuthSession | null> {
      const manifestRaw = await safeGetItem(MANIFEST_KEY);
      if (manifestRaw !== null) {
        const manifest = parseManifest(manifestRaw);
        if (!manifest) {
          await safeDeleteBestEffort(MANIFEST_KEY);
          return null;
        }

        const parts: string[] = [];
        for (let i = 0; i < manifest.chunks; i += 1) {
          const chunk = await safeGetItem(chunkKey(manifest.gen, i));
          if (chunk === null) {
            await cleanupGenerationBestEffort(manifest);
            return null;
          }
          parts.push(chunk);
        }

        const session = tryParseValidSession(parts.join(''));
        if (!session) {
          await cleanupGenerationBestEffort(manifest);
          return null;
        }
        return session;
      }

      const legacyRaw = await safeGetItem(LEGACY_SESSION_KEY);
      if (!legacyRaw) return null;

      const legacySession = tryParseValidSession(legacyRaw);
      if (!legacySession) {
        await safeDeleteBestEffort(LEGACY_SESSION_KEY);
        return null;
      }
      return legacySession;
    },

    async setSession(session: AuthSession): Promise<void> {
      const previous = await readManifestForWrite();
      const nextGen = (previous?.gen ?? 0) + 1;
      const chunks = splitIntoUtf8Chunks(JSON.stringify(session), MAX_CHUNK_BYTES);
      const nextManifest: SessionManifest = {
        v: MANIFEST_VERSION,
        gen: nextGen,
        chunks: chunks.length,
      };

      let writtenCount = 0;
      try {
        // Write generation-scoped chunks before updating manifest so a failed write never tears
        // an existing persisted session; roll back any uncommitted nextGen chunks on failure.
        for (let i = 0; i < chunks.length; i += 1) {
          await SecureStore.setItemAsync(chunkKey(nextGen, i), chunks[i]);
          writtenCount += 1;
        }
        await SecureStore.setItemAsync(MANIFEST_KEY, JSON.stringify(nextManifest));
      } catch (err) {
        for (let i = 0; i < writtenCount; i += 1) {
          await safeDeleteBestEffort(chunkKey(nextGen, i));
        }
        throw createStorageError('STORAGE_WRITE_FAILED', err);
      }

      if (previous) {
        for (let i = 0; i < previous.chunks; i += 1) {
          await safeDeleteBestEffort(chunkKey(previous.gen, i));
        }
        await sweepOrphanedGenerationBestEffort(previous.gen - 1);
      }
      await safeDeleteBestEffort(LEGACY_SESSION_KEY);
    },

    async clearSession(): Promise<void> {
      let manifestRaw: string | null;
      try {
        manifestRaw = await SecureStore.getItemAsync(MANIFEST_KEY);
      } catch (err) {
        throw createStorageError('STORAGE_CLEAR_FAILED', err);
      }

      const manifest = manifestRaw ? parseManifest(manifestRaw) : null;
      try {
        // Delete chunks & legacy entry before deleting manifest so retrying clearSession() after
        // a partial deletion failure never orphans chunks.
        if (manifest) {
          for (let i = 0; i < manifest.chunks; i += 1) {
            await SecureStore.deleteItemAsync(chunkKey(manifest.gen, i));
          }
        }
        await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
        await SecureStore.deleteItemAsync(MANIFEST_KEY);
      } catch (err) {
        throw createStorageError('STORAGE_CLEAR_FAILED', err);
      }
    },
  };
}
