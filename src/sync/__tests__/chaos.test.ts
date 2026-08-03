import { createCustomerLocally, updateCustomerLocally } from '../../db/customerWrites';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { backoffDelayMs, listOperations, type OutboxOperation } from '../../db/outbox';
import { recordInvoicePaymentLocally } from '../../db/paymentWrites';
import { createProductLocally, deleteProductLocally, updateProductLocally } from '../../db/productWrites';
import { localInvoicePage } from '../../db/readModel';
import { createFakeServer, createTestDevice, type FakeServer, type TestDevice } from './fakeServer';

/**
 * Randomised billing against a randomly hostile network, then a check that the books add up.
 *
 * The scripted suites each assert one known failure. This one exists for the failures nobody
 * thought to script: an interleaving of two tills, a dropped batch, a lost acknowledgement and
 * a retry that happens to land between a bill and its receipt. The generator is seeded, so a
 * failure is reproducible from the seed printed in the test name.
 *
 * It asserts invariants, never a specific outcome — the point is that whatever happened, the
 * shop's money and stock still make sense:
 *
 *   1. nothing is stuck: after the network heals, no operation is left waiting
 *   2. nothing is duplicated: one clientId is one server record, forever
 *   3. no number is reused: two issued documents never share a number
 *   4. no money is invented: a bill is never paid beyond its total, and every rupee a device
 *      accepted is either allocated, credited, or still on the device as a conflict
 *   5. both devices end up reading the same books
 */

const BIZ = 'biz-1';

/** mulberry32: three lines, reproducible, and not a dependency. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Shop = {
  device: TestDevice;
  customers: string[];
  products: string[];
  invoices: string[];
};

const money = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const run = async (seed: number, rounds: number) => {
  const dice = random(seed);
  const pick = <T>(list: T[]): T | null => (list.length ? list[Math.floor(dice() * list.length)] : null);

  const server = createFakeServer();
  const shops: Shop[] = [
    { device: await createTestDevice({ server, businessId: BIZ, deviceId: 'dev-counter', deviceIndex: 1 }), customers: [], products: [], invoices: [] },
    { device: await createTestDevice({ server, businessId: BIZ, deviceId: 'dev-van', deviceIndex: 2 }), customers: [], products: [], invoices: [] }
  ];

  const act = async (shop: Shop) => {
    const { device } = shop;
    const roll = dice();

    if (roll < 0.15 || !shop.customers.length) {
      const customer = await createCustomerLocally(
        { name: `Customer ${Math.floor(dice() * 1e6)}`, phone: `9${Math.floor(dice() * 1e9)}`.slice(0, 10) },
        device.options()
      );
      shop.customers.push(customer.localId);
      return;
    }

    if (roll < 0.3 || !shop.products.length) {
      const product = await createProductLocally(
        { name: `Product ${Math.floor(dice() * 1e6)}`, price: 50 + Math.floor(dice() * 500), stockQuantity: Math.floor(dice() * 50) },
        device.options()
      );
      shop.products.push(product.localId);
      return;
    }

    if (roll < 0.55) {
      // Oversell is allowed: the goods left the counter before the device could ask anyone.
      const { record } = await createInvoiceLocally(
        {
          customerId: pick(shop.customers)!,
          items: [{ productId: pick(shop.products)!, quantity: 1 + Math.floor(dice() * 4) }]
        },
        { ...device.options(), allowOversell: true }
      );
      shop.invoices.push(record.localId);
      return;
    }

    if (roll < 0.7) {
      const invoice = pick(shop.invoices);
      if (!invoice) return;
      const balance = num((await localInvoicePage(BIZ, {}, device.txn)).invoices.find((doc) => doc._id === invoice)?.balanceDue);
      if (balance <= 0) return;
      await recordInvoicePaymentLocally(
        invoice,
        { amount: money(Math.max(1, Math.round(balance * dice()))), method: 'cash' },
        device.options()
      );
      return;
    }

    if (roll < 0.78) {
      await updateProductLocally(pick(shop.products)!, { price: 50 + Math.floor(dice() * 900) }, device.options());
      return;
    }

    if (roll < 0.84) {
      await updateCustomerLocally(pick(shop.customers)!, { email: `c${Math.floor(dice() * 1e6)}@example.com` }, device.options());
      return;
    }

    if (roll < 0.88) {
      const product = pick(shop.products);
      if (!product) return;
      // Removed from the catalogue and from anything this run bills afterwards.
      shop.products = shop.products.filter((id) => id !== product);
      await deleteProductLocally(product, device.options());
      return;
    }

    // A sync, under whatever the network is doing this round.
    const weather = dice();
    if (weather < 0.2) server.goOffline();
    else server.goOnline();
    if (weather >= 0.2 && weather < 0.3) server.failNextPushes(1, 500);
    if (weather >= 0.3 && weather < 0.4) server.failNextPulls(1, 500);
    if (weather >= 0.4 && weather < 0.5) server.dieAfterOps(1);
    if (weather >= 0.5 && weather < 0.6) {
      const [next] = await listOperations({ businessId: BIZ, status: 'pending', txn: device.txn });
      if (next) server.swallowResultFor(next.opId);
    }

    await device.sync();
    device.advance(backoffDelayMs(1) + Math.floor(dice() * 60_000));
  };

  for (let round = 0; round < rounds; round += 1) {
    await act(shops[Math.floor(dice() * shops.length)]);
  }

  // The network comes back and stays back. Both devices drain until nothing moves.
  server.goOnline();
  for (let pass = 0; pass < 6; pass += 1) {
    for (const shop of shops) {
      await shop.device.sync();
      shop.device.advance(backoffDelayMs(5));
    }
  }

  return { server, shops };
};

const inFlightOrWaiting = (operations: OutboxOperation[]) =>
  operations.filter((op) => op.status === 'pending' || op.status === 'inflight');

/**
 * Why an operation is still waiting, walked back to the root of its chain. A queue may only
 * hold work behind something a person has been told about — never behind an accepted or a
 * missing operation, which would be a wedge nobody can clear.
 */
const blockedBy = (operation: OutboxOperation, byId: Map<string, OutboxOperation>): string => {
  for (const dependency of operation.dependsOn) {
    const parent = byId.get(dependency);
    if (!parent) return 'missing';
    if (parent.status === 'done') continue;
    if (parent.status === 'pending' || parent.status === 'inflight') return blockedBy(parent, byId);
    return parent.status;
  }
  return 'nothing';
};

describe.each([1, 7, 42, 1337])('seed %i', (seed) => {
  let server: FakeServer;
  let shops: Shop[];

  beforeAll(async () => {
    ({ server, shops } = await run(seed, 120));
  });

  afterAll(() => {
    for (const shop of shops) shop.device.close();
  });

  it('leaves nothing waiting except behind something a person was told about', async () => {
    for (const shop of shops) {
      const operations = await listOperations({ businessId: BIZ, txn: shop.device.txn, limit: -1 });
      const byId = new Map(operations.map((operation) => [operation.opId, operation]));

      for (const operation of inFlightOrWaiting(operations)) {
        // 'nothing' would mean it was ready and simply never sent; 'missing' or 'done' would
        // mean it waits on something that can never change. Both are wedges.
        expect(['failed', 'conflict', 'dead']).toContain(blockedBy(operation, byId));
      }

      // And whatever it is waiting on says why, so the Failed Operations screen can show it.
      for (const operation of operations.filter((op) => op.status === 'dead' || op.status === 'failed')) {
        expect(operation.lastError).toBeTruthy();
      }
    }
  });

  it('has one server record per clientId, however many times it was sent', () => {
    for (const table of ['customers', 'products', 'invoices', 'payments']) {
      const clientIds = server.records(table).map((record) => record.clientId).filter(Boolean);
      expect(new Set(clientIds).size).toBe(clientIds.length);
    }
  });

  it('never reuses a document number', () => {
    const numbers = server.live('invoices').map((invoice) => String(invoice.documentNumber ?? ''));
    expect(numbers.every((number) => number.length > 0 && number.length <= 16)).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('never pays a bill beyond its total, and keeps every balance consistent', () => {
    for (const invoice of server.live('invoices')) {
      expect(num(invoice.paidAmount)).toBeLessThanOrEqual(num(invoice.total) + 0.001);
      expect(num(invoice.balanceDue)).toBe(money(num(invoice.total) - num(invoice.paidAmount)));
      const expected = num(invoice.paidAmount) <= 0 ? 'unpaid' : num(invoice.balanceDue) <= 0 ? 'paid' : 'partial';
      expect(invoice.paymentStatus).toBe(expected);
    }
  });

  it('accounts for every rupee it accepted', () => {
    const receipts = server.live('payments');
    for (const receipt of receipts) {
      // Allocated plus credit is the whole receipt: money is never partially forgotten.
      expect(money(num(receipt.allocatedAmount) + num(receipt.unappliedAmount))).toBe(num(receipt.amount));
    }

    // What the invoices say they were paid is exactly what the receipts say they allocated.
    const allocated = receipts.reduce((sum, receipt) => sum + num(receipt.allocatedAmount), 0);
    const paid = server.live('invoices').reduce((sum, invoice) => sum + num(invoice.paidAmount), 0);
    expect(money(paid)).toBe(money(allocated));
  });

  it('loses no receipt a device took', async () => {
    for (const shop of shops) {
      const rows = shop.device.raw
        .prepare('SELECT local_id, sync_state FROM payments WHERE deleted_at IS NULL')
        .all() as { local_id: string; sync_state: string }[];

      for (const row of rows) {
        if (row.sync_state === 'synced') {
          expect(server.byClientId(row.local_id)).not.toBeNull();
          continue;
        }
        // Not on the server: then it is on this device with an operation explaining why.
        const operations = await listOperations({
          businessId: BIZ,
          entityType: 'payments',
          entityLocalId: row.local_id,
          txn: shop.device.txn
        });
        expect(operations.length).toBeGreaterThan(0);
        expect(['conflict', 'failed', 'dead', 'done']).toContain(operations[operations.length - 1].status);
      }
    }
  });

  it('leaves both devices reading the same books', async () => {
    const [counter, van] = shops;
    const idsOn = async (shop: Shop) =>
      (await localInvoicePage(BIZ, { page: 1, limit: 500 }, shop.device.txn)).invoices
        .filter((invoice) => String(invoice._id).startsWith('srv-'))
        .map((invoice) => `${invoice._id}:${num(invoice.paidAmount)}`)
        .sort();

    const onCounter = await idsOn(counter);
    const onVan = await idsOn(van);

    // Only the records both devices have seen — a bill still queued on one is not a divergence.
    const shared = new Set(onVan.map((entry) => entry.split(':')[0]));
    expect(onCounter.filter((entry) => shared.has(entry.split(':')[0]))).toEqual(
      onVan.filter((entry) => shared.has(entry.split(':')[0]))
    );
  });
});
