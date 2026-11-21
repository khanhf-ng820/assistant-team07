export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export interface ReadCache {
  get: <T>(userKey: string, cacheKey: string) => CacheEntry<T> | undefined;
  set: <T>(userKey: string, cacheKey: string, data: T) => CacheEntry<T>;
  clearUser: (userKey: string) => void;
  clearAll: () => void;
}

export function createUserScopedReadCache(now: () => number = () => Date.now()): ReadCache {
  const entries = new Map<string, Map<string, CacheEntry<unknown>>>();

  return {
    get<T>(userKey: string, cacheKey: string): CacheEntry<T> | undefined {
      return entries.get(userKey)?.get(cacheKey) as CacheEntry<T> | undefined;
    },
    set<T>(userKey: string, cacheKey: string, data: T): CacheEntry<T> {
      let userBucket = entries.get(userKey);
      if (!userBucket) {
        userBucket = new Map<string, CacheEntry<unknown>>();
        entries.set(userKey, userBucket);
      }
      const entry: CacheEntry<T> = { data, cachedAt: now() };
      userBucket.set(cacheKey, entry);
      return entry;
    },
    clearUser(userKey: string): void {
      entries.delete(userKey);
    },
    clearAll(): void {
      entries.clear();
    },
  };
}
