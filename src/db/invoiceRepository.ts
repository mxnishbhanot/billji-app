import type { SQLiteDatabase } from 'expo-sqlite';
import type { Customer, DocumentType, Invoice } from '../types';
import {
  createEntityRepository,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
import type { MongoDoc, SqliteValue } from './mappers';

/**
 * Sales documents — invoice, quotation, delivery challan, credit note — read and written
 * locally. SQLite only; nothing here touches the network.
 *
 * The customer snapshot lives in the payload, so a list row renders with no join, and the
 * customer reference is stored on both sides (local and server id) because an invoice can
 * legitimately point at a customer this device does not hold.
 */

/**
 * The snapshot is loosened to a partial: a document being built offline has a customer name
 * and phone long before it has a server `_id`.
 */
export type InvoiceDoc = MongoDoc &
  Partial<Omit<Invoice, 'customerSnapshot'>> & { customerSnapshot?: Partial<Customer> };
export type InvoiceRecord = EntityDocument<InvoiceDoc>;
export type InvoiceCursor = EntityCursor;
export type InvoicePage = EntityPage<InvoiceDoc>;
export type { WriteOptions };

export type InvoiceQuery = Omit<ListQuery, 'where' | 'whereIn' | 'range' | 'activeOnly'> & {
  /** Defaults to 'invoice': quotations and challans are separate lists, not a mixed feed. */
  documentType?: DocumentType | null;
  documentStatus?: string | string[];
  paymentStatus?: string | string[];
  customerLocalId?: string;
  /** Inclusive ISO bounds on the document date. */
  from?: string;
  to?: string;
};

const repository = createEntityRepository<InvoiceDoc>({
  entity: 'invoices',
  label: 'invoice',
  // Customers are looked up by name here, not by joining: the snapshot is already promoted.
  searchColumns: ['document_number', 'customer_name'],
  sortColumn: 'date',
  // Newest first, matching idx_invoices_list.
  sortDirection: 'DESC',
  hasActiveColumn: false,
  filterColumns: [
    'document_type',
    'document_status',
    'payment_status',
    'fulfillment_status',
    'customer_local_id',
    'customer_server_id',
    'document_number',
    'date'
  ]
});

const asList = (values?: string | string[]): SqliteValue[] | undefined => {
  if (!values) return undefined;
  return Array.isArray(values) ? values : [values];
};

const toListQuery = ({
  documentType,
  documentStatus,
  paymentStatus,
  customerLocalId,
  from,
  to,
  ...query
}: InvoiceQuery): ListQuery => ({
  ...query,
  where: {
    // Explicit null asks for every document type; undefined takes the default.
    document_type: documentType === null ? null : (documentType ?? 'invoice'),
    customer_local_id: customerLocalId ?? null
  },
  whereIn: {
    ...(asList(documentStatus) ? { document_status: asList(documentStatus)! } : {}),
    ...(asList(paymentStatus) ? { payment_status: asList(paymentStatus)! } : {})
  },
  range: from || to ? { column: 'date', from, to } : undefined
});

export const getInvoice = repository.get;
export const getInvoiceByServerId = repository.getByServerId;
export const createInvoice = repository.create;
export const updateInvoice = repository.update;

/**
 * Tombstones the document. This is the draft-discard path, not the customer-facing one: a
 * document that has been issued is *cancelled* — a server action that reverses stock and
 * ledger — never deleted.
 */
export const deleteInvoice = repository.softDelete;

export const listInvoices = (query: InvoiceQuery): Promise<InvoicePage> => repository.list(toListQuery(query));

export const countInvoices = (query: InvoiceQuery): Promise<number> => repository.count(toListQuery(query));

/** Everything with money still owed — the collections list, and the dashboard's headline. */
export const listOutstandingInvoices = (query: InvoiceQuery): Promise<InvoicePage> =>
  listInvoices({ ...query, paymentStatus: ['unpaid', 'partial'] });

/** Document numbers are unique per business per series, so this resolves to one document. */
export const findInvoiceByNumber = (
  businessId: string,
  documentNumber: string,
  txn?: SQLiteDatabase
): Promise<InvoiceRecord | null> => repository.findBy('document_number', documentNumber, businessId, txn);

/**
 * A customer's history. Keyed on local_id: the invoice and the customer may both still be
 * unsynced, in which case the server ids do not exist yet.
 */
export const listInvoicesForCustomer = (
  businessId: string,
  customerLocalId: string,
  query: Partial<InvoiceQuery> = {}
): Promise<InvoicePage> => listInvoices({ ...query, businessId, customerLocalId, documentType: null });
