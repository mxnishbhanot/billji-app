import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { QueryClient } from '@tanstack/react-query';
import { DATABASE_NAME, isDatabaseAvailable } from '@/db';
import { QUERY_CACHE_KEY } from '@/query/persistence';

/**
 * What the app is taking up on the device, and the one safe way to give some of it back.
 *
 * Two stores, deliberately not treated the same:
 *
 *  - the SQLite file is the *data* — it holds the outbox, so it is never cleared from here;
 *  - the persisted query cache is a copy of what the server already knows, so it can go at
 *    any time and cost nothing but a refetch.
 */

export type StorageUsage = {
  /** The SQLite file plus its WAL sidecars. */
  database: number;
  /** The persisted React Query cache. */
  cache: number;
  total: number;
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
};

const sizeOf = async (uri: string): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? info.size : 0;
  } catch {
    return 0;
  }
};

/** WAL means the live database is three files; reporting only the first one understates it. */
export const readDatabaseSize = async (): Promise<number> => {
  if (!isDatabaseAvailable() || !FileSystem.documentDirectory) return 0;
  const base = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
  const parts = await Promise.all([sizeOf(base), sizeOf(`${base}-wal`), sizeOf(`${base}-shm`)]);
  return parts.reduce((total, size) => total + size, 0);
};

export const readCacheSize = async (): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    return raw ? raw.length : 0;
  } catch {
    return 0;
  }
};

export const readStorageUsage = async (): Promise<StorageUsage> => {
  const [database, cache] = await Promise.all([readDatabaseSize(), readCacheSize()]);
  return { database, cache, total: database + cache };
};

/**
 * Drops the cached server responses, in memory and on disk. Local records and anything
 * queued for sync survive — those live in SQLite, which this deliberately does not touch.
 */
export const clearCachedData = async (queryClient: QueryClient): Promise<void> => {
  queryClient.clear();
  await AsyncStorage.removeItem(QUERY_CACHE_KEY);
};
