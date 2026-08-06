import { DatabaseError, isDatabaseError } from '../errors';
import { latestVersion, readSchemaVersion, runMigrations, type Migration } from '../migrations';
import { createFakeDatabase } from './fakeSqlite';

const migration = (version: number, name = `m${version}`, up?: Migration['up']): Migration => ({
  version,
  name,
  up:
    up ??
    (async (db) => {
      await db.execAsync(`CREATE TABLE t${version} (id TEXT PRIMARY KEY)`);
    })
});

describe('runMigrations', () => {
  it('applies every migration in order on a fresh database', async () => {
    const db = createFakeDatabase();

    const result = await runMigrations(db, [migration(2), migration(1), migration(3)]);

    expect(result).toEqual({ from: 0, to: 3, applied: [1, 2, 3] });
    expect(db.userVersion).toBe(3);
    // Sorted by version regardless of the order they were declared in.
    expect(db.statements.filter((sql) => sql.startsWith('CREATE TABLE'))).toEqual([
      'CREATE TABLE t1 (id TEXT PRIMARY KEY)',
      'CREATE TABLE t2 (id TEXT PRIMARY KEY)',
      'CREATE TABLE t3 (id TEXT PRIMARY KEY)'
    ]);
  });

  it('skips migrations the database already has', async () => {
    const db = createFakeDatabase();
    db.userVersion = 2;

    const result = await runMigrations(db, [migration(1), migration(2), migration(3)]);

    expect(result.applied).toEqual([3]);
    expect(db.statements.filter((sql) => sql.startsWith('CREATE TABLE'))).toEqual([
      'CREATE TABLE t3 (id TEXT PRIMARY KEY)'
    ]);
  });

  it('is a no-op when the database is current', async () => {
    const db = createFakeDatabase();
    db.userVersion = 2;

    const result = await runMigrations(db, [migration(1), migration(2)]);

    expect(result).toEqual({ from: 2, to: 2, applied: [] });
    expect(db.statements).toHaveLength(0);
  });

  it('leaves the version untouched when a migration throws', async () => {
    const db = createFakeDatabase();
    const exploding = migration(2, 'explodes', async () => {
      throw new Error('no such column');
    });

    await expect(runMigrations(db, [migration(1), exploding, migration(3)])).rejects.toThrow(
      /Migration 2 \(explodes\) failed/
    );

    // 1 committed; 2 rolled back; 3 never ran. The next launch retries from 1.
    expect(db.userVersion).toBe(1);
    expect(db.statements.filter((sql) => sql.startsWith('CREATE TABLE'))).toEqual([
      'CREATE TABLE t1 (id TEXT PRIMARY KEY)'
    ]);
  });

  it('rolls the version bump back with the schema change it belongs to', async () => {
    const db = createFakeDatabase();
    // The version write is the last statement in the migration's transaction; failing it
    // must also undo the CREATE TABLE that preceded it.
    db.failOn('PRAGMA user_version = 1');

    await expect(runMigrations(db, [migration(1)])).rejects.toBeInstanceOf(DatabaseError);
    expect(db.userVersion).toBe(0);
    // Migrations now run on the connection they were handed rather than a private one — the only
    // connection that can decrypt a SQLCipher file — so the statement log shows the attempt and
    // the ROLLBACK that undid it.
    expect(db.statements).toEqual(['BEGIN IMMEDIATE', 'CREATE TABLE t1 (id TEXT PRIMARY KEY)', 'ROLLBACK']);
  });

  it('refuses a database newer than the app', async () => {
    const db = createFakeDatabase();
    db.userVersion = 7;

    await expect(runMigrations(db, [migration(1)])).rejects.toThrow(/newer than this app supports/);
    expect(db.userVersion).toBe(7);
  });

  it('refuses a duplicated or skipped version slot', async () => {
    const db = createFakeDatabase();

    await expect(runMigrations(db, [migration(1), migration(1, 'clash')])).rejects.toThrow(/contiguous/);
    await expect(runMigrations(db, [migration(1), migration(3)])).rejects.toThrow(/expected version 2/);
    expect(db.statements).toHaveLength(0);
  });

  it('reports failures as DatabaseError with a migration code', async () => {
    const db = createFakeDatabase();
    const exploding = migration(1, 'boom', async () => {
      throw new Error('disk I/O error');
    });

    const error = await runMigrations(db, [exploding]).catch((thrown: unknown) => thrown);

    expect(isDatabaseError(error)).toBe(true);
    expect((error as DatabaseError).code).toBe('DB_MIGRATION_FAILED');
    // The driver's own message survives for Sentry.
    expect((error as DatabaseError).message).toMatch(/disk I\/O error/);
    expect((error as DatabaseError).cause).toBeInstanceOf(Error);
  });
});

describe('schema version helpers', () => {
  it('reads user_version, defaulting to 0', async () => {
    const db = createFakeDatabase();
    expect(await readSchemaVersion(db)).toBe(0);

    db.userVersion = 4;
    expect(await readSchemaVersion(db)).toBe(4);
  });

  it('reports 0 for an empty migration list', () => {
    expect(latestVersion([])).toBe(0);
    expect(latestVersion([migration(1), migration(2)])).toBe(2);
  });
});
