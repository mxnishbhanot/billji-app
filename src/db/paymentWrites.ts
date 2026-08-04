import type { SQLiteDatabase } from 'expo-sqlite';
import { getCustomer, getCustomerByServerId } from './customerRepository';
import type { LocalWriteOptions } from './entityWrites';
import { DatabaseError, LocalRuleError } from './errors';
import { getInvoice, getInvoiceByServerId, type InvoiceRecord } from './invoiceRepository';
import type { MongoDoc } from './mappers';
import { enqueueOperation, listOperations } from './outbox';
import {
  allocatedTo,
  pendingPaymentAllocations,
  projectedBalanceDue,
  type PendingAllocation
} from './paymentProjection';
import { createPayment, type PaymentDoc, type PaymentRecord } from './paymentRepository';
import { withTransaction } from './transaction';

/**
 * Taking money at the counter with no signal.
 *
 * A payment is the one record in this app that can never be rejected. Cash physically crossed
 * the counter; refusing to store it does not un-receive it, it just means the books disagree
 * with the drawer and the customer is billed twice. So the receipt is written locally and
 * queued, and every decision that could go wrong is left to the server:
 *
 *   the device records   the receipt, and which bills it was taken against
 *   the server computes  the allocation, the customer balance and the ledger entries
 *
 * The split across invoices *is* computed here, but only as a provisional record of intent —
 * it is what the user was shown when they took the cash, and it drives the local projection
 * (db/paymentProjection). The server recomputes it against balances this device cannot see,
 * including invoices settled from another till, and its answer replaces ours on the next pull.
 *
 * No edit path and no delete path. A payment recorded in error is reversed by a server action
 * (refund, cancel), never quietly rewritten — see conflictResolver's payments policy.
 */

export type PaymentWriteOptions = LocalWriteOptions;

export type RecordedPayment = { record: PaymentRecord; invoiceLocalIds: string[]; unapplied: number };

const money = (value: number) => Math.round(value * 100) / 100;

const invoiceByAnyId = async (id: string, db: SQLiteDatabase) =>
  (await getInvoiceByServerId(id, db)) ?? (await getInvoice(id, db));

const customerByAnyId = async (id: string, db: SQLiteDatabase) =>
  (await getCustomerByServerId(id, db)) ?? (await getCustomer(id, db));

/** The unsent operations for the records this receipt names — what it queues behind. */
const referencedOperations = async (
  businessId: string,
  referenced: { entityType: string; localId: string }[],
  db: SQLiteDatabase
): Promise<string[]> => {
  const opIds: string[] = [];
  const seen = new Set<string>();

  for (const { entityType, localId } of referenced) {
    const key = `${entityType}:${localId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const operations = await listOperations({
      businessId,
      entityType,
      entityLocalId: localId,
      status: ['pending', 'inflight', 'failed', 'conflict'],
      txn: db
    });
    if (operations.length) opIds.push(operations[operations.length - 1].opId);
  }

  return opIds;
};

/** Refused for the same reasons the server refuses, so one screen handles both paths. */
const assertPayable = (invoice: InvoiceRecord, amount: number) => {
  if (!(amount > 0)) {
    throw new LocalRuleError('PAYMENT_AMOUNT_INVALID', 'Payment amount must be greater than zero');
  }

  const status = String(invoice.doc?.documentStatus ?? '');
  if (status === 'cancelled' || status === 'void') {
    throw new LocalRuleError(
      'INVOICE_CANCELLED',
      `Cannot record payment for a cancelled invoice (${invoice.doc?.documentNumber ?? ''})`.trim()
    );
  }
};

/**
 * Writes the receipt and queues it. Both in one transaction: a receipt with no queued push is
 * money the server never hears about, and a push with no receipt is a screen that forgot.
 */
const writeReceipt = async (
  db: SQLiteDatabase,
  {
    businessId,
    now,
    doc,
    opPayload,
    dependsOn
  }: {
    businessId: string;
    now: string;
    doc: PaymentDoc;
    opPayload: MongoDoc;
    dependsOn: string[];
  }
): Promise<PaymentRecord> => {
  const record = await createPayment(doc, { businessId, now, txn: db });

  await enqueueOperation(
    {
      businessId,
      entityType: 'payments',
      entityLocalId: record.localId,
      opType: 'create',
      // The op payload is the API's request body, not the stored row: the server wants the
      // intent (how much, against what) and computes everything else itself. clientId is what
      // makes a retry after a lost response return the original receipt instead of a second.
      payload: { ...opPayload, clientId: record.localId },
      dependsOn
    },
    { txn: db, now }
  );

  return record;
};

/**
 * Money against one invoice.
 *
 * Overpayment is accepted, as the server accepts it: the excess becomes customer credit. That
 * is the only honest handling — if another till has already settled the bill, rejecting the
 * cash would leave it unaccounted for.
 */
export const recordInvoicePaymentLocally = async (
  invoiceId: string,
  payload: {
    amount: number;
    method?: string;
    reference?: string;
    notes?: string;
    receivedAt?: string;
    type?: string;
  },
  options: PaymentWriteOptions
): Promise<RecordedPayment> =>
  withTransaction(async (db) => {
    const now = options.now ?? new Date().toISOString();
    const amount = money(Number(payload.amount) || 0);

    const invoice = await invoiceByAnyId(invoiceId, db);
    // Not held locally: the caller falls through to the network rather than guessing at a
    // balance for a document this device has never seen.
    if (!invoice) throw new DatabaseError('DB_QUERY_FAILED', 'That invoice is not held on this device');
    assertPayable(invoice, amount);

    const allocations = await pendingPaymentAllocations(options.businessId, db);
    const balance = projectedBalanceDue(
      invoice.doc ?? {},
      allocatedTo(allocations, [invoice.serverId, invoice.localId], invoice.serverUpdatedAt)
    );
    const allocated = money(Math.min(amount, balance));
    const unapplied = money(amount - allocated);

    const customerServerId = (invoice.doc?.customer as string | undefined) ?? undefined;
    const customerLocalId = (invoice.doc?.customerLocalId as string | undefined) ?? undefined;
    if (unapplied > 0 && !customerServerId && !customerLocalId) {
      // The server's rule: credit has to belong to somebody.
      throw new LocalRuleError('OVERPAYMENT_NEEDS_CUSTOMER', 'Overpayment requires a saved customer');
    }

    const referenced = [
      ...(invoice.serverId ? [] : [{ entityType: 'invoices', localId: invoice.localId }]),
      ...(customerLocalId && !customerServerId ? [{ entityType: 'customers', localId: customerLocalId }] : [])
    ];

    const record = await writeReceipt(db, {
      businessId: options.businessId,
      now,
      doc: {
        type: (payload.type as PaymentDoc['type']) ?? 'receipt',
        method: (payload.method as PaymentDoc['method']) ?? 'cash',
        status: 'completed',
        amount,
        currency: 'INR',
        reference: payload.reference ?? '',
        notes: payload.notes ?? '',
        receivedAt: payload.receivedAt ?? now,
        // Both sides of each reference: the row is found by whichever id the device holds,
        // and the push rewrites the payload's copy once the record has synced.
        salesDocument: invoice.serverId ?? undefined,
        invoice: invoice.serverId ?? undefined,
        invoiceLocalId: invoice.localId,
        customer: customerServerId,
        customerLocalId,
        // Provisional, and never pushed as truth — see conflictResolver.SERVER_OWNED.payments.
        allocatedAmount: allocated,
        unappliedAmount: unapplied,
        provisionalAllocations: allocated
          ? [{ invoiceLocalId: invoice.localId, invoiceServerId: invoice.serverId ?? null, amount: allocated }]
          : []
      } as PaymentDoc,
      opPayload: {
        invoiceId: invoice.serverId ?? invoice.localId,
        amount,
        method: payload.method ?? 'cash',
        ...(payload.type ? { type: payload.type } : {}),
        ...(payload.reference ? { reference: payload.reference } : {}),
        ...(payload.notes ? { notes: payload.notes } : {}),
        receivedAt: payload.receivedAt ?? now
      },
      dependsOn: [...(await referencedOperations(options.businessId, referenced, db)), ...(options.dependsOn ?? [])]
    });

    return { record, invoiceLocalIds: [invoice.localId], unapplied };
  }, options.txn);

/**
 * One payment settling several of a customer's bills — the dues-collection path.
 *
 * Filled greedily in the order given, which is the order the screen offered them (oldest
 * first, then the bill just issued). The server repeats the same walk against its own
 * balances; where they differ, the server wins and the difference shows up on the next pull.
 */
export const recordCustomerPaymentLocally = async (
  customerId: string,
  payload: {
    amount: number;
    invoiceIds: string[];
    method?: string;
    reference?: string;
    notes?: string;
    receivedAt?: string;
    allowCredit?: boolean;
  },
  options: PaymentWriteOptions
): Promise<RecordedPayment> =>
  withTransaction(async (db) => {
    const now = options.now ?? new Date().toISOString();
    const amount = money(Number(payload.amount) || 0);
    if (!(amount > 0)) {
      throw new LocalRuleError('PAYMENT_AMOUNT_INVALID', 'Payment amount must be greater than zero');
    }
    if (!payload.invoiceIds?.length) {
      throw new LocalRuleError('INVOICES_REQUIRED', 'At least one invoice is required');
    }

    const seenInvoiceIds = new Set<string>();
    for (const invoiceId of payload.invoiceIds) {
      const key = String(invoiceId);
      if (seenInvoiceIds.has(key)) {
        throw new LocalRuleError('DUPLICATE_INVOICE_IDS', 'Duplicate invoice ids are not allowed in one payment');
      }
      seenInvoiceIds.add(key);
    }

    const customer = await customerByAnyId(customerId, db);
    if (!customer) throw new DatabaseError('DB_QUERY_FAILED', 'That customer is not held on this device');

    const allocations = await pendingPaymentAllocations(options.businessId, db);
    const targets: { invoice: InvoiceRecord; balance: number; allocated: number }[] = [];

    for (const invoiceId of payload.invoiceIds) {
      const invoice = await invoiceByAnyId(invoiceId, db);
      if (!invoice) throw new DatabaseError('DB_QUERY_FAILED', 'One of those invoices is not held on this device');
      assertPayable(invoice, amount);

      targets.push({
        invoice,
        balance: projectedBalanceDue(
          invoice.doc ?? {},
          allocatedTo(allocations, [invoice.serverId, invoice.localId], invoice.serverUpdatedAt)
        ),
        allocated: 0
      });
    }

    let remaining = amount;
    for (const target of targets) {
      target.allocated = money(Math.min(remaining, target.balance));
      remaining = money(remaining - target.allocated);
    }
    const unapplied = money(remaining);

    // The collection sheet passes allowCredit: false when it is purely settling dues, and an
    // overpayment there is a typo rather than an intent.
    if (unapplied > 0 && payload.allowCredit === false) {
      throw new LocalRuleError(
        'CREDIT_NOT_ALLOWED',
        "Amount exceeds the selected invoices' outstanding balance"
      );
    }

    const last = targets[targets.length - 1].invoice;
    const referenced = [
      ...(customer.serverId ? [] : [{ entityType: 'customers', localId: customer.localId }]),
      ...targets.filter((target) => !target.invoice.serverId).map((target) => ({ entityType: 'invoices', localId: target.invoice.localId }))
    ];

    const record = await writeReceipt(db, {
      businessId: options.businessId,
      now,
      doc: {
        type: 'receipt',
        method: (payload.method as PaymentDoc['method']) ?? 'cash',
        status: 'completed',
        amount,
        currency: 'INR',
        reference: payload.reference ?? '',
        notes: payload.notes ?? '',
        receivedAt: payload.receivedAt ?? now,
        // The receipt hangs off the last bill it touched, matching how the server stores it.
        salesDocument: last.serverId ?? undefined,
        invoice: last.serverId ?? undefined,
        invoiceLocalId: last.localId,
        customer: customer.serverId ?? undefined,
        customerLocalId: customer.localId,
        allocatedAmount: money(amount - unapplied),
        unappliedAmount: unapplied,
        provisionalAllocations: targets
          .filter((target) => target.allocated > 0)
          .map((target) => ({
            invoiceLocalId: target.invoice.localId,
            invoiceServerId: target.invoice.serverId ?? null,
            amount: target.allocated
          }))
      } as PaymentDoc,
      opPayload: {
        customerId: customer.serverId ?? customer.localId,
        invoiceIds: targets.map((target) => target.invoice.serverId ?? target.invoice.localId),
        amount,
        method: payload.method ?? 'cash',
        ...(payload.reference ? { reference: payload.reference } : {}),
        ...(payload.notes ? { notes: payload.notes } : {}),
        ...(payload.allowCredit === false ? { allowCredit: false } : {}),
        receivedAt: payload.receivedAt ?? now
      },
      dependsOn: [...(await referencedOperations(options.businessId, referenced, db)), ...(options.dependsOn ?? [])]
    });

    return { record, invoiceLocalIds: targets.map((target) => target.invoice.localId), unapplied };
  }, options.txn);

export type { PendingAllocation };
