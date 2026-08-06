import { Platform } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';
import { closeDatabase, DATABASE_NAME, isDatabaseAvailable, openDatabase, resetDatabase } from '../connection';
import { DatabaseError, isDatabaseUnavailable } from '../errors';
import { withTransaction } from '../transaction';
import type { Migration } from '../migrations';
import { createFakeDatabase, type FakeDatabase } from './fakeSqlite';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(async () => undefined)
}));

jest.mock('@/store/sessionStorage', () => ({
  sessionStorage: {
    getItemAsync: jest.fn(async () => 'test-encryption-key'),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined)
  }
}));

const mockOpen = openDatabaseAsync as jest.MockedFunction<typeof openDatabaseAsync>;
const mockDelete = deleteDatabaseAsync as jest.MockedFunction<typeof deleteDatabaseAsync>;

const migration = (version: number): Migration => ({
  version,
  name: `m${version}`,
  up: async (db) => {
    await db.execAsync(`CREATE TABLE t${version} (id TEXT)`);
  }
});

let fake: FakeDatabase;

beforeEach(async () => {
  await closeDatabase();
  jest.clearAllMocks();
  fake = createFakeDatabase();
  mockOpen.mockResolvedValue(fake as never);
});

afterEach(async () => {
  await closeDatabase();
});

describe('openDatabase', () => {
  it('opens the file once and hands the same connection to every caller', async () => {
    const [first, second] = await Promise.all([openDatabase([]), openDatabase([])]);

    expect(first).toBe(second);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(DATABASE_NAME);
  });

  it('sets WAL and foreign keys before any migration runs', async () => {
    await openDatabase([migration(1)]);

    expect(fake.statements[0]).toMatch(/^PRAGMA key = '/);
    expect(fake.statements).toEqual(
      expect.arrayContaining(['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON'])
    );
    // Both pragmas are invalid inside a transaction, so they must precede the schema work.
    expect(fake.statements.indexOf('PRAGMA foreign_keys = ON')).toBeLessThan(
      fake.statements.indexOf('CREATE TABLE t1 (id TEXT)')
    );
  });

  it('migrates exactly once even when two callers race the first open', async () => {
    await Promise.all([openDatabase([migration(1)]), openDatabase([migration(1)])]);

    expect(fake.statements.filter((sql) => sql === 'CREATE TABLE t1 (id TEXT)')).toHaveLength(1);
    expect(fake.userVersion).toBe(1);
  });

  it('does not cache a failed open, so the next attempt can succeed', async () => {
    mockOpen.mockRejectedValueOnce(new Error('database is locked'));

    const error = await openDatabase([]).catch((thrown: unknown) => thrown);
    expect((error as DatabaseError).code).toBe('DB_OPEN_FAILED');
    expect((error as DatabaseError).message).toMatch(/database is locked/);

    mockOpen.mockResolvedValue(fake as never);
    await expect(openDatabase([])).resolves.toBe(fake);
  });

  it('surfaces a migration failure as DB_MIGRATION_FAILED and stays closed', async () => {
    const broken: Migration = {
      version: 1,
      name: 'broken',
      up: async () => {
        throw new Error('syntax error');
      }
    };

    const error = await openDatabase([broken]).catch((thrown: unknown) => thrown);

    expect((error as DatabaseError).code).toBe('DB_MIGRATION_FAILED');
    // Not cached: a transient failure must not disable the store for the whole session.
    mockOpen.mockResolvedValue(fake as never);
    await expect(openDatabase([])).resolves.toBe(fake);
  });

  it('wipes and rebuilds a file that opens but will not migrate', async () => {
    let attempt = 0;
    const wedged: Migration = {
      version: 1,
      name: 'wedged',
      up: async (db) => {
        attempt += 1;
        // The device symptom: "file is not a database" until the file is deleted.
        if (attempt === 1) throw new Error('file is not a database');
        await db.execAsync('CREATE TABLE t1 (id TEXT)');
      }
    };

    await expect(openDatabase([wedged])).resolves.toBe(fake);
    expect(mockDelete).toHaveBeenCalledWith(DATABASE_NAME);
    expect(fake.statements).toContain('CREATE TABLE t1 (id TEXT)');
  });
});

describe('platform availability', () => {
  it('reports unavailable on web and never touches the driver', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });

    try {
      expect(isDatabaseAvailable()).toBe(false);

      const error = await openDatabase([]).catch((thrown: unknown) => thrown);
      expect(isDatabaseUnavailable(error)).toBe(true);
      expect(mockOpen).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});

describe('closeDatabase and resetDatabase', () => {
  it('closes the connection and re-opens on the next call', async () => {
    await openDatabase([]);
    await closeDatabase();

    expect(fake.closed).toBe(true);

    await openDatabase([]);
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });

  it('is safe to close when nothing was ever opened', async () => {
    await expect(closeDatabase()).resolves.toBeUndefined();
  });

  it('deletes the file so two businesses never share one database', async () => {
    await openDatabase([]);
    await resetDatabase();

    expect(fake.closed).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(DATABASE_NAME);
  });
});

describe('withTransaction', () => {
  it('returns the task result and commits', async () => {
    await openDatabase([]);

    const result = await withTransaction(async (txn) => {
      await txn.runAsync('INSERT INTO t (id) VALUES (?)', 'a');
      return 'done';
    });

    expect(result).toBe('done');
    expect(fake.statements).toContain('INSERT INTO t (id) VALUES (?)');
  });

  it('rolls back and reports DB_QUERY_FAILED when the task throws', async () => {
    await openDatabase([]);

    const error = await withTransaction(async (txn) => {
      await txn.runAsync('INSERT INTO t (id) VALUES (?)', 'a');
      throw new Error('constraint violation');
    }).catch((thrown: unknown) => thrown);

    expect((error as DatabaseError).code).toBe('DB_QUERY_FAILED');
    expect((error as DatabaseError).message).toMatch(/constraint violation/);
    // The work ran on the keyed connection and was undone by ROLLBACK. It is visible in the
    // statement log precisely because transactions no longer open a connection of their own —
    // that is what broke encrypted databases on device.
    expect(fake.statements).toContain('ROLLBACK');
    expect(fake.statements.indexOf('BEGIN IMMEDIATE')).toBeLessThan(
      fake.statements.indexOf('INSERT INTO t (id) VALUES (?)')
    );
  });

  it('runs on the keyed connection, never a new one', async () => {
    await openDatabase([]);
    // A fresh connection cannot decrypt a SQLCipher file: PRAGMA key applies only to the
    // connection it ran on, so this must never be reached.
    const exclusive = jest.spyOn(fake, 'withExclusiveTransactionAsync');

    await withTransaction(async (txn) => {
      await txn.runAsync('INSERT INTO t (id) VALUES (?)', 'a');
    });

    expect(exclusive).not.toHaveBeenCalled();
    expect(fake.statements).toEqual(expect.arrayContaining(['BEGIN IMMEDIATE', 'COMMIT']));
  });

  it('joins an existing transaction instead of nesting a second one', async () => {
    await openDatabase([]);

    await withTransaction(async (txn) => {
      await withTransaction(async (inner) => {
        expect(inner).toBe(txn);
        await inner.runAsync('INSERT INTO t (id) VALUES (?)', 'nested');
      }, txn);
    });

    // SQLite has no nested transactions, so a joined call must not issue a second BEGIN.
    expect(fake.statements.filter((statement) => statement === 'BEGIN IMMEDIATE')).toHaveLength(1);
    expect(fake.statements).toContain('INSERT INTO t (id) VALUES (?)');
  });

  it('queues concurrent transactions instead of interleaving them on one connection', async () => {
    await openDatabase([]);

    await Promise.all([
      withTransaction(async (txn) => {
        await txn.runAsync('INSERT INTO t (id) VALUES (?)', 'first');
      }),
      withTransaction(async (txn) => {
        await txn.runAsync('INSERT INTO t (id) VALUES (?)', 'second');
      })
    ]);

    // Two BEGINs, and never two open at once: each is closed before the next opens.
    const framing = fake.statements.filter((statement) =>
      ['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(statement)
    );
    expect(framing).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('fails clearly when the local store is unavailable', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });

    try {
      const error = await withTransaction(async () => 'never').catch((thrown: unknown) => thrown);
      expect(isDatabaseUnavailable(error)).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});
