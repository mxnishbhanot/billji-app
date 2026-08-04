import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase } from './connection';
import { wrapDatabaseError } from './errors';

/**
 * Device-local key/value state: theme, last tab, sync cursors. Never synced — these are
 * per-user-per-device, which is exactly why they are not in the `business` table.
 */

const connect = async (txn?: SQLiteDatabase) => txn ?? (await openDatabase());

export const getSetting = async (key: string, txn?: SQLiteDatabase): Promise<string | null> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read a setting', async () => {
    const db = await connect(txn);
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row?.value ?? null;
  });

export const setSetting = async (
  key: string,
  value: string,
  options: { txn?: SQLiteDatabase; now?: string } = {}
): Promise<void> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not write a setting', async () => {
    const db = await connect(options.txn);
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, options.now ?? new Date().toISOString()]
    );
  });

export const deleteSetting = async (key: string, txn?: SQLiteDatabase): Promise<boolean> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not delete a setting', async () => {
    const db = await connect(txn);
    const result = await db.runAsync('DELETE FROM settings WHERE key = ?', key);
    return result.changes > 0;
  });
