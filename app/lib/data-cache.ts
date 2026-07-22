type CacheEntry<T> = { value: T; storedAt: number };

const root = globalThis as typeof globalThis & { __anxinDataCache?: Map<string, CacheEntry<unknown>> };
const cache = root.__anxinDataCache ??= new Map<string, CacheEntry<unknown>>();

export function storeCached<T>(key: string, value: T) {
  cache.set(key, { value, storedAt: Date.now() });
  return value;
}

export function readCached<T>(key: string, maxAgeMs: number) {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  const ageMs = Date.now() - entry.storedAt;
  if (ageMs > maxAgeMs) return undefined;
  return { value: entry.value, cachedAt: new Date(entry.storedAt).toISOString(), ageSeconds: Math.round(ageMs / 1000) };
}
