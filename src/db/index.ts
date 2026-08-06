/**
 * The only module the rest of the app imports for local database access.
 *
 * Keeping every SQLite call behind this boundary is what makes a future driver swap
 * (if needed) a one-module change. Encryption at rest is SQLCipher via expo-sqlite.
 */
export { DATABASE_NAME, closeDatabase, isDatabaseAvailable, openDatabase, resetDatabase } from './connection';
export {
  DB_ENCRYPTION_KEY,
  clearDbEncryptionKey,
  getOrCreateDbEncryptionKey,
  pragmaKeySql
} from './encryptionKey';
export { pendingLocalSyncCount, wipeLocalBusinessData, type WipeLocalOptions } from './wipeLocalData';
export {
  emitChange,
  resetChangeBus,
  subscribeToChanges,
  withBufferedChanges,
  type ChangeEvent,
  type ChangeType
} from './changeBus';
export {
  countCustomers,
  createCustomer,
  deleteCustomer,
  findCustomerByPhone,
  getCustomer,
  getCustomerByServerId,
  listCustomers,
  updateCustomer,
  type CustomerCursor,
  type CustomerDoc,
  type CustomerPage,
  type CustomerQuery,
  type CustomerRecord
} from './customerRepository';
export {
  upsertEntityRow,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
export {
  canServeCustomersLocally,
  canServeInvoicesLocally,
  canServeProductsLocally,
  hasLocalData,
  localCustomerOutstanding,
  localCustomerPage,
  localInvoice,
  localInvoicePage,
  localPayments,
  localExpenseList,
  localProductCategories,
  localPurchases,
  localProductPage,
  localVendors,
  type LocalExpenseQuery,
  type LocalPurchaseQuery
} from './readModel';
export { deleteSetting, getSetting, setSetting } from './settings';
export {
  DatabaseError,
  LocalRuleError,
  isDatabaseError,
  isDatabaseUnavailable,
  isLocalRuleError,
  isUnsupportedOperation,
  type DatabaseErrorCode
} from './errors';
export {
  columnsFor,
  fromRow,
  isUuid,
  normalizePhone,
  toRow,
  uuidv7,
  type EntityRecord,
  type EntityRow,
  type EntityType,
  type MongoDoc,
  type SyncState,
  type ToRowContext
} from './mappers';
export {
  countInvoices,
  createInvoice,
  deleteInvoice,
  findInvoiceByNumber,
  getInvoice,
  getInvoiceByServerId,
  listInvoices,
  listInvoicesForCustomer,
  listOutstandingInvoices,
  updateInvoice,
  type InvoiceCursor,
  type InvoiceDoc,
  type InvoicePage,
  type InvoiceQuery,
  type InvoiceRecord
} from './invoiceRepository';
export {
  DEVICE_SERIES_KEY,
  GST_DOCUMENT_NUMBER_MAX_LENGTH,
  MAX_DEVICE_INDEX,
  PRIMARY_DEVICE_INDEX,
  allocateDocumentNumber,
  canIssueDocumentsLocally,
  compactFinancialYear,
  deviceSegment,
  financialYearFor,
  formatDocumentNumber,
  getDeviceSeries,
  readSequence,
  saveDeviceSeries,
  seedSequence,
  type DeviceSeries
} from './invoiceNumbering';
export {
  createInvoiceLocally,
  findInvoiceByAnyId,
  provisionalTotals as provisionalInvoiceTotals,
  type InvoiceLineWarning,
  type InvoiceWriteOptions,
  type IssuedInvoice
} from './invoiceWrites';
export {
  deltasFor,
  oversellCheck,
  pendingStockDeltasByProduct,
  projectStock
} from './stockProjection';
export {
  allocatedTo,
  collectedFrom,
  pendingPaymentAllocations,
  projectInvoicePayment,
  projectedBalanceDue,
  type PendingAllocation
} from './paymentProjection';
export {
  recordCustomerPaymentLocally,
  recordInvoicePaymentLocally,
  type PaymentWriteOptions,
  type RecordedPayment
} from './paymentWrites';
export { latestVersion, migrations, readSchemaVersion, runMigrations, type Migration } from './migrations';
export {
  OUTBOX_PRIORITY,
  SENDABLE_ENTITY_TYPES,
  backoffDelayMs,
  claimOperations,
  clearRetryBackoff,
  countOperations,
  deferOperation,
  discardOperation,
  enqueueOperation,
  getOperation,
  listOperations,
  listReadyOperations,
  markOperationConflict,
  markOperationDone,
  markOperationFailed,
  pruneCompletedOperations,
  recoverInflightOperations,
  retryOperation,
  type EnqueueInput,
  type OutboxOperation,
  type OutboxOpType,
  type OutboxOptions,
  type OutboxQuery,
  type OutboxStatus
} from './outbox';
export {
  countPayments,
  createPayment,
  deletePayment,
  findPaymentByReference,
  getPayment,
  getPaymentByServerId,
  listPayments,
  listPaymentsForCustomer,
  listPaymentsForInvoice,
  updatePayment,
  type PaymentCursor,
  type PaymentDoc,
  type PaymentPage,
  type PaymentQuery,
  type PaymentRecord
} from './paymentRepository';
export {
  countProducts,
  createProduct,
  deleteProduct,
  findProductByBarcode,
  getProduct,
  getProductByServerId,
  listProducts,
  updateProduct,
  type ProductCursor,
  type ProductDoc,
  type ProductPage,
  type ProductQuery,
  type ProductRecord
} from './productRepository';
export { createEntityWrites, type LocalWriteOptions } from './entityWrites';
export {
  countPurchases,
  createPurchase,
  getPurchase,
  getPurchaseByServerId,
  listPurchases,
  provisionalTotals,
  type PurchaseCursor,
  type PurchaseDoc,
  type PurchaseListQuery,
  type PurchasePage,
  type PurchaseRecord
} from './purchaseRepository';
export { createPurchaseLocally, findPurchaseByAnyId, type PurchaseWriteOptions } from './purchaseWrites';
export {
  countExpenses,
  createExpense,
  deleteExpense,
  expenseTotal,
  getExpense,
  getExpenseByServerId,
  listExpenses,
  updateExpense,
  type ExpenseCursor,
  type ExpenseDoc,
  type ExpenseListQuery,
  type ExpensePage,
  type ExpenseRecord
} from './expenseRepository';
export {
  createExpenseLocally,
  deleteExpenseLocally,
  findExpenseByAnyId,
  updateExpenseLocally,
  type ExpenseWriteOptions
} from './expenseWrites';
export {
  createCustomerLocally,
  deleteCustomerLocally,
  findCustomerByAnyId,
  updateCustomerLocally,
  type CustomerWriteOptions
} from './customerWrites';
export {
  createProductLocally,
  deleteProductLocally,
  findProductByAnyId,
  updateProductLocally,
  type ProductWriteOptions
} from './productWrites';
export {
  countSuppliers,
  createSupplier,
  deleteSupplier,
  findSupplierByPhone,
  getSupplier,
  getSupplierByServerId,
  listSuppliers,
  updateSupplier,
  type SupplierCursor,
  type SupplierDoc,
  type SupplierPage,
  type SupplierQuery,
  type SupplierRecord
} from './supplierRepository';
export {
  createSupplierLocally,
  findSupplierByAnyId,
  updateSupplierLocally,
  type SupplierWriteOptions
} from './supplierWrites';
export {
  applyReferralLocally,
  getLocalReferral,
  type QueuedReferral,
  type ReferralRowDoc
} from './referralWrites';
export { withTransaction } from './transaction';
