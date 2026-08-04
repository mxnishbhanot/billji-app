import { createCustomerLocally } from '../../db/customerWrites';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { backoffDelayMs, listOperations } from '../../db/outbox';
import { recordInvoicePaymentLocally } from '../../db/paymentWrites';
import { createProductLocally } from '../../db/productWrites';
import { localCustomerPage, localInvoice, localProductPage } from '../../db/readModel';
import { classifyResult, createPushEngine, MAX_PUSH_OPERATIONS } from '../pushEngine';
import { createFakeServer, createTestDevice, httpError, type FakeServer, type TestDevice } from './fakeServer';

/**
 * A signal that comes and goes — the normal state of a phone in a market, not an edge case.
 *
 * The distinction every test here turns on: a failure that says something about the *network*
 * retries forever, and a failure that says something about the *operation* stops. Getting it
 * backwards is expensive in both directions — a retried 422 spins a battery flat, and an
 * abandoned 500 loses a sale.
 */

const BIZ = 'biz-1';

let server: FakeServer;
let device: TestDevice;

const shop = async ({ stock = 20, price = 500 } = {}) => {
  const customer = await createCustomerLocally({ name: 'Ramesh Kumar', phone: '9876543210' }, device.options());
  const product = await createProductLocally({ name: 'Cement bag', price, stockQuantity: stock }, device.options());
  return { customerLocalId: customer.localId, productLocalId: product.localId };
};

const bill = async (customerId: string, productId: string, quantity = 1) =>
  (await createInvoiceLocally({ customerId, items: [{ productId, quantity }] }, device.options())).record;

const operations = () => listOperations({ businessId: BIZ, txn: device.txn });
const operation = async (entityType: string) => (await listOperations({ businessId: BIZ, entityType, txn: device.txn }))[0];

beforeEach(async () => {
  server = createFakeServer();
  device = await createTestDevice({ server, businessId: BIZ });
});

afterEach(() => device.close());

describe('the connection drops', () => {
  it('retries everything and abandons nothing', async () => {
    await shop();
    server.goOffline();

    const outcome = await device.push.push();

    expect(outcome).toMatchObject({ done: 0, dead: 0, retried: 2 });
    const queued = await operations();
    expect(queued.every((op) => op.status === 'pending')).toBe(true);
    expect(queued.every((op) => op.attempts === 1)).toBe(true);
    // Backed off, not spinning: the next attempt is scheduled, not immediate.
    expect(queued[0].nextAttemptAt).toBe(new Date(Date.parse(device.clock()) + backoffDelayMs(1)).toISOString());
    expect(server.pushes).toHaveLength(0);
  });

  it('holds the queue until the backoff expires, then sends it', async () => {
    await shop();
    server.goOffline();
    await device.push.push();

    server.goOnline();
    // Too early: nothing is ready, so the pass claims nothing rather than hammering.
    expect(await device.push.push()).toMatchObject({ claimed: 0 });

    device.advance(backoffDelayMs(1));
    await device.push.push();

    expect((await operations()).every((op) => op.status === 'done')).toBe(true);
    expect(server.count('customers')).toBe(1);
  });

  it('recovers a flapping connection without duplicating anything', async () => {
    const { customerLocalId, productLocalId } = await shop();
    await bill(customerLocalId, productLocalId);

    // Fails, succeeds, fails, succeeds — three passes with the clock moved on between them.
    for (let pass = 0; pass < 4; pass += 1) {
      server.failNextPushes(pass % 2 === 0 ? 1 : 0);
      await device.push.push();
      device.advance(backoffDelayMs(2));
    }
    await device.push.push();

    expect((await operations()).every((op) => op.status === 'done')).toBe(true);
    expect(server.count('customers')).toBe(1);
    expect(server.count('products')).toBe(1);
    expect(server.count('invoices')).toBe(1);
  });

  it('gives up onto the Failed screen rather than retrying forever', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, device.options());
    server.goOffline();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await device.push.push();
      device.advance(backoffDelayMs(attempt));
    }

    const [queued] = await operations();
    // 'failed', not 'dead': the user can still retry it, and the write is still on the device.
    expect(queued).toMatchObject({ status: 'failed', attempts: 5 });
    expect(await device.push.deadLetters()).toHaveLength(1);
    expect((await localCustomerPage(BIZ, {}, device.txn)).customers).toHaveLength(1);
  });
});

describe('a batch that dies halfway', () => {
  it('resends the whole batch and lands one copy of each record', async () => {
    // Three creates in one batch: /sync/push is not atomic, each operation commits alone.
    for (const name of ['Ravi', 'Anita', 'Suresh']) {
      await createCustomerLocally({ name, phone: `900000000${name.length}` }, device.options());
    }

    // The server applied the first two and then the socket closed. The client is told nothing
    // about any of them, including the two that worked.
    server.dieAfterOps(2);
    await device.push.push();
    expect((await operations()).every((op) => op.status === 'pending')).toBe(true);
    expect(server.count('customers')).toBe(2);

    device.advance(backoffDelayMs(1));
    await device.push.push();

    // Resent in full, deduped by clientId: three customers, not five.
    expect(server.count('customers')).toBe(3);
    expect((await operations()).every((op) => op.status === 'done')).toBe(true);
    expect((await localCustomerPage(BIZ, {}, device.txn)).customers).toHaveLength(3);
  });

  it('retries an operation the server answered with nothing', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, device.options());
    const queued = await operation('customers');
    server.swallowResultFor(queued.opId);

    await device.push.push();

    expect((await operation('customers')).status).toBe('pending');
    expect((await operation('customers')).lastError).toMatch(/no result/);
  });
});

describe('what the status code means', () => {
  it('retries a 500 and abandons a 422', () => {
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 500 })).toMatchObject({ outcome: 'retry' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 429 })).toMatchObject({ outcome: 'retry' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 422 })).toMatchObject({ outcome: 'dead' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 403 })).toMatchObject({ outcome: 'dead' });
    expect(classifyResult({ opId: 'a', status: 'conflict' })).toMatchObject({ outcome: 'conflict' });
  });

  it('retries a duplicate that overlapped its own send instead of calling it a conflict', () => {
    // The server saw this operation twice at once and answered 409 on the second. It is the
    // same write in flight, not two writers — asking a shopkeeper to resolve it would be wrong.
    expect(
      classifyResult({
        opId: 'a',
        status: 'conflict',
        statusCode: 409,
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'A request with this idempotency key is still processing'
      })
    ).toMatchObject({ outcome: 'retry' });
  });

  it('stops the pass on a 401 without failing the operations for it', async () => {
    await shop();
    server.failNextPushes(1, 401);

    const outcome = await device.push.push();

    expect(outcome).toMatchObject({ stopped: 'aborted', dead: 0 });
    expect(outcome.reason).toMatch(/Not authorised/);
    // A session problem is not these operations' fault, so they stay pending.
    expect((await operations()).every((op) => op.status === 'pending')).toBe(true);
  });

  it('tells the app to update itself on a 426 and stops trying', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, device.options());
    const onProtocolUnsupported = jest.fn();
    const engine = createPushEngine({
      businessId: BIZ,
      txn: device.txn,
      clock: device.clock,
      transport: server.push,
      onProtocolUnsupported
    });
    server.failNextPushes(1, 426);

    const outcome = await engine.push();

    expect(onProtocolUnsupported).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ stopped: 'aborted', reason: 'This app version is too old to sync' });
  });

  it('halves the batch when the server says it was too large', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, device.options());
    const engine = createPushEngine({
      businessId: BIZ,
      txn: device.txn,
      clock: device.clock,
      transport: async () => {
        throw httpError(413);
      },
      batchSize: MAX_PUSH_OPERATIONS
    });

    await engine.push();

    expect(engine.currentBatchSize()).toBe(MAX_PUSH_OPERATIONS / 2);
  });
});

describe('a pull that fails', () => {
  it('leaves the other collections alone and the cursor where it was', async () => {
    server.seed('products', { name: 'Sand', price: 40, stockQuantity: 100 });
    server.seed('customers', { name: 'Anita', phone: '9000000002' });
    // One collection's request fails; the rest of the pass carries on.
    server.failNextPulls(1, 500);

    const outcome = await device.pull.pull();

    const failed = outcome.collections.find((result) => result.error);
    expect(failed?.pages).toBe(0);
    expect(await device.pull.cursor(failed!.collection)).toBeNull();
    expect(outcome.collections.filter((result) => !result.error).length).toBeGreaterThan(0);
    expect(outcome.hasMore).toBe(true);
  });

  it('keeps counting a receipt the server accepted until the bill itself catches up', async () => {
    const { customerLocalId, productLocalId } = await shop({ price: 1000 });
    const invoice = await bill(customerLocalId, productLocalId);
    await device.sync();
    await recordInvoicePaymentLocally(invoice.localId, { amount: 400, method: 'cash' }, device.options());

    // The push lands. The pull that would bring the settled bill back does not.
    server.failNextPulls(20, 500);
    await device.sync();

    expect(server.live('payments')).toHaveLength(1);
    // The bill on the device is still the unpaid copy, so the receipt keeps being counted —
    // otherwise the same dues are collectable twice on this screen.
    expect((await localInvoice(BIZ, invoice.localId, device.txn))?.balanceDue).toBe(600);
    expect((await localInvoice(BIZ, invoice.localId, device.txn))?.paymentStatus).toBe('partial');

    server.failNextPulls(0);
    await device.pull.pull();

    // Now the server's own figure is in the row, and it is not counted twice.
    expect((await localInvoice(BIZ, invoice.localId, device.txn))?.paidAmount).toBe(400);
    expect((await localInvoice(BIZ, invoice.localId, device.txn))?.balanceDue).toBe(600);
  });

  it('does not lose a local edit made while the pull was failing', async () => {
    const { productLocalId } = await shop();
    await device.sync();
    const serverId = String(
      device.raw.prepare('SELECT server_id FROM products WHERE local_id = ?').get(productLocalId)?.server_id
    );

    // Edited here, edited there, and the device only hears about the other one later.
    device.raw
      .prepare("UPDATE products SET sync_state = 'pending', price = 700, payload = json_set(payload, '$.price', 700) WHERE local_id = ?")
      .run(productLocalId);
    server.mutate('products', serverId, { price: 900 });

    await device.pull.pull();

    const row = device.raw.prepare('SELECT sync_state FROM products WHERE local_id = ?').get(productLocalId);
    expect(row?.sync_state).toBe('conflict');
    // The shopkeeper's number is still there for them to choose from.
    expect((await localProductPage(BIZ, {}, device.txn)).products[0].price).toBe(700);
  });
});
