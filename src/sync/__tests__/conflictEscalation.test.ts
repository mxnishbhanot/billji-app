import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createProduct, getProduct } from '../../db/productRepository';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { applyResolution } from '../conflictResolver';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('escalation', () => {
  it('refuses to guess when a pending row has no queued operation', async () => {
    // The queue is what says which fields the user changed. Without it there is no safe
    // merge and no honest overwrite, so the row waits for a person.
    const local = await createProduct({ _id: 'p1', name: 'Mine', price: 500 }, { businessId: BIZ, txn });

    const applied = await applyResolution(
      txn,
      'products',
      { _id: 'p1', name: 'Theirs', price: 900, version: 9 },
      { businessId: BIZ, now: T0 }
    );

    expect(applied.outcome).toBe('escalate');
    expect(applied.reason).toMatch(/no queued operation/);

    // Nothing was written: the local edit is intact and still pending.
    const record = await getProduct(local.localId, txn);
    expect(record?.doc).toMatchObject({ name: 'Mine', price: 500 });
    expect(record?.syncState).toBe('pending');
  });
});
