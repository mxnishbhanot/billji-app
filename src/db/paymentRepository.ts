import type { SQLiteDatabase } from 'expo-sqlite';
import type { PaymentMethod, PaymentRecordStatus, PaymentType } from '../types';
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
 * Payments — receipts, refunds and vendor payments, one model because every cash movement
 * belongs in one place. Read and written locally; SQLite only, no network.
 *
 * The device records the *receipt*. Allocation across invoices, the customer balance and the
 * ledger are all server-computed, which is why nothing here sums anything: a local total
 * would disagree with the server's the moment an allocation lands.
 */

/** 'vendor_payment' is money going the other way — same shape, so it shares the model. */
export type PaymentKind = PaymentType | 'vendor_payment';

export type PaymentDoc = MongoDoc & {
  _id?: string;
  amount?: number;
  method?: PaymentMethod;
  type?: PaymentKind;
  status?: PaymentRecordStatus;
  reference?: string;
  notes?: string;
  receivedAt?: string;
  /** Server ids of what the money is against. Newer records use salesDocument. */
  salesDocument?: string | null;
  invoice?: string | null;
  customer?: string | null;
};

export type PaymentRecord = EntityDocument<PaymentDoc>;
export type PaymentCursor = EntityCursor;
export type PaymentPage = EntityPage<PaymentDoc>;
export type { WriteOptions };

export type PaymentQuery = Omit<ListQuery, 'where' | 'whereIn' | 'range' | 'activeOnly'> & {
  type?: PaymentKind | PaymentKind[];
  method?: PaymentMethod | PaymentMethod[];
  status?: PaymentRecordStatus | PaymentRecordStatus[];
  invoiceLocalId?: string;
  customerLocalId?: string;
  /** Inclusive ISO bounds on receivedAt — the day book, or a month's collections. */
  from?: string;
  to?: string;
};

const repository = createEntityRepository<PaymentDoc>({
  entity: 'payments',
  label: 'payment',
  // A receipt is found by its reference: a UPI txn id, a cheque number.
  searchColumns: ['reference'],
  sortColumn: 'received_at',
  // Newest first, matching idx_payments_received.
  sortDirection: 'DESC',
  hasActiveColumn: false,
  filterColumns: [
    'type',
    'method',
    'status',
    'reference',
    'invoice_local_id',
    'invoice_server_id',
    'customer_local_id',
    'customer_server_id',
    'received_at'
  ]
});

const asList = (values?: string | string[] | null): SqliteValue[] | undefined => {
  if (!values) return undefined;
  return Array.isArray(values) ? values : [values];
};

const toListQuery = ({
  type,
  method,
  status,
  invoiceLocalId,
  customerLocalId,
  from,
  to,
  ...query
}: PaymentQuery): ListQuery => ({
  ...query,
  where: {
    invoice_local_id: invoiceLocalId ?? null,
    customer_local_id: customerLocalId ?? null
  },
  whereIn: {
    ...(asList(type) ? { type: asList(type)! } : {}),
    ...(asList(method) ? { method: asList(method)! } : {}),
    ...(asList(status) ? { status: asList(status)! } : {})
  },
  range: from || to ? { column: 'received_at', from, to } : undefined
});

export const getPayment = repository.get;
export const getPaymentByServerId = repository.getByServerId;
export const createPayment = repository.create;
export const updatePayment = repository.update;

/**
 * Tombstones the receipt. Deleting money that has been taken is not an ordinary edit — the
 * server reverses a payment through its own cancel/refund actions, which also unwind the
 * allocation and the ledger. This exists for a receipt recorded in error on-device.
 */
export const deletePayment = repository.softDelete;

export const listPayments = (query: PaymentQuery): Promise<PaymentPage> => repository.list(toListQuery(query));

export const countPayments = (query: PaymentQuery): Promise<number> => repository.count(toListQuery(query));

/**
 * What has been received against one document. Keyed on local_id: an offline receipt against
 * an offline invoice has no server ids on either side yet.
 */
export const listPaymentsForInvoice = (
  businessId: string,
  invoiceLocalId: string,
  query: Partial<PaymentQuery> = {}
): Promise<PaymentPage> => listPayments({ ...query, businessId, invoiceLocalId });

export const listPaymentsForCustomer = (
  businessId: string,
  customerLocalId: string,
  query: Partial<PaymentQuery> = {}
): Promise<PaymentPage> => listPayments({ ...query, businessId, customerLocalId });

/** Duplicate check before recording a UPI txn id or cheque number twice. */
export const findPaymentByReference = (
  businessId: string,
  reference: string,
  txn?: SQLiteDatabase
): Promise<PaymentRecord | null> => repository.findBy('reference', reference, businessId, txn);
