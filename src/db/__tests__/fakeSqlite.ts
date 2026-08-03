import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * A stand-in for the native driver. It does not execute SQL — SQLite executing CREATE TABLE
 * is not our code. What it does model is the behaviour the runner depends on: user_version
 * round-tripping, and an exclusive transaction that rolls its changes back when the task
 * throws.
 */
export type FakeDatabase = SQLiteDatabase & {
  userVersion: number;
  statements: string[];
  closed: boolean;
  failOn: (fragment: string | null) => void;
};

export const createFakeDatabase = (): FakeDatabase => {
  let failFragment: string | null = null;

  const db = {
    userVersion: 0,
    statements: [] as string[],
    closed: false,

    failOn(fragment: string | null) {
      failFragment = fragment;
    },

    async execAsync(source: string) {
      if (failFragment && source.includes(failFragment)) {
        throw new Error(`fake sqlite: refused "${source}"`);
      }
      db.statements.push(source);

      const versionWrite = /PRAGMA user_version\s*=\s*(\d+)/i.exec(source);
      if (versionWrite) db.userVersion = Number(versionWrite[1]);
    },

    async runAsync(source: string) {
      db.statements.push(source);
      return { lastInsertRowId: 0, changes: 0 };
    },

    async getFirstAsync(source: string) {
      if (/PRAGMA user_version/i.test(source)) return { user_version: db.userVersion };
      db.statements.push(source);
      return null;
    },

    async getAllAsync(source: string) {
      db.statements.push(source);
      return [];
    },

    async withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>) {
      const versionBefore = db.userVersion;
      const statementsBefore = db.statements.length;
      try {
        await task(db as unknown as SQLiteDatabase);
      } catch (error) {
        // Roll back, exactly as a real BEGIN EXCLUSIVE / ROLLBACK would.
        db.userVersion = versionBefore;
        db.statements.length = statementsBefore;
        throw error;
      }
    },

    async closeAsync() {
      db.closed = true;
    }
  };

  return db as unknown as FakeDatabase;
};
