import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../migrations';
import { initialSchema } from '../schema/001_initial';

/**
 * The other suites use a fake driver, which cannot tell a valid CREATE TABLE from a typo.
 * This one runs the migration's SQL through a real SQLite engine — node:sqlite, built into
 * Node 22, so no new dependency — and asserts the schema it actually produces.
 */
const applySchema = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  // The migration's `up` receives an expo SQLiteDatabase; execAsync is the only method it
  // calls, and node:sqlite's exec is the same batch operation.
  const adapter = { execAsync: async (sql: string) => db.exec(sql) };
  return { db, run: () => initialSchema.up(adapter as never) };
};

const names = (rows: Record<string, unknown>[]) => rows.map((row) => String(row.name));

const tableNames = (db: DatabaseSync) =>
  names(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
  );

const columnsOf = (db: DatabaseSync, table: string) => names(db.prepare(`PRAGMA table_info(${table})`).all());

const indexesOf = (db: DatabaseSync, table: string) =>
  names(
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'`)
      .all(table)
  );

const SYNCED_TABLES = ['products', 'customers', 'invoices', 'payments', 'expenses', 'suppliers', 'business'];

let db: DatabaseSync;

beforeEach(async () => {
  const applied = applySchema();
  db = applied.db;
  await applied.run();
});

afterEach(() => {
  db.close();
});

describe('initial schema', () => {
  it('is the first of the registered migrations', () => {
    expect(migrations.map((entry) => [entry.version, entry.name])).toEqual([
      [1, 'initial_schema'],
      [2, 'purchases']
    ]);
  });

  it('creates every requested table', () => {
    expect(tableNames(db)).toEqual([
      'business',
      'customers',
      'expenses',
      'invoices',
      'outbox',
      'payments',
      'products',
      'settings',
      'suppliers'
    ]);
  });

  it('is idempotent, so a re-run after a failed migration is safe', async () => {
    const rerun = applySchema();
    await rerun.run();
    await expect(rerun.run()).resolves.toBeUndefined();
    rerun.db.close();
  });

  it('gives every synced table the common column set', () => {
    SYNCED_TABLES.forEach((table) => {
      expect(columnsOf(db, table)).toEqual(
        expect.arrayContaining([
          'local_id',
          'server_id',
          'business_id',
          'payload',
          'version',
          'sync_state',
          'deleted_at',
          'server_updated_at',
          'local_updated_at'
        ])
      );
    });
  });

  it('indexes every synced table by business first', () => {
    SYNCED_TABLES.forEach((table) => {
      expect(indexesOf(db, table).length).toBeGreaterThan(0);
      const leadingColumns = indexesOf(db, table).map((index) =>
        String(db.prepare(`PRAGMA index_info(${index})`).all()[0].name)
      );
      leadingColumns.forEach((column) => expect(column).toBe('business_id'));
    });
  });
});

describe('constraints that protect data', () => {
  const insertProduct = (overrides: Record<string, unknown> = {}) => {
    const row = {
      local_id: '01927b3e-0000-7000-8000-000000000001',
      business_id: 'biz-1',
      payload: '{}',
      local_updated_at: '2026-08-02T10:00:00.000Z',
      name: 'Rice 5kg',
      ...overrides
    };
    const columns = Object.keys(row).join(', ');
    const placeholders = Object.keys(row)
      .map(() => '?')
      .join(', ');
    db.prepare(`INSERT INTO products (${columns}) VALUES (${placeholders})`).run(
      ...(Object.values(row) as never[])
    );
  };

  it('defaults a new row to pending and rejects an unknown sync_state', () => {
    insertProduct();
    expect(db.prepare('SELECT sync_state FROM products').get()).toEqual({ sync_state: 'pending' });

    expect(() => insertProduct({ local_id: 'x', sync_state: 'whatever' })).toThrow(/CHECK constraint/);
  });

  it('refuses two local rows claiming the same server record', () => {
    insertProduct({ server_id: '66f0000000000000000000a1' });
    expect(() => insertProduct({ local_id: 'other', server_id: '66f0000000000000000000a1' })).toThrow(
      /UNIQUE constraint/
    );
  });

  it('keeps a tombstone as a row rather than deleting it', () => {
    insertProduct();
    db.prepare('UPDATE products SET deleted_at = ?, sync_state = ? WHERE local_id = ?').run(
      '2026-08-02T11:00:00.000Z',
      'synced',
      '01927b3e-0000-7000-8000-000000000001'
    );

    const row = db.prepare('SELECT deleted_at FROM products').get() as { deleted_at: string };
    expect(row.deleted_at).toBe('2026-08-02T11:00:00.000Z');
  });

  it('lets an invoice reference a customer this device does not hold', () => {
    // Windowing and scoped sync both produce this. A foreign key would reject the row
    // instead of storing it as a pending reference.
    expect(() =>
      db
        .prepare(
          `INSERT INTO invoices (local_id, business_id, payload, local_updated_at, date, customer_local_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('inv-1', 'biz-1', '{}', '2026-08-02T10:00:00.000Z', '2026-08-02', 'customer-not-on-device')
    ).not.toThrow();
  });
});

describe('outbox', () => {
  const enqueue = (overrides: Record<string, unknown> = {}) => {
    const row = {
      op_id: `op-${Math.random().toString(36).slice(2)}`,
      business_id: 'biz-1',
      entity_type: 'invoice',
      entity_local_id: 'inv-1',
      op_type: 'create',
      payload: '{}',
      created_at: '2026-08-02T10:00:00.000Z',
      updated_at: '2026-08-02T10:00:00.000Z',
      ...overrides
    };
    const columns = Object.keys(row).join(', ');
    const placeholders = Object.keys(row)
      .map(() => '?')
      .join(', ');
    return db
      .prepare(`INSERT INTO outbox (${columns}) VALUES (${placeholders})`)
      .run(...(Object.values(row) as never[]));
  };

  it('never reuses a sequence number, even after the row is pruned', () => {
    enqueue({ op_id: 'op-1' });
    enqueue({ op_id: 'op-2' });
    db.prepare('DELETE FROM outbox').run();
    enqueue({ op_id: 'op-3' });

    const row = db.prepare('SELECT seq FROM outbox WHERE op_id = ?').get('op-3') as { seq: number };
    // AUTOINCREMENT: plain rowid would hand out 1 again and reorder intent.
    expect(row.seq).toBe(3);
  });

  it('rejects a duplicate op_id, which is also the idempotency key', () => {
    enqueue({ op_id: 'op-dup' });
    expect(() => enqueue({ op_id: 'op-dup' })).toThrow(/UNIQUE constraint/);
  });

  it('defaults to pending, priority 3, no dependencies, zero attempts', () => {
    enqueue({ op_id: 'op-defaults' });

    expect(db.prepare('SELECT status, priority, depends_on, attempts FROM outbox').get()).toEqual({
      status: 'pending',
      priority: 3,
      depends_on: '[]',
      attempts: 0
    });
  });

  it('rejects an out-of-range priority, an unknown op_type and an unknown status', () => {
    expect(() => enqueue({ priority: 0 })).toThrow(/CHECK constraint/);
    expect(() => enqueue({ priority: 5 })).toThrow(/CHECK constraint/);
    expect(() => enqueue({ op_type: 'upsert' })).toThrow(/CHECK constraint/);
    expect(() => enqueue({ status: 'maybe' })).toThrow(/CHECK constraint/);
  });

  it('drains by priority then sequence', () => {
    enqueue({ op_id: 'masters', priority: 3 });
    enqueue({ op_id: 'payment', priority: 1 });
    enqueue({ op_id: 'invoice', priority: 2 });
    enqueue({ op_id: 'payment-later', priority: 1 });

    const order = db
      .prepare("SELECT op_id FROM outbox WHERE status = 'pending' ORDER BY priority ASC, seq ASC")
      .all()
      .map((row) => String(row.op_id));

    // Money first, and within one priority the order of intent is preserved.
    expect(order).toEqual(['payment', 'payment-later', 'invoice', 'masters']);
  });
});

describe('settings', () => {
  it('stores device-local preferences by key', () => {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'theme',
      'dark',
      '2026-08-02T10:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run('theme', 'light', '2026-08-02T11:00:00.000Z');

    expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('theme')).toEqual({ value: 'light' });
    // Separate from `business`, which holds the settings that are server state.
    expect(columnsOf(db, 'settings')).toEqual(['key', 'value', 'updated_at']);
  });
});
