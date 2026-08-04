import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Customer,
  CustomerOutstanding,
  CustomerQuery,
  Expense,
  ExpenseCategory,
  ExpenseListResponse,
  Invoice,
  InvoiceQuery,
  OutstandingInvoice,
  Page,
  Pagination,
  Payment,
  Product,
  ProductQuery,
  PurchaseBill,
  Vendor
} from '../types';
import { openDatabase } from './connection';
import { wrapDatabaseError } from './errors';
import { fromRow, normalizePhone, type EntityRow, type EntityType, type MongoDoc, type SqliteValue } from './mappers';
import { getSetting } from './settings';
import {
  allocatedTo,
  collectedFrom,
  pendingPaymentAllocations,
  projectInvoicePayment,
  projectedBalanceDue
} from './paymentProjection';
import { deltasFor, pendingStockDeltasByProduct, projectStock } from './stockProjection';

/**
 * The screens' read model: the same page objects the REST API returns, assembled from the
 * local tables instead of a request.
 *
 * Deliberately not built on the repositories. A repository is keyset-paged and entity-shaped;
 * a screen is page-numbered and filter-shaped (`stockStatus`, `billingStatus`, a sort chip).
 * Bending one into the other would distort both, so this module owns screen-shaped SQL over
 * the promoted columns — which is exactly what those columns exist for.
 *
 * Every filter combination the API supports is either answered here or declared unsupported
 * by `canServeLocally`, and an unsupported one falls back to the network. A wrong local
 * answer is worse than a slow correct one: `top-sales` needs sales aggregates the device does
 * not hold, and quietly returning a name-sorted list instead would be a lie.
 */

const connect = async (txn?: SQLiteDatabase) => txn ?? (await openDatabase());

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

const paginate = (page: number, limit: number, total: number): Pagination => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page * limit < total;
  return { page, limit, total, totalPages, hasMore, nextPage: hasMore ? page + 1 : null };
};

type Filters = { where: string[]; params: SqliteValue[] };

const base = (businessId: string): Filters => ({
  where: ['business_id = ?', 'deleted_at IS NULL'],
  params: [businessId]
});

const like = (filters: Filters, columns: string[], term: string) => {
  const value = `%${escapeLike(term)}%`;
  filters.where.push(`(${columns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
  columns.forEach(() => filters.params.push(value));
};

const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Reads one page and its total in the two queries a page-numbered list needs. */
const readPage = async <T>(
  entity: EntityType,
  filters: Filters,
  order: string,
  page: number,
  limit: number,
  txn?: SQLiteDatabase,
  /** Last chance to adjust a document with something only the row knows — see the stock projection. */
  decorate?: (doc: MongoDoc, row: EntityRow) => MongoDoc
): Promise<{ rows: T[]; pagination: Pagination }> => {
  const db = await connect(txn);
  const where = filters.where.join(' AND ');

  const totalRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${entity} WHERE ${where}`,
    filters.params
  );
  const rows = await db.getAllAsync<EntityRow>(
    `SELECT * FROM ${entity} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...filters.params, limit, (page - 1) * limit]
  );

  return {
    // A record created offline has no server id yet, and a screen still needs something to
    // key rows by and to name in the edit it makes next. The local id stands in until the
    // push comes back with the real one — see productWrites.findProductByAnyId.
    rows: rows
      .map((row) => {
        const doc = fromRow(row).doc;
        if (!doc) return null;
        const withId = { ...doc, _id: doc._id ?? String(row.local_id) };
        return (decorate ? decorate(withId, row) : withId) as T;
      })
      .filter(Boolean) as T[],
    pagination: paginate(page, limit, totalRow?.total ?? 0)
  };
};

/**
 * True when the device holds this collection: either it has rows, or a sync cursor proves the
 * collection was pulled and is genuinely empty. Without the cursor check, an empty catalogue
 * would fall back to the network forever; without the row check, a device that has data but
 * lost its cursor would show nothing.
 */
export const hasLocalData = async (entity: EntityType, businessId: string, txn?: SQLiteDatabase) =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not check the local store', async () => {
    const db = await connect(txn);
    const row = await db.getFirstAsync<{ one: number }>(
      `SELECT 1 AS one FROM ${entity} WHERE business_id = ? LIMIT 1`,
      businessId
    );
    if (row) return true;
    return Boolean(await getSetting(`sync.cursor.${entity === 'suppliers' ? 'vendors' : entity}`, db));
  });

// -- Products ---------------------------------------------------------------------------

const PRODUCT_ORDER: Record<string, string> = {
  updated: 'COALESCE(server_updated_at, local_updated_at) DESC, local_id DESC',
  'name-asc': 'name COLLATE NOCASE ASC, local_id ASC',
  'price-high': 'price DESC, local_id DESC',
  'price-low': 'price ASC, local_id ASC',
  'stock-low': 'stock_quantity ASC, local_id ASC'
};

/** `top-sales` and the report range need sales aggregates the device does not hold. */
export const canServeProductsLocally = (query: ProductQuery) =>
  !query.from && !query.to && (!query.sort || query.sort in PRODUCT_ORDER);

export const localProductPage = async (
  businessId: string,
  query: ProductQuery,
  txn?: SQLiteDatabase
): Promise<Page<Product, 'products'>> => {
  const filters = base(businessId);

  if (query.search?.trim()) like(filters, ['name', 'sku', 'barcode'], query.search.trim());
  if (query.category) {
    filters.where.push('category = ?');
    filters.params.push(query.category);
  }
  if (query.status === 'inactive') filters.where.push('is_active = 0');
  else if (query.status !== 'all') filters.where.push('is_active = 1');

  // Out of stock beats low stock: a product at zero is not "running low", it is gone.
  if (query.stockStatus === 'out') filters.where.push('stock_quantity <= 0');
  else if (query.stockStatus === 'low') {
    filters.where.push('stock_quantity > 0 AND stock_quantity <= COALESCE(low_stock_threshold, 5)');
  } else if (query.stockStatus === 'available') filters.where.push('stock_quantity > 0');

  const minPrice = number(query.minPrice);
  const maxPrice = number(query.maxPrice);
  if (minPrice !== null) {
    filters.where.push('price >= ?');
    filters.params.push(minPrice);
  }
  if (maxPrice !== null) {
    filters.where.push('price <= ?');
    filters.params.push(maxPrice);
  }

  // The level a shopkeeper needs while billing is what is left *after* the sales still
  // queued on this device, not what the server last confirmed. One pass over the queue for
  // the whole page — per-product scans would walk it once per row.
  const pending = await pendingStockDeltasByProduct(businessId, txn);

  const { rows, pagination } = await readPage<Product>(
    'products',
    filters,
    PRODUCT_ORDER[query.sort ?? 'updated'] ?? PRODUCT_ORDER.updated,
    query.page ?? 1,
    query.limit ?? 20,
    txn,
    pending.size
      ? (doc, row) => {
          // Either id can name the product in a queued line: the server's once it has one,
          // the local id for a line written while the product itself was still unsent.
          const deltas = deltasFor(pending, [
            row.server_id == null ? null : String(row.server_id),
            String(row.local_id)
          ]);
          if (!deltas.length) return doc;
          // Provisional, and only ever downgrades what is shown: the server owns the real
          // number and the next pull restores it.
          return { ...doc, stockQuantity: projectStock(Number(doc.stockQuantity) || 0, deltas) };
        }
      : undefined
  );

  return { success: true, products: rows, pagination };
};

export const localProductCategories = async (businessId: string, txn?: SQLiteDatabase): Promise<string[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read categories', async () => {
    const db = await connect(txn);
    const rows = await db.getAllAsync<{ category: string }>(
      `SELECT DISTINCT category FROM products
        WHERE business_id = ? AND deleted_at IS NULL AND category IS NOT NULL AND category <> ''
        ORDER BY category COLLATE NOCASE`,
      businessId
    );
    return rows.map((row) => row.category);
  });

// -- Customers --------------------------------------------------------------------------

const CUSTOMER_ORDER: Record<string, string> = {
  updated: 'COALESCE(server_updated_at, local_updated_at) DESC, local_id DESC',
  newest: 'COALESCE(server_updated_at, local_updated_at) DESC, local_id DESC',
  oldest: 'COALESCE(server_updated_at, local_updated_at) ASC, local_id ASC',
  'name-asc': 'name COLLATE NOCASE ASC, local_id ASC'
};

/** Billing status and address filters need the ledger and fields that are not promoted. */
export const canServeCustomersLocally = (query: CustomerQuery) =>
  (!query.billingStatus || query.billingStatus === 'all') &&
  (!query.contactInfo || query.contactInfo === 'withEmail' || query.contactInfo === 'withoutEmail') &&
  (!query.sort || query.sort in CUSTOMER_ORDER);

export const localCustomerPage = async (
  businessId: string,
  query: CustomerQuery,
  txn?: SQLiteDatabase
): Promise<Page<Customer, 'customers'>> => {
  const filters = base(businessId);
  const term = query.search?.trim();

  if (term) {
    // A phone-shaped term is normalised so "+91 98765 43210" matches the stored digits.
    const digits = /^\+?[\d\s()-]+$/.test(term) ? normalizePhone(term) : null;
    like(filters, ['name', 'phone_normalized', 'email', 'gst_number'], digits ?? term);
  }
  if (query.contactInfo === 'withEmail') filters.where.push("email IS NOT NULL AND email <> ''");
  if (query.contactInfo === 'withoutEmail') filters.where.push("(email IS NULL OR email = '')");

  // Dues are server-derived from the ledger, and the mirrored value is as of the last sync.
  // A payment taken minutes ago is money the customer no longer owes, so it comes off here.
  const pending = await pendingPaymentAllocations(businessId, txn);

  const { rows, pagination } = await readPage<Customer>(
    'customers',
    filters,
    CUSTOMER_ORDER[query.sort ?? 'updated'] ?? CUSTOMER_ORDER.updated,
    query.page ?? 1,
    query.limit ?? 20,
    txn,
    pending.length
      ? (doc, row) => {
          const { allocated, unapplied } = collectedFrom(
            pending,
            [row.server_id == null ? null : String(row.server_id), String(row.local_id)],
            row.server_updated_at == null ? null : String(row.server_updated_at)
          );
          if (!allocated && !unapplied) return doc;
          return {
            ...doc,
            outstandingDues: Math.max(Math.round(((Number(doc.outstandingDues) || 0) - allocated) * 100) / 100, 0),
            creditBalance: Math.round(((Number(doc.creditBalance) || 0) + unapplied) * 100) / 100
          };
        }
      : undefined
  );

  return { success: true, customers: rows, pagination };
};

// -- Expenses ---------------------------------------------------------------------------

export type LocalExpenseQuery = { search?: string; category?: string; from?: string; to?: string };

/**
 * The expense list and its summary, assembled the way the API assembles them — including the
 * detail that the summary spans the *date range only*, ignoring the search and category
 * filters. Matching that is the difference between a local answer and a plausible one.
 *
 * Voided rows stay out of both: they exist for the audit trail, not the list.
 */
export const localExpenseList = async (
  businessId: string,
  query: LocalExpenseQuery,
  txn?: SQLiteDatabase
): Promise<ExpenseListResponse> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read expenses', async () => {
    const db = await connect(txn);

    const dated = base(businessId);
    dated.where.push('voided_at IS NULL');
    if (query.from) {
      dated.where.push('date >= ?');
      dated.params.push(query.from);
    }
    if (query.to) {
      // The API takes the end of that day; ISO text sorts, so the boundary is a string.
      dated.where.push('date <= ?');
      dated.params.push(query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to);
    }

    const listed: Filters = { where: [...dated.where], params: [...dated.params] };
    if (query.category) {
      listed.where.push('category = ?');
      listed.params.push(query.category);
    }
    const term = query.search?.trim();
    // notes is not a promoted column; the server searches it, so the document is read for it.
    if (term) like(listed, ['vendor_name', 'reference', "json_extract(payload, '$.notes')"], term);

    const rows = await db.getAllAsync<EntityRow>(
      `SELECT * FROM expenses WHERE ${listed.where.join(' AND ')} ORDER BY date DESC, local_id DESC LIMIT 500`,
      listed.params
    );

    const totals = await db.getAllAsync<{ category: string | null; total: number; count: number }>(
      `SELECT category, SUM(total) AS total, COUNT(*) AS count FROM expenses
        WHERE ${dated.where.join(' AND ')}
        GROUP BY category ORDER BY total DESC`,
      dated.params
    );

    const money = (value: number) => Math.round((value || 0) * 100) / 100;

    return {
      expenses: rows
        .map((row) => {
          const doc = fromRow(row).doc as Expense | null;
          return doc ? { ...doc, _id: doc._id ?? String(row.local_id) } : null;
        })
        .filter(Boolean) as Expense[],
      summary: {
        total: money(totals.reduce((sum, group) => sum + (group.total || 0), 0)),
        count: totals.reduce((sum, group) => sum + (group.count || 0), 0),
        byCategory: totals.map((group) => ({
          category: (group.category ?? 'other') as ExpenseCategory,
          total: money(group.total),
          count: group.count
        }))
      }
    };
  });

// -- Purchases --------------------------------------------------------------------------

export type LocalPurchaseQuery = { search?: string; status?: string; vendorId?: string };

/**
 * The purchase bill list. Cancelled bills are included — the API filters by status rather
 * than hiding them, because a cancelled bill is still part of the month's record.
 *
 * A bill received offline has no bill number yet (the server allocates the series), so the
 * list shows what the device knows and the number arrives with the pull.
 */
export const localPurchases = async (
  businessId: string,
  query: LocalPurchaseQuery,
  txn?: SQLiteDatabase
): Promise<PurchaseBill[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read purchase bills', async () => {
    const db = await connect(txn);
    const filters = base(businessId);

    if (query.status) {
      filters.where.push('status = ?');
      filters.params.push(query.status);
    }
    if (query.vendorId) {
      // Either side of the reference: the picker may hold a local id for an unsynced supplier.
      filters.where.push('(vendor_server_id = ? OR vendor_local_id = ?)');
      filters.params.push(query.vendorId, query.vendorId);
    }
    const term = query.search?.trim();
    if (term) like(filters, ['bill_number', 'vendor_bill_number', 'vendor_name'], term);

    const rows = await db.getAllAsync<EntityRow>(
      `SELECT * FROM purchases WHERE ${filters.where.join(' AND ')} ORDER BY date DESC, local_id DESC LIMIT 500`,
      filters.params
    );

    return rows
      .map((row) => {
        const doc = fromRow(row).doc as PurchaseBill | null;
        return doc ? { ...doc, _id: doc._id ?? String(row.local_id) } : null;
      })
      .filter(Boolean) as PurchaseBill[];
  });

// -- Suppliers --------------------------------------------------------------------------

/**
 * The vendor picker's list. Not paginated, because the API it stands in for is not: the
 * purchase sheet asks for matches on a search term and shows them all.
 */
export const localVendors = async (businessId: string, search?: string, txn?: SQLiteDatabase): Promise<Vendor[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read suppliers', async () => {
    const db = await connect(txn);
    const filters = base(businessId);
    filters.where.push('is_active = 1');

    const term = search?.trim();
    if (term) {
      const digits = /^\+?[\d\s()-]+$/.test(term) ? normalizePhone(term) : null;
      like(filters, ['name', 'phone_normalized', 'email', 'gst_number'], digits ?? term);
    }

    const rows = await db.getAllAsync<EntityRow>(
      `SELECT * FROM suppliers WHERE ${filters.where.join(' AND ')} ORDER BY name COLLATE NOCASE ASC, local_id ASC`,
      filters.params
    );

    // A supplier added offline has no server id yet; its local id stands in so the purchase
    // sheet can select it — the same substitution readPage makes for the paged lists.
    return rows
      .map((row) => {
        const doc = fromRow(row).doc as Vendor | null;
        return doc ? { ...doc, _id: doc._id ?? String(row.local_id) } : null;
      })
      .filter(Boolean) as Vendor[];
  });

// -- Invoices ---------------------------------------------------------------------------

const INVOICE_ORDER: Record<string, string> = {
  newest: 'date DESC, local_id DESC',
  oldest: 'date ASC, local_id ASC',
  'amount-high': 'total DESC, local_id DESC',
  'amount-low': 'total ASC, local_id ASC'
};

export const canServeInvoicesLocally = (query: InvoiceQuery) => !query.sort || query.sort in INVOICE_ORDER;

export const localInvoicePage = async (
  businessId: string,
  query: InvoiceQuery & { documentType?: string },
  txn?: SQLiteDatabase
): Promise<Page<Invoice, 'invoices'>> => {
  const filters = base(businessId);
  filters.where.push('document_type = ?');
  filters.params.push(query.documentType ?? 'invoice');

  if (query.search?.trim()) like(filters, ['document_number', 'customer_name'], query.search.trim());
  if (query.customerId) {
    // Either side of the reference: the server id once synced, the local id before that.
    filters.where.push('(customer_server_id = ? OR customer_local_id = ?)');
    filters.params.push(query.customerId, query.customerId);
  }

  // The legacy three-state status the list chips use, expressed over the real columns.
  if (query.status === 'cancelled') filters.where.push("document_status = 'cancelled'");
  else if (query.status === 'paid') filters.where.push("payment_status = 'paid' AND document_status <> 'cancelled'");
  else if (query.status === 'pending') {
    filters.where.push("payment_status IN ('unpaid', 'partial') AND document_status <> 'cancelled'");
  }

  if (query.from) {
    filters.where.push('date >= ?');
    filters.params.push(query.from);
  }
  if (query.to) {
    filters.where.push('date <= ?');
    filters.params.push(query.to);
  }

  const minAmount = number(query.minAmount);
  const maxAmount = number(query.maxAmount);
  if (minAmount !== null) {
    filters.where.push('total >= ?');
    filters.params.push(minAmount);
  }
  if (maxAmount !== null) {
    filters.where.push('total <= ?');
    filters.params.push(maxAmount);
  }

  // What is owed, with the receipts still queued on this device counted. Without this a
  // shopkeeper who has just taken cash sees the bill as unpaid until the phone finds signal,
  // which in a billing app reads as lost money.
  const pending = await pendingPaymentAllocations(businessId, txn);

  const { rows, pagination } = await readPage<Invoice>(
    'invoices',
    filters,
    INVOICE_ORDER[query.sort ?? 'newest'] ?? INVOICE_ORDER.newest,
    query.page ?? 1,
    query.limit ?? 20,
    txn,
    pending.length
      ? (doc, row) =>
          projectInvoicePayment(
            doc,
            allocatedTo(
              pending,
              [row.server_id == null ? null : String(row.server_id), String(row.local_id)],
              row.server_updated_at == null ? null : String(row.server_updated_at)
            )
          )
      : undefined
  );

  return { success: true, invoices: rows, pagination };
};

/** One document by its server id — the detail screen's read. */
export const localInvoice = async (
  businessId: string,
  invoiceId: string,
  txn?: SQLiteDatabase
): Promise<Invoice | null> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read the invoice', async () => {
    const db = await connect(txn);
    const row = await db.getFirstAsync<EntityRow>(
      'SELECT * FROM invoices WHERE business_id = ? AND (server_id = ? OR local_id = ?)',
      [businessId, invoiceId, invoiceId]
    );
    if (!row) return null;

    const doc = fromRow(row).doc as Invoice | null;
    if (!doc) return null;

    const pending = await pendingPaymentAllocations(businessId, txn);
    const identified = { ...doc, _id: doc._id ?? String(row.local_id) };
    return projectInvoicePayment(
      identified,
      allocatedTo(
        pending,
        [row.server_id == null ? null : String(row.server_id), String(row.local_id)],
        row.server_updated_at == null ? null : String(row.server_updated_at)
      )
    );
  });

/**
 * A customer's unpaid bills, oldest first — the dues-collection sheet's read, and the same
 * shape the API returns. Balances carry the projection, so a bill settled offline two minutes
 * ago is not offered for collection a second time.
 */
export const localCustomerOutstanding = async (
  businessId: string,
  customerId: string,
  txn?: SQLiteDatabase
): Promise<CustomerOutstanding> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read outstanding invoices', async () => {
    const db = await connect(txn);
    const rows = await db.getAllAsync<EntityRow>(
      `SELECT * FROM invoices
        WHERE business_id = ? AND deleted_at IS NULL AND document_type = 'invoice'
          AND (customer_server_id = ? OR customer_local_id = ?)
          AND document_status NOT IN ('cancelled', 'void')
          AND payment_status IN ('unpaid', 'partial')
        ORDER BY date ASC, local_id ASC`,
      [businessId, customerId, customerId]
    );

    const pending = await pendingPaymentAllocations(businessId, txn);
    const invoices: OutstandingInvoice[] = [];
    let totalOutstanding = 0;

    for (const row of rows) {
      const doc = fromRow(row).doc as Invoice | null;
      if (!doc) continue;

      const balanceDue = projectedBalanceDue(
        doc,
        allocatedTo(
          pending,
          [row.server_id == null ? null : String(row.server_id), String(row.local_id)],
          row.server_updated_at == null ? null : String(row.server_updated_at)
        )
      );
      if (balanceDue <= 0) continue;

      totalOutstanding = Math.round((totalOutstanding + balanceDue) * 100) / 100;
      invoices.push({
        // The local id stands in until the bill has synced, so the receipt can still name it.
        id: doc._id ?? String(row.local_id),
        invoiceNumber: String(doc.invoiceNumber ?? doc.documentNumber ?? ''),
        date: doc.date,
        total: Number(doc.total) || 0,
        balanceDue
      });
    }

    return { success: true, invoices, totalOutstanding };
  });

// -- Payments ---------------------------------------------------------------------------

export const localPayments = async (
  businessId: string,
  query: { invoiceId?: string; customerId?: string },
  txn?: SQLiteDatabase
): Promise<Payment[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read payments', async () => {
    const db = await connect(txn);
    const filters = base(businessId);

    if (query.invoiceId) {
      filters.where.push('(invoice_server_id = ? OR invoice_local_id = ?)');
      filters.params.push(query.invoiceId, query.invoiceId);
    }
    if (query.customerId) {
      filters.where.push('(customer_server_id = ? OR customer_local_id = ?)');
      filters.params.push(query.customerId, query.customerId);
    }

    const rows = await db.getAllAsync<EntityRow>(
      `SELECT * FROM payments WHERE ${filters.where.join(' AND ')} ORDER BY received_at DESC, local_id DESC`,
      filters.params
    );

    return rows.map((row) => fromRow(row).doc).filter(Boolean) as Payment[];
  });
