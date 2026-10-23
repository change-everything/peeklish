import { LIMITS } from '../shared/limits';
import { withStore } from './db';

export type CacheRow<T> = {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
};

type StoreName = 'analysisCache' | 'translationCache';

export async function cacheGet<T>(storeName: StoreName, key: string): Promise<T | null> {
  const row = (await withStore(storeName, 'readonly', (store) => store.get(key))) as CacheRow<T> | undefined;
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    await withStore(storeName, 'readwrite', (store) => store.delete(key));
    return null;
  }
  row.lastUsedAt = Date.now();
  await withStore(storeName, 'readwrite', (store) => store.put(row));
  return row.value;
}

export async function cacheSet<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  const now = Date.now();
  const row: CacheRow<T> = {
    key,
    value,
    createdAt: now,
    expiresAt: now + LIMITS.cacheTtlMs,
    lastUsedAt: now,
  };
  await withStore(storeName, 'readwrite', (store) => store.put(row));
  const count = await withStore(storeName, 'readonly', (store) => store.count());
  if (count > LIMITS.cacheCap) {
    const oldest = (await withStore(storeName, 'readonly', (store) => store.index('lastUsedAt').getAllKeys(undefined, 40))) as IDBValidKey[];
    for (const item of oldest) {
      await withStore(storeName, 'readwrite', (store) => store.delete(item));
    }
  }
}

export async function clearCaches(): Promise<void> {
  await withStore('analysisCache', 'readwrite', (store) => store.clear());
  await withStore('translationCache', 'readwrite', (store) => store.clear());
}
