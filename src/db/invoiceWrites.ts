import type { SQLiteDatabase } from 'expo-sqlite';
import { WALK_IN_CUSTOMER_NAME } from '@/constants/customers';
import { getCustomer, getCustomerByServerId } from './customerRepository';
import { createEntityWrites, type LocalWriteOptions } from './entityWrites';
import { DatabaseError, LocalRuleError } from './errors';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceByServerId,
  updateInvoice,
  type InvoiceDoc,
  type InvoiceRecord
} from './invoiceRepository';
import { allocateDocumentNumber } from './invoiceNumbering';
import type { MongoDoc } from './mappers';
import { listOperations } from './outbox';
import { getProduct, getProductByServerId } from './productRepository';
import { deltasFor, oversellCheck, pendingStockDeltasByProduct, projectStock } from './stockProjection';
import { withTransaction } from './transaction';

/**
 * Issuing an invoice with no signal.
 *
 * One transaction does four things or none of them: takes the next number from this device's
 * series, writes the document, queues the push, and — because both come out of the same
 * queue — makes the stock the sale consumed visible to the next projection. A number
 * allocated without a document is a gap in a GST series; a document without a queued push is
 * a sale the server never hears about.
 *
 * Create only, and that is the domain, not a shortcut. An issued invoice is a legal
 * instrument that may already be printed, sent and filed against: it is immutable. A mistake
 * is corrected by a cancellation or a credit note, both of which reverse stock and ledger
 * entries server-side, so they stay online — see conflictResolver's invoice policy.
 *
 * What the device computes is provisional and labelled as such. The server owns the totals,
 * the CGST/SGST/IGST split, the place of supply, the ledger and the stock level; it recomputes
 * all of it on arrival. The local figures exist so a bill written at the counter shows an
 * amount instead of a zero, and they are never pushed back
 * (conflictResolver.SERVER_OWNED.invoices).
 */

export type InvoiceWriteOptions = LocalWriteOptions & {
  /**
   * Pass true once the user has confirmed a sale the stock does not cover. Left unset, a short
   * sale is refused with the shortfall — the same contract the server has, so the screen shows
   * the same confirmation whether the bill is being written locally or online.
   */
  allowOversell?: boolean;
};

export type InvoiceLineWarning = {
  productId: string;
  name: string;
  requested: number;
  available: number;
  shortfall: number;
};

export type IssuedInvoice = { record: InvoiceRecord; warnings: InvoiceLineWarning[] };

const writes = createEntityWrites<InvoiceDoc>({
  entity: 'invoices',
  get: getInvoice,
  getByServerId: getInvoiceByServerId,
  create: createInvoice,
  update: updateInvoice,
  softDelete: deleteInvoice,
  discardReason: 'Document was discarded before it reached the server'
});

export const findInvoiceByAnyId = writes.findByAnyId;

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * What the document is worth, as this device can compute it: line values, per-line tax, and
 * the discount. No GST split — that depends on the place of supply, which the server resolves.
 */
export const provisionalTotals = (
  items: { quantity?: number; price?: number; taxRate?: number }[] = [],
  {
    taxRate,
    discountType,
    discountValue = 0
  }: { taxRate?: number; discountType?: 'flat' | 'percentage'; discountValue?: number } = {}
) => {
  let subtotal = 0;
  let tax = 0;

  for (const item of items) {
    const line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    const rate = Number(item.taxRate ?? taxRate) || 0;
    subtotal += line;
    tax += (line * rate) / 100;
  }

  const discount =
    discountType === 'percentage' ? (subtotal * (Number(discountValue) || 0)) / 100 : Number(discountValue) || 0;
  const capped = Math.min(discount, subtotal);

  return {
    subtotal: money(subtotal),
    tax: { rate: Number(taxRate) || 0, amount: money(tax) },
    discount: { type: discountType ?? 'flat', value: Number(discountValue) || 0, amount: money(capped) },
    total: money(subtotal + tax - capped)
  };
};

/** Finds a record by whichever id the screen is holding — server id once synced, local before. */
const productByAnyId = async (id: string, db: SQLiteDatabase) =>
  (await getProductByServerId(id, db)) ?? (await getProduct(id, db));

const customerByAnyId = async (id: string, db: SQLiteDatabase) =>
  (await getCustomerByServerId(id, db)) ?? (await getCustomer(id, db));

/** The unsent creates for the records this document names — what it has to queue behind. */
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
    // The last one: everything before it is already a dependency of that one.
    if (operations.length) opIds.push(operations[operations.length - 1].opId);
  }

  return opIds;
};

/**
 * Writes the invoice, allocates its number, and queues it.
 *
 * The lines are resolved against the local catalogue so the document carries a real name,
 * SKU, HSN and tax rate for each product — a stored invoice has to render on its own, with no
 * joins, since the products it names may be edited or deleted afterwards.
 *
 * Overselling is allowed and reported, never blocked. Both units of the last item genuinely
 * left the shop; a refused invoice does not un-sell them, it just means the books disagree
 * with the cash drawer and the customer holds a document the business has no record of.
 */
export const createInvoiceLocally = async (
  input: MongoDoc,
  options: InvoiceWriteOptions
): Promise<IssuedInvoice> =>
  withTransaction(async (db) => {
    const now = options.now ?? new Date().toISOString();
    const date = (input.date as string) ?? now;
    const documentType = (input.documentType as string) ?? 'invoice';
    const referenced: { entityType: string; localId: string }[] = [];

    // -- the customer, and the snapshot the document keeps forever ------------------------
    const customerId = (input.customerId ?? input.customer) as string | undefined;
    const customer = customerId ? await customerByAnyId(customerId, db) : null;
    if (customerId && !customer) {
      throw new DatabaseError('DB_QUERY_FAILED', 'That customer is not held on this device');
    }
    if (customer && !customer.serverId) referenced.push({ entityType: 'customers', localId: customer.localId });

    const snapshot = (input.customerSnapshot as MongoDoc) ?? {
      // A walk-in/cash sale has no customer: label it the way the server does, so the
      // offline document reads the same as the one the server would have written.
      ...(customer ? customer.doc : { name: WALK_IN_CUSTOMER_NAME, phone: '' }),
      // The snapshot is a copy of the customer as they were at issue, not a reference.
      _id: undefined
    };

    // -- the lines, and the stock they consume --------------------------------------------
    const pending = await pendingStockDeltasByProduct(options.businessId, db);
    const warnings: InvoiceLineWarning[] = [];
    const items: MongoDoc[] = [];

    for (const raw of Array.isArray(input.items) ? (input.items as MongoDoc[]) : []) {
      const productId = raw.productId as string | undefined;
      const product = productId ? await productByAnyId(productId, db) : null;
      const quantity = Number(raw.quantity) || 0;

      if (!product) {
        // A custom line: typed at the counter, not in the catalogue, and it moves no stock.
        items.push({ ...raw, productId: undefined, isCustom: true });
        continue;
      }

      if (!product.serverId) referenced.push({ entityType: 'products', localId: product.localId });

      const doc = (product.doc ?? {}) as MongoDoc;
      items.push({
        // The id the caller gave us, so the push can rewrite it once the product has synced.
        productId: product.serverId ?? product.localId,
        name: raw.name ?? doc.name,
        sku: raw.sku ?? doc.sku ?? '',
        hsn: raw.hsn ?? doc.hsn ?? '',
        unit: raw.unit ?? doc.unit,
        quantity,
        price: raw.price ?? doc.price,
        // An explicit rate always wins, including 0 — that is how an exempt line is billed.
        taxRate: raw.taxRate ?? (Number(doc.taxRate) > 0 ? doc.taxRate : undefined),
        isCustom: false
      });

      if (doc.trackStock === false) continue;

      const projected = projectStock(
        Number(doc.stockQuantity) || 0,
        deltasFor(pending, [product.serverId, product.localId])
      );
      const { oversold, shortfall } = oversellCheck(projected, quantity);
      if (oversold) {
        warnings.push({
          productId: product.serverId ?? product.localId,
          name: String(doc.name ?? ''),
          requested: quantity,
          available: projected,
          shortfall
        });
      }
    }

    if (!items.length) throw new DatabaseError('DB_QUERY_FAILED', 'An invoice needs at least one item');

    // Not a block — a question. The user confirms the force sale and the retry carries
    // allowOversell, exactly as it does against the server.
    if (warnings.length && options.allowOversell !== true) {
      throw new LocalRuleError('INSUFFICIENT_STOCK', 'Some products do not have enough app stock', {
        code: 'INSUFFICIENT_STOCK',
        items: warnings
      });
    }

    // -- the number ----------------------------------------------------------------------
    const allocated = await allocateDocumentNumber({ documentType, date, txn: db, now });
    if (!allocated) {
      // No series allocated yet, so this device cannot mint a compliant number. The caller
      // falls back to the online path rather than inventing one.
      throw new DatabaseError('DB_QUERY_FAILED', 'This device has no invoice numbering series yet');
    }

    const totals = provisionalTotals(items as { quantity?: number; price?: number; taxRate?: number }[], {
      taxRate: input.taxRate as number | undefined,
      discountType: input.discountType as 'flat' | 'percentage' | undefined,
      discountValue: input.discountValue as number | undefined
    });

    const dependsOn = [
      ...(await referencedOperations(options.businessId, referenced, db)),
      ...(options.dependsOn ?? [])
    ];

    const record = await writes.createLocally(
      // The document is assembled from an untyped screen payload plus the fields resolved
      // above; `InvoiceDoc` is the shape it lands in, not the shape the caller supplied.
      {
        ...input,
        documentType,
        documentNumber: allocated.documentNumber,
        // Invoices keep the legacy field too; other document types must leave it unset or
        // they collide with the invoice series' unique index server-side.
        ...(documentType === 'invoice' ? { invoiceNumber: allocated.documentNumber } : {}),
        date,
        dueDate: (input.dueDate as string) ?? null,
        // Both sides of the reference: the local id resolves while the customer is unsynced,
        // the server id once it is, and the push rewrites the payload's copy at send time.
        customer: customer?.serverId ?? undefined,
        customerLocalId: customer?.localId,
        customerId: customer ? (customer.serverId ?? customer.localId) : undefined,
        customerSnapshot: snapshot,
        items,
        ...totals,
        paidAmount: 0,
        balanceDue: totals.total,
        status: 'pending',
        documentStatus: 'issued',
        paymentStatus: 'unpaid',
        fulfillmentStatus: 'pending',
        // The server refuses a sale below stock unless told the goods have already gone. They
        // have: this document was handed to a customer before the device could ask.
        allowOversell: true
      } as unknown as InvoiceDoc,
      { ...options, txn: db, now, dependsOn }
    );

    return { record, warnings };
  }, options.txn);
