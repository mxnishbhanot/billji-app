import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCustomer } from '../../db/customerRepository';
import { createCustomerLocally, deleteCustomerLocally, updateCustomerLocally } from '../../db/customerWrites';
import { listOperations } from '../../db/outbox';
import { localCustomerPage } from '../../db/readModel';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, type PushResponse, type PushTransport } from '../pushEngine';

/**
 * The offline customer lifecycle end to end: written with no network, pushed when there is
 * one, and pulled back — including the case the customer policy exists for, two people
 * adding a different contact to the same account.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityLocalId: string) =>
  listOperations({ businessId: BIZ, entityType: 'customers', entityLocalId, txn });

const acceptAll = (serverId: string): PushTransport => async (body) => ({
  results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId, version: 1 }))
});

const engine = (transport: PushTransport) =>
  createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('pushing what was written offline', () => {
  it('drains a create and leaves the customer synced under its server id', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());

    const outcome = await engine(acceptAll('srv-7')).push();

    expect(outcome.done).toBe(1);
    const stored = await getCustomer(record.localId, txn);
    expect(stored?.serverId).toBe('srv-7');
    expect(stored?.syncState).toBe('synced');
    expect(stored?.doc?._id).toBe('srv-7');

    const page = await localCustomerPage(BIZ, { search: 'ravi', page: 1, limit: 20 }, txn);
    expect(page.customers[0]._id).toBe('srv-7');
  });

  it('sends an edit made before the create came back against the earned server id', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());
    await updateCustomerLocally(record.localId, { email: 'ravi@example.com' }, options());

    const sent: (string | null)[] = [];
    const transport: PushTransport = async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.opType}:${op.targetId ?? 'none'}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: 'srv-7', version: 2 })) };
    };

    await engine(transport).push();

    // The create goes first because the edit depends on it, and by then the row has an id.
    expect(sent).toEqual(['create:none', 'update:srv-7']);
    expect((await getCustomer(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps the customer and the queued work when the push fails', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await getCustomer(record.localId, txn))?.doc?.name).toBe('Ravi Traders');
    expect((await opsFor(record.localId))[0].status).toBe('pending');
  });

  it('sends the delete of a synced customer and nothing for one the server never saw', async () => {
    const kept = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());
    await engine(acceptAll('srv-7')).push();
    await deleteCustomerLocally(kept.localId, options());

    const unsent = await createCustomerLocally({ name: 'Typo', phone: '9000000000' }, options());
    await deleteCustomerLocally(unsent.localId, options());

    const sent: string[] = [];
    await engine(async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.opType}:${op.targetId}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const })) };
    }).push();

    expect(sent).toEqual(['delete:srv-7']);
    expect((await getCustomer(unsent.localId, txn))?.deletedAt).toBeTruthy();
  });
});

describe('pulling back what this device pushed', () => {
  it('does not escalate a customer the server has just accepted', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());
    await engine(acceptAll('srv-7')).push();

    const outcome = await mergeRecord(
      txn,
      'customers',
      { _id: 'srv-7', clientId: record.localId, name: 'Ravi Traders', phone: '9876543210', outstandingDues: 1200, version: 2 },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getCustomer(record.localId, txn);
    expect(stored?.syncState).toBe('synced');
    // Balances are the server's arithmetic and arrive with the record.
    expect(stored?.doc?.outstandingDues).toBe(1200);
  });

  it('keeps the local edit, unions the contacts and never takes a balance from this device', async () => {
    const record = await createCustomerLocally(
      { name: 'Ravi Traders', phone: '9876543210', contactPersons: [{ name: 'Ravi', phone: '9876543210' }] },
      options()
    );
    await engine(acceptAll('srv-7')).push();

    // This device renames the account and adds a second contact, offline.
    await updateCustomerLocally(
      record.localId,
      {
        name: 'Ravi Traders & Sons',
        contactPersons: [{ name: 'Meena', phone: '9000011111' }],
        outstandingDues: 0
      },
      options()
    );

    const outcome = await mergeRecord(
      txn,
      'customers',
      {
        _id: 'srv-7',
        clientId: record.localId,
        name: 'Ravi Traders',
        phone: '9876543210',
        email: 'accounts@ravi.example',
        contactPersons: [{ name: 'Ravi', phone: '9876543210' }],
        outstandingDues: 4500,
        version: 3
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('conflict');
    const doc = (await getCustomer(record.localId, txn))?.doc;
    expect(doc?.name).toBe('Ravi Traders & Sons');
    // The field only the server changed survives untouched.
    expect(doc?.email).toBe('accounts@ravi.example');
    // Both sides' contacts, deduplicated by normalised phone.
    expect(doc?.contactPersons?.map((contact) => contact.name).sort()).toEqual(['Meena', 'Ravi']);
    // The device's stale zero is discarded: dues are server-owned.
    expect(doc?.outstandingDues).toBe(4500);
    // Something of this device's survived, so the row is queued to be pushed again.
    expect((await getCustomer(record.localId, txn))?.syncState).toBe('pending');
  });

  it('holds a customer deleted on the server but edited here for a person to decide', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());
    await engine(acceptAll('srv-7')).push();
    await updateCustomerLocally(record.localId, { email: 'ravi@example.com' }, options());

    const outcome = await mergeRecord(
      txn,
      'customers',
      { _id: 'srv-7', clientId: record.localId, deletedAt: T0, version: 4 },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('conflict');
    const stored = await getCustomer(record.localId, txn);
    expect(stored?.syncState).toBe('conflict');
    // The edit is not thrown away behind the user's back.
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.doc?.email).toBe('ravi@example.com');
  });
});
