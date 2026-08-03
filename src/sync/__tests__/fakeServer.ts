import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { saveDeviceSeries } from '../../db/invoiceNumbering';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { createPullEngine, type PullPage, type PullTransport } from '../pullEngine';
import { createPushEngine, type PushResponse, type PushResult, type PushTransport, type WireOperation } from '../pushEngine';

/**
 * A server, in memory, behaving the way the real one behaves where it matters to a client:
 * it owns identity, versions and money, it dedupes a replayed create by clientId, and it
 * hands out a keyset delta stream per collection.
 *
 * It exists because the interesting failures are not in one engine — they are in the loop.
 * A push that is accepted and whose response is lost, two tills billing the same stock, a
 * process killed between a page and its cursor: none of those can be written with scripted
 * transport stubs, because the assertion is about what the *server* ended up holding.
 *
 * What is deliberately modelled:
 *   - create is idempotent per clientId (the Idempotency-Key contract)
 *   - a document number is unique per business, and a duplicate is a 409, never a renumber
 *   - stock is decremented server-side by the invoice, not by the client's delta
 *   - a receipt is allocated *here*, greedily, oldest first, against the server's balances
 *   - updatedAt is monotonic, so the cursor is total-ordered and pull is replayable
 *
 * What is not: permissions, GST maths, the ledger, and update-conflict detection — the wire
 * carries no baseVersion (see pushEngine.toWireOperation), so an update is last-write-wins
 * here exactly as it is against the real /sync/push.
 */

export type ServerRecord = Record<string, unknown> & {
  _id: string;
  version: number;
  updatedAt: string;
  clientId?: string | null;
  deletedAt?: string | null;
};

/** Wire entity to server collection. `customerPayment` is a payment with no invoice named. */
const COLLECTION_OF: Record<string, string> = {
  product: 'products',
  customer: 'customers',
  invoice: 'invoices',
  payment: 'payments',
  customerPayment: 'payments',
  expense: 'expenses',
  vendor: 'vendors',
  purchase: 'purchases'
};

/** A refusal the server states in a result rather than an HTTP failure for the whole batch. */
class Refusal extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly status: 'conflict' | 'rejected' = 'rejected'
  ) {
    super(message);
  }
}

/** An axios-shaped failure: `isAxiosError` is what the engines branch on. */
export const httpError = (status: number, message = `Request failed with status code ${status}`) =>
  Object.assign(new Error(message), { isAxiosError: true, response: { status } });

const money = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const paymentStatusFor = (paid: number, total: number) =>
  paid <= 0 ? 'unpaid' : paid + 0.005 >= total ? 'paid' : 'partial';

export type FakeServerOptions = { startedAt?: string; idPrefix?: string };

export const createFakeServer = ({ startedAt = '2026-08-02T10:00:00.000Z', idPrefix = 'srv' }: FakeServerOptions = {}) => {
  const store = new Map<string, Map<string, ServerRecord>>();
  const byClientId = new Map<string, ServerRecord>();
  const pushes: { ops: WireOperation[]; deviceId?: string }[] = [];
  const pulls: { collection: string; cursor: string | null }[] = [];

  let tick = 0;
  let ids = 0;
  // Monotonic and unique: the cursor is (updatedAt, _id), so two records sharing a timestamp
  // would make a page boundary ambiguous.
  const stamp = () => new Date(Date.parse(startedAt) + (tick += 1) * 1000).toISOString();
  const nextId = () => `${idPrefix}-${String((ids += 1)).padStart(6, '0')}`;

  const collection = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const touch = (record: ServerRecord) => {
    record.version = num(record.version) + 1;
    record.updatedAt = stamp();
    return record;
  };

  // -- failure controls -----------------------------------------------------------------

  const control = {
    offline: false,
    pushFailures: 0,
    pullFailures: 0,
    failureStatus: undefined as number | undefined,
    /** Ops applied before the request dies — the non-atomic batch, seen from the client. */
    failAfterOps: null as number | null,
    /** Accepted, but the result never reaches the device. */
    omitted: new Set<string>()
  };

  const transportFailure = (kind: 'push' | 'pull') => {
    if (control.offline) return new Error('Network Error');
    const counter = kind === 'push' ? 'pushFailures' : ('pullFailures' as const);
    if (control[counter] > 0) {
      control[counter] -= 1;
      return control.failureStatus ? httpError(control.failureStatus) : new Error('socket hang up');
    }
    return null;
  };

  // -- push -----------------------------------------------------------------------------

  const invoicesOf = (customerId: string) =>
    [...collection('invoices').values()]
      .filter((invoice) => !invoice.deletedAt && String(invoice.customerId ?? invoice.customer ?? '') === customerId)
      .sort((a, b) => String(a.date ?? a.updatedAt).localeCompare(String(b.date ?? b.updatedAt)));

  const applyStock = (items: unknown, direction: number) => {
    for (const item of Array.isArray(items) ? (items as Record<string, unknown>[]) : []) {
      const product = item.productId ? collection('products').get(String(item.productId)) : undefined;
      if (!product || product.trackStock === false) continue;
      // Oversell is recorded, not refused: the goods left the shop before the device could ask.
      product.stockQuantity = num(product.stockQuantity) + direction * num(item.quantity);
      touch(product);
    }
  };

  const createInvoice = (payload: Record<string, unknown>): Record<string, unknown> => {
    const documentNumber = payload.documentNumber ?? payload.invoiceNumber;
    if (documentNumber) {
      const clash = [...collection('invoices').values()].find(
        (invoice) => !invoice.deletedAt && (invoice.documentNumber ?? invoice.invoiceNumber) === documentNumber
      );
      if (clash) {
        throw new Refusal(409, 'DOCUMENT_NUMBER_DUPLICATE', `Document number ${documentNumber} is already used`, 'conflict');
      }
    }

    const total = money(num(payload.total));
    return {
      ...payload,
      total,
      paidAmount: 0,
      balanceDue: total,
      paymentStatus: 'unpaid',
      documentStatus: payload.documentStatus ?? 'issued'
    };
  };

  /** The server's own allocation. The client's `provisionalAllocations` is discarded here. */
  const createPayment = (entity: string, payload: Record<string, unknown>): Record<string, unknown> => {
    const amount = money(num(payload.amount));
    if (!(amount > 0)) throw new Refusal(422, 'PAYMENT_AMOUNT_INVALID', 'Payment amount must be greater than zero');

    let targets: ServerRecord[] = [];
    if (payload.invoiceId) {
      const invoice = collection('invoices').get(String(payload.invoiceId));
      if (!invoice) throw new Refusal(404, 'INVOICE_NOT_FOUND', 'That invoice does not exist');
      if (invoice.documentStatus === 'cancelled' || invoice.documentStatus === 'void') {
        // A conflict, not a rejection: the device keeps the receipt and a person decides.
        throw new Refusal(409, 'INVOICE_CANCELLED', 'That invoice was cancelled', 'conflict');
      }
      targets = [invoice];
    } else {
      const named = Array.isArray(payload.invoiceIds) ? (payload.invoiceIds as unknown[]).map(String) : [];
      const listed = named.map((id) => collection('invoices').get(id)).filter((invoice): invoice is ServerRecord => !!invoice);
      const all = named.length ? listed : invoicesOf(String(payload.customerId ?? ''));
      // A bill cancelled since the device last looked is skipped, not refused — the rest of
      // the collection is still good money.
      targets = all.filter((invoice) => invoice.documentStatus !== 'cancelled' && num(invoice.balanceDue) > 0);
    }

    let remaining = amount;
    const allocations: { invoice: string; amount: number }[] = [];
    for (const invoice of targets) {
      if (remaining <= 0) break;
      const applied = money(Math.min(remaining, num(invoice.balanceDue)));
      if (applied <= 0) continue;
      remaining = money(remaining - applied);
      invoice.paidAmount = money(num(invoice.paidAmount) + applied);
      invoice.balanceDue = money(num(invoice.total) - num(invoice.paidAmount));
      invoice.paymentStatus = paymentStatusFor(num(invoice.paidAmount), num(invoice.total));
      touch(invoice);
      allocations.push({ invoice: String(invoice._id), amount: applied });
    }

    const { provisionalAllocations, ...rest } = payload;
    return {
      ...rest,
      type: entity === 'customerPayment' ? 'customer' : 'invoice',
      amount,
      allocatedAmount: money(amount - remaining),
      // Overpayment is kept as credit. Refusing the cash would not un-receive it.
      unappliedAmount: remaining,
      allocations
    };
  };

  const runOperation = (op: WireOperation): PushResult => {
    const name = COLLECTION_OF[op.entity];
    if (!name) throw new Refusal(400, 'UNKNOWN_ENTITY', `Unknown entity ${op.entity}`);
    const table = collection(name);
    const payload = (op.payload ?? {}) as Record<string, unknown>;

    if (op.opType === 'create') {
      const replay = op.clientId ? byClientId.get(op.clientId) : undefined;
      if (replay) {
        // The response was lost, not the write. Same record, same id, nothing taken twice.
        return { opId: op.opId, status: 'ok', serverId: replay._id, version: replay.version, serverUpdatedAt: replay.updatedAt };
      }

      const body =
        name === 'invoices'
          ? createInvoice(payload)
          : name === 'payments'
            ? createPayment(op.entity, payload)
            : ({ ...payload } as ServerRecord);

      const record: ServerRecord = { ...body, _id: nextId(), version: 1, updatedAt: stamp(), clientId: op.clientId ?? null };
      delete (record as Record<string, unknown>).targetId;
      table.set(record._id, record);
      if (op.clientId) byClientId.set(op.clientId, record);
      if (name === 'invoices') applyStock(record.items, -1);

      return { opId: op.opId, status: 'ok', serverId: record._id, version: record.version, serverUpdatedAt: record.updatedAt };
    }

    const target = op.targetId ? table.get(op.targetId) : op.clientId ? byClientId.get(op.clientId) : undefined;
    if (!target) throw new Refusal(404, 'NOT_FOUND', 'That record does not exist here');

    if (op.opType === 'delete') {
      target.deletedAt = stamp();
      touch(target);
    } else {
      // No baseVersion on the wire, so this is last-write-wins — the same as production.
      Object.assign(target, payload);
      touch(target);
    }

    return { opId: op.opId, status: 'ok', serverId: target._id, version: target.version, serverUpdatedAt: target.updatedAt };
  };

  const push: PushTransport = async (body) => {
    const failure = transportFailure('push');
    if (failure) throw failure;

    pushes.push({ ops: body.ops, deviceId: body.deviceId });
    const results: PushResult[] = [];

    for (const [index, op] of body.ops.entries()) {
      if (control.failAfterOps != null && index >= control.failAfterOps) {
        // Applied what it applied, then the connection died. The client hears nothing about
        // any of it, including the ops that succeeded.
        control.failAfterOps = null;
        throw new Error('socket hang up');
      }

      try {
        const result = runOperation(op);
        if (!control.omitted.has(op.opId)) results.push(result);
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        results.push({
          opId: op.opId,
          status: error.status,
          statusCode: error.statusCode,
          code: error.code,
          message: error.message
        });
      }
    }

    return { results, serverTime: stamp() } as PushResponse;
  };

  // -- pull -----------------------------------------------------------------------------

  const keyOf = (record: ServerRecord) => `${record.updatedAt}|${record._id}`;

  const pull: PullTransport = async ({ collection: name, cursor, limit }) => {
    const failure = transportFailure('pull');
    if (failure) throw failure;

    pulls.push({ collection: name, cursor });
    const ordered = [...collection(name).values()]
      .map((record) => ({ record, key: keyOf(record) }))
      .filter((entry) => !cursor || entry.key > cursor)
      .sort((a, b) => a.key.localeCompare(b.key));

    const page = ordered.slice(0, limit);
    return {
      // A tombstone travels as identity only, exactly as the server sends it.
      records: page.map(({ record }) =>
        record.deletedAt
          ? { _id: record._id, version: record.version, updatedAt: record.updatedAt, deletedAt: record.deletedAt, clientId: record.clientId }
          : { ...record }
      ),
      nextCursor: page.length ? page[page.length - 1].key : (cursor ?? null),
      hasMore: ordered.length > page.length
    } as PullPage;
  };

  return {
    push,
    pull,
    // -- inspection
    records: (name: string) => [...collection(name).values()],
    live: (name: string) => [...collection(name).values()].filter((record) => !record.deletedAt),
    record: (name: string, id: string) => collection(name).get(id) ?? null,
    byClientId: (clientId: string) => byClientId.get(clientId) ?? null,
    count: (name: string) => collection(name).size,
    pushes,
    pulls,
    sentOps: () => pushes.flatMap((request) => request.ops),
    // -- controls
    goOffline: () => {
      control.offline = true;
    },
    goOnline: () => {
      control.offline = false;
    },
    failNextPushes: (times: number, status?: number) => {
      control.pushFailures = times;
      control.failureStatus = status;
    },
    failNextPulls: (times: number, status?: number) => {
      control.pullFailures = times;
      control.failureStatus = status;
    },
    /** Applies the first `count` ops of the next batch, then drops the connection. */
    dieAfterOps: (count: number) => {
      control.failAfterOps = count;
    },
    /** Applies the op but never reports it — the acknowledgement lost on the way back. */
    swallowResultFor: (opId: string) => control.omitted.add(opId),
    /** Seeds a record without a push, standing in for another client or the web app. */
    seed: (name: string, doc: Record<string, unknown>): ServerRecord => {
      const record: ServerRecord = { ...doc, _id: String(doc._id ?? nextId()), version: 1, updatedAt: stamp(), clientId: null };
      collection(name).set(record._id, record);
      return record;
    },
    /** Mutates a record the way another till would, so a pull carries a real change. */
    mutate: (name: string, id: string, patch: Record<string, unknown>) => {
      const record = collection(name).get(id);
      if (!record) throw new Error(`No ${name} ${id} on the server`);
      Object.assign(record, patch);
      return touch(record);
    }
  };
};

export type FakeServer = ReturnType<typeof createFakeServer>;

// -- device ------------------------------------------------------------------------------

export type TestDeviceOptions = {
  server: FakeServer;
  businessId?: string;
  deviceId?: string;
  /** 1 keeps the plain number series; 2+ gets its own GST segment. */
  deviceIndex?: number;
  startedAt?: string;
  collections?: string[];
};

/**
 * One device: its own SQLite file, its own numbering series, its own engines, pointed at the
 * shared server. Two of these is a multi-device test.
 *
 * The clock is mutable because the outbox gates a retry on `next_attempt_at`: a frozen clock
 * makes every backoff permanent and every retry test a false pass.
 */
export const createTestDevice = async ({
  server,
  businessId = 'biz-1',
  deviceId = 'dev-1',
  deviceIndex = 1,
  startedAt = '2026-08-02T10:00:00.000Z',
  collections
}: TestDeviceOptions) => {
  const { raw, txn, close } = await openTestDatabase();

  let nowMs = Date.parse(startedAt);
  const clock = () => new Date(nowMs).toISOString();

  await saveDeviceSeries({ deviceId, deviceIndex, prefix: 'INV', documentType: 'invoice' }, { txn, now: clock() });

  const push = createPushEngine({ businessId, deviceId, txn, clock, transport: server.push });
  const pull = createPullEngine({ businessId, deviceId, txn, clock, transport: server.pull, collections });

  return {
    raw: raw as DatabaseSync,
    txn: txn as SQLiteDatabase,
    businessId,
    deviceId,
    push,
    pull,
    clock,
    /** Moves this device's clock forward, releasing any backoff that has expired. */
    advance: (ms: number) => {
      nowMs += ms;
      return clock();
    },
    /** What the app does on a sync: push first, then pull, so the echo lands on our own rows. */
    sync: async () => {
      const pushed = await push.push();
      const pulled = await pull.pull();
      return { pushed, pulled };
    },
    /** Options object every local write in these suites takes. */
    options: () => ({ businessId, txn: txn as SQLiteDatabase, now: clock() }),
    close
  };
};

export type TestDevice = Awaited<ReturnType<typeof createTestDevice>>;
