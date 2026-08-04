import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { resetChangeBus, subscribeToChanges, type ChangeEvent } from '../changeBus';
import { createCustomer } from '../customerRepository';
import { createPayment } from '../paymentRepository';
import { createProduct, deleteProduct, updateProduct } from '../productRepository';
import { withTransaction } from '../transaction';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;
let seen: ChangeEvent[];

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
  resetChangeBus();
  seen = [];
  subscribeToChanges((events) => seen.push(...events));
});

afterEach(() => {
  resetChangeBus();
  raw.close();
});

describe('repository writes announce themselves', () => {
  it('emits create, update and delete with identity', async () => {
    const product = await createProduct({ _id: 'srv-1', name: 'Cement' }, { businessId: BIZ, txn });
    await updateProduct(product.localId, { price: 420 }, { txn });
    await deleteProduct(product.localId, { txn });

    expect(seen.map((event) => event.type)).toEqual(['created', 'updated', 'deleted']);
    expect(seen[0]).toMatchObject({ entity: 'products', localId: product.localId, serverId: 'srv-1', origin: 'local' });
    // The changed fields travel with the event, so a subscriber can be selective.
    expect(seen[1].fields).toEqual(['price']);
  });

  it('marks a write from the sync engine as server truth', async () => {
    await createProduct({ name: 'Sand' }, { businessId: BIZ, txn, syncState: 'synced' });
    expect(seen[0].origin).toBe('sync');
  });

  it('carries the records a payment is visible through', async () => {
    await createPayment(
      { amount: 500, salesDocument: 'inv-1', customer: 'cust-1', receivedAt: '2026-08-02T10:00:00.000Z' },
      { businessId: BIZ, txn }
    );

    expect(seen[0].related).toEqual(
      expect.arrayContaining([
        { entity: 'invoices', id: 'inv-1' },
        { entity: 'customers', id: 'cust-1' }
      ])
    );
  });
});

describe('transaction boundaries', () => {
  it('publishes once the transaction commits, not before', async () => {
    await withTransaction(async (scoped) => {
      await createProduct({ name: 'A' }, { businessId: BIZ, txn: scoped });
      await createCustomer({ name: 'B' }, { businessId: BIZ, txn: scoped });
      // Still inside: nothing has committed, so nothing has been announced.
      expect(seen).toHaveLength(0);
    }, txn);

    expect(seen.map((event) => event.entity)).toEqual(['products', 'customers']);
  });

  it('announces nothing when the transaction rolls back', async () => {
    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await withTransaction(async (inner) => {
          await createProduct({ name: 'Doomed' }, { businessId: BIZ, txn: inner });
          throw new Error('rolled back');
        }, scoped);
      })
    ).rejects.toThrow('rolled back');

    // A subscriber must never react to a write that did not happen.
    expect(seen).toEqual([]);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 0 });
  });

  it('survives a subscriber that throws', async () => {
    subscribeToChanges(() => {
      throw new Error('bad listener');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(createProduct({ name: 'Fine' }, { businessId: BIZ, txn })).resolves.toBeTruthy();
    expect(seen).toHaveLength(1);
    warn.mockRestore();
  });
});
