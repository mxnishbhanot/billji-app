import {
  canIssueDocumentsLocally,
  canServeCustomersLocally,
  canServeInvoicesLocally,
  canServeProductsLocally,
  createCustomerLocally,
  createExpenseLocally,
  createInvoiceLocally,
  createProductLocally,
  createPurchaseLocally,
  createSupplierLocally,
  deleteCustomerLocally,
  deleteExpenseLocally,
  deleteProductLocally,
  findCustomerByAnyId,
  findExpenseByAnyId,
  findProductByAnyId,
  findSupplierByAnyId,
  localExpenseList,
  localPurchases,
  localVendors,
  updateCustomerLocally,
  updateExpenseLocally,
  updateProductLocally,
  updateSupplierLocally,
  type CustomerDoc,
  type CustomerRecord,
  type ExpenseDoc,
  type ExpenseRecord,
  type InvoiceRecord,
  type PaymentRecord,
  type LocalExpenseQuery,
  type LocalPurchaseQuery,
  type PurchaseDoc,
  type PurchaseRecord,
  type ProductDoc,
  type ProductRecord,
  type SupplierDoc,
  type SupplierRecord,
  localCustomerOutstanding,
  localCustomerPage,
  localInvoice,
  localInvoicePage,
  localPayments,
  recordCustomerPaymentLocally,
  recordInvoicePaymentLocally,
  localProductCategories,
  localProductPage
} from '@/db';
// The header constants only, imported from the engine module rather than the sync barrel:
// the barrel pulls in deviceSeries, which imports this file.
import { SYNC_DEVICE_HEADER, SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from '../sync/pushEngine';
import { api } from './client';
import { localFirst, localWrite } from './localFirst';
import {
  AuditLogEntry,
  AuthSession,
  BusinessProfile,
  BusinessSummary,
  Checkout,
  CouponQuote,
  Customer,
  CustomerFormValues,
  CustomerOutstanding,
  CustomerPaymentPayload,
  CustomerPaymentResponse,
  CustomerQuery,
  DataExport,
  DataExportDownload,
  DocumentType,
  DraftDocument,
  DocumentCreatePayload,
  DraftUpsertPayload,
  Expense,
  ExpenseListResponse,
  ExpensePayload,
  Gstr1Report,
  Gstr1SectionKey,
  Gstr3bReport,
  ImportPreview,
  ImportRequest,
  ImportResult,
  Invoice,
  InvoiceCreatePayload,
  Plan,
  Subscription,
  SubscriptionPayment,
  UsageRow,
  InvoiceDraftPayload,
  InvoiceQuery,
  InvoiceTemplate,
  LedgerEntryRow,
  LoginResult,
  TwoFactorStatus,
  Order,
  OrderCreatePayload,
  OrderQuery,
  NotificationItem,
  NotificationPreferences,
  NotificationQuery,
  Page,
  PageQuery,
  Payment,
  PendingReminderList,
  PermissionGroup,
  PreparedReminder,
  Product,
  ProductFormValues,
  ProductQuery,
  ProductStockHistory,
  ProductStockMovementQuery,
  PurchaseBill,
  PurchaseCreatePayload,
  RecordPaymentPayload,
  RecordPaymentResponse,
  SalesDocumentKind,
  Vendor,
  VendorOutstanding,
  VendorPaymentPayload,
  ReportQuery,
  ReportSummary,
  RoleSummary,
  TeamInvitation,
  TeamMember,
  User,
  UserSession
} from '@/types';

type ProductPage = Page<Product, 'products'>;
type CustomerPage = Page<Customer, 'customers'>;
type InvoicePage = Page<Invoice, 'invoices'>;
type OrderPage = Page<Order, 'orders'>;
type NotificationPage = Page<NotificationItem, 'notifications'> & { unreadCount: number };
type InvoiceDraftDocument = DraftDocument<InvoiceDraftPayload>;
const idempotencyKey = (scope: string) => `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * A key that is the SAME for repeated attempts at the same purchase, unlike `idempotencyKey` above.
 *
 * Randomising it would defeat the point here: two taps on Upgrade would carry two keys and mint two
 * Razorpay orders, both payable. Derived from the terms plus a coarse time bucket, so a retry or a
 * double tap replays the first order while a genuine repurchase later gets its own key. The server
 * additionally resumes any order still open for these terms, which covers the bucket boundary.
 */
const CHECKOUT_KEY_BUCKET_MS = 5 * 60 * 1000;
const checkoutIdempotencyKey = (payload: { planId?: string; planKey?: string; interval: string; couponCode?: string; autopay?: boolean }) =>
  [
    'checkout',
    payload.planId || payload.planKey || 'plan',
    payload.interval,
    payload.couponCode || 'nocoupon',
    // The payment mode is part of the terms, not a detail: autopay mints a mandate and manual mints an
    // order. Leaving it out of the key would make a customer who switches modes inside one bucket
    // replay the other mode's checkout.
    payload.autopay ? 'autopay' : 'manual',
    Math.floor(Date.now() / CHECKOUT_KEY_BUCKET_MS)
  ].join('-');

export const authApi = {
  register: (payload: { name: string; email: string; password: string }) => api.post<AuthSession>('/auth/register', payload).then((res) => res.data),
  login: (payload: { email: string; password: string }) => api.post<LoginResult>('/auth/login', payload).then((res) => res.data),
  google: (idToken: string) => api.post<LoginResult>('/auth/google', { idToken }).then((res) => res.data),
  refresh: (refreshToken: string) => api.post<AuthSession>('/auth/refresh', { refreshToken }).then((res) => res.data),
  logout: () => api.post<{ success: boolean }>('/auth/logout').then((res) => res.data),
  sessions: () => api.get<{ sessions: UserSession[] }>('/auth/sessions').then((res) => res.data.sessions),
  revokeSession: (sessionId: string) => api.delete<{ success: boolean }>(`/auth/sessions/${sessionId}`).then((res) => res.data),
  requestPasswordReset: (email: string) => api.post<{ success: boolean; message: string; resetCode?: string }>('/auth/password-reset/request', { email }).then((res) => res.data),
  confirmPasswordReset: (email: string, code: string, password: string) => api.post<{ success: boolean; message: string }>('/auth/password-reset/confirm', { email, code, password }).then((res) => res.data),
  me: () => api.get<{ success: boolean; user: User }>('/auth/me').then((res) => res.data.user),
  businesses: () => api.get<{ businesses: BusinessSummary[] }>('/auth/businesses').then((res) => res.data.businesses),
  switchBusiness: (businessId: string) => api.post<{ success: boolean; user: User }>('/auth/business/switch', { businessId }).then((res) => res.data.user),
  updateSettings: (payload: Partial<BusinessProfile>) => api.patch<{ success: boolean; user: User }>('/settings', payload).then((res) => res.data),
  invoiceTemplatePreview: (payload: Partial<InvoiceTemplate>) =>
    api.post<string>('/settings/invoice-template/preview', payload, { responseType: 'text', transformResponse: (data) => data }).then((res) => res.data)
};

type SetupResponse = { success: boolean; otpauthUrl?: string; secret?: string; email?: string; devCode?: string };
type EnableResponse = { success: boolean; method: string; backupCodes: string[] };

// Two-factor authentication. Enrollment/management calls require a live session;
// verify/resend are the login second step (authorized by the challenge token).
export const twoFactorApi = {
  status: () => api.get<{ twoFactor: TwoFactorStatus }>('/auth/2fa/status').then((res) => res.data.twoFactor),
  totpSetup: () => api.post<SetupResponse>('/auth/2fa/totp/setup').then((res) => res.data),
  totpEnable: (code: string) => api.post<EnableResponse>('/auth/2fa/totp/enable', { code }).then((res) => res.data),
  emailSetup: () => api.post<SetupResponse>('/auth/2fa/email/setup').then((res) => res.data),
  emailEnable: (code: string) => api.post<EnableResponse>('/auth/2fa/email/enable', { code }).then((res) => res.data),
  sendManageCode: () => api.post<SetupResponse>('/auth/2fa/send-code').then((res) => res.data),
  disable: (code: string) => api.post<{ success: boolean }>('/auth/2fa/disable', { code }).then((res) => res.data),
  regenerateBackupCodes: (code: string) => api.post<{ success: boolean; backupCodes: string[] }>('/auth/2fa/backup-codes/regenerate', { code }).then((res) => res.data),
  verify: (payload: { challengeToken: string; code: string; rememberDevice?: boolean }) =>
    api.post<AuthSession>('/auth/2fa/verify', payload).then((res) => res.data),
  resend: (challengeToken: string) => api.post<SetupResponse>('/auth/2fa/resend', { challengeToken }).then((res) => res.data)
};

export const teamApi = {
  members: () => api.get<{ members: TeamMember[] }>('/team/members').then((res) => res.data.members),
  invitations: () => api.get<{ invitations: TeamInvitation[] }>('/team/invitations').then((res) => res.data.invitations),
  invite: (payload: { email: string; roleKey?: string; roleId?: string }) =>
    api.post<{ success: boolean; invitation: { id: string; email: string; roleKey: string; roleName: string; expiresAt: string } }>('/team/invitations', payload).then((res) => res.data),
  resendInvite: (id: string) => api.post<{ success: boolean }>(`/team/invitations/${id}/resend`).then((res) => res.data),
  cancelInvite: (id: string) => api.delete<{ success: boolean }>(`/team/invitations/${id}`).then((res) => res.data),
  acceptInvite: (payload: { token: string; name?: string; password?: string }) =>
    api.post<AuthSession & { joined: boolean; message?: string }>('/team/invitations/accept', payload).then((res) => res.data),
  updateRole: (userId: string, payload: { roleKey?: string; roleId?: string }) =>
    api.patch<{ success: boolean }>(`/team/members/${userId}/role`, payload).then((res) => res.data),
  updateStatus: (userId: string, status: 'active' | 'archived') =>
    api.patch<{ success: boolean }>(`/team/members/${userId}/status`, { status }).then((res) => res.data),
  removeMember: (userId: string) => api.delete<{ success: boolean }>(`/team/members/${userId}`).then((res) => res.data)
};

// Billing mirrors backend/src/modules/billing/routes.js one to one. No new HTTP client and no new
// interceptor stack — the 402 branch lives in client.ts with the rest.
export const billingApi = {
  subscription: () => api.get<{ subscription: Subscription }>('/billing/subscription').then((res) => res.data.subscription),
  usage: () =>
    api
      .get<{ usage: { usageSummary: UsageRow[]; remainingLimits: Record<string, number | null> } }>('/billing/usage')
      .then((res) => res.data.usage),
  plans: () => api.get<{ plans: Plan[] }>('/billing/plans').then((res) => res.data.plans),
  payments: (params?: { limit?: number; skip?: number }) =>
    api.get<{ payments: SubscriptionPayment[] }>('/billing/payments', { params }).then((res) => res.data.payments),
  // The Idempotency-Key is what makes a double tap replay the first order instead of opening a second
  // one the customer could also pay. It is stable per purchase attempt, not random — see
  // checkoutIdempotencyKey.
  // `autopay: true` asks for a recurring mandate instead of a single payment. Same route, because it
  // is the same decision with a different instrument.
  checkout: (payload: { planId?: string; planKey?: string; interval: 'month' | 'year'; couponCode?: string; autopay?: boolean }) =>
    api
      .post<{ checkout: Checkout }>('/billing/checkout', payload, {
        headers: { 'Idempotency-Key': checkoutIdempotencyKey(payload) }
      })
      .then((res) => res.data.checkout),
  // The webhook is the authority; this exists so the UI can unlock immediately instead of polling.
  // `payment` comes back null when a mandate was approved but its first debit has not landed yet —
  // that is a success, and the plan activates on the charge.
  verifyCheckout: (payload: { orderId?: string; subscriptionId?: string; paymentId: string; signature: string }) =>
    api
      .post<{ payment: SubscriptionPayment | null; subscription: Subscription }>('/billing/checkout/verify', payload)
      .then((res) => res.data),
  previewCoupon: (payload: { code: string; planId?: string; planKey?: string; interval: 'month' | 'year' }) =>
    api.post<{ coupon: CouponQuote }>('/billing/coupons/preview', payload).then((res) => res.data.coupon),
  startTrial: (payload: { planId?: string; planKey?: string }) =>
    api.post<{ subscription: Subscription }>('/billing/trial', payload).then((res) => res.data.subscription),
  // Access continues to the end of the period already paid for; immediate cancellation is support-only.
  cancel: (payload: { reason?: string }) =>
    api.post<{ subscription: Subscription }>('/billing/cancel', payload).then((res) => res.data.subscription),
  reactivate: () => api.post<{ subscription: Subscription }>('/billing/reactivate').then((res) => res.data.subscription),
  // Stops the mandate and nothing else: the plan and the paid period stay exactly as they are, and
  // renewal reminders resume. Deliberately not the same call as cancel().
  disableAutopay: () => api.post<{ subscription: Subscription }>('/billing/autopay/off').then((res) => res.data.subscription)
};

export const rolesApi = {
  permissionCatalog: () => api.get<{ groups: PermissionGroup[] }>('/roles/permissions').then((res) => res.data.groups),
  list: () => api.get<{ roles: RoleSummary[] }>('/roles').then((res) => res.data.roles),
  get: (id: string) => api.get<{ role: RoleSummary }>(`/roles/${id}`).then((res) => res.data.role),
  create: (payload: { name: string; description?: string; permissions: string[] }) =>
    api.post<{ role: RoleSummary }>('/roles', payload).then((res) => res.data.role),
  update: (id: string, payload: { name?: string; description?: string; permissions?: string[] }) =>
    api.patch<{ role: RoleSummary }>(`/roles/${id}`, payload).then((res) => res.data.role),
  archive: (id: string) => api.post<{ success: boolean }>(`/roles/${id}/archive`).then((res) => res.data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/roles/${id}`).then((res) => res.data)
};

// Reads below are local-first: SQLite when the collection is synced and the query is one the
// device can answer, the API otherwise. Shapes and signatures are unchanged — see localFirst.

/**
 * A stored product as the screens expect it. Before the first push there is no server id, so
 * the local id stands in — the same substitution the local read model makes, which is what
 * lets an offline-created product be edited and deleted like any other.
 */
const asProduct = (record: ProductRecord): Product =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as Product;

export const productsApi = {
  list: (params?: ProductQuery) =>
    localFirst(
      { entity: 'products', supported: canServeProductsLocally(params ?? {}) },
      async (businessId) => (await localProductPage(businessId, { ...params, page: 1, limit: params?.limit ?? 200 })).products,
      () => api.get<{ products: Product[] }>('/products', { params }).then((res) => res.data.products)
    ),
  page: (params: ProductQuery) =>
    localFirst(
      { entity: 'products', supported: canServeProductsLocally(params) },
      (businessId) => localProductPage(businessId, params),
      () => api.get<ProductPage>('/products', { params: { ...params, paginated: true } }).then((res) => res.data)
    ),
  categories: () =>
    localFirst(
      { entity: 'products' },
      (businessId) => localProductCategories(businessId),
      () => api.get<{ success: boolean; categories: string[] }>('/products/categories').then((res) => res.data.categories)
    ),
  // Writes are local-first too: the row and its queued push commit together, so a product
  // created on a train exists immediately and reaches the server when the phone does.
  create: (payload: ProductFormValues | Partial<Product>) =>
    localWrite(
      async (businessId) => asProduct(await createProductLocally(payload as ProductDoc, { businessId })),
      () => api.post<{ product: Product }>('/products', payload).then((res) => res.data.product)
    ),
  update: (id: string, payload: ProductFormValues | Partial<Product>) =>
    localWrite(async (businessId) => {
      const existing = await findProductByAnyId(id);
      // Nothing local under that id — it belongs to a collection this device has not synced.
      if (!existing) return api.patch<{ product: Product }>(`/products/${id}`, payload).then((res) => res.data.product);

      const updated = await updateProductLocally(existing.localId, payload as Partial<ProductDoc>, { businessId });
      if (!updated) throw new Error('That product no longer exists on this device');
      return asProduct(updated);
    }, () => api.patch<{ product: Product }>(`/products/${id}`, payload).then((res) => res.data.product)),
  stockMovementsPage: (id: string, params: ProductStockMovementQuery) => api.get<ProductStockHistory>(`/products/${id}/stock-movements`, { params: { ...params, paginated: true } }).then((res) => res.data),
  remove: (id: string) =>
    localWrite(async (businessId) => {
      const existing = await findProductByAnyId(id);
      if (!existing) return api.delete(`/products/${id}`).then((res) => res.data);
      await deleteProductLocally(existing.localId, { businessId });
      return { success: true };
    }, () => api.delete(`/products/${id}`).then((res) => res.data))
};

/** A stored customer as the screens expect it — see asProduct for why the id can be local. */
const asCustomer = (record: CustomerRecord): Customer =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as Customer;

export const customersApi = {
  list: (params?: CustomerQuery) =>
    localFirst(
      { entity: 'customers', supported: canServeCustomersLocally(params ?? {}) },
      async (businessId) =>
        (await localCustomerPage(businessId, { ...params, page: 1, limit: params?.limit ?? 200 })).customers,
      () => api.get<{ customers: Customer[] }>('/customers', { params }).then((res) => res.data.customers)
    ),
  page: (params: CustomerQuery) =>
    localFirst(
      { entity: 'customers', supported: canServeCustomersLocally(params) },
      (businessId) => localCustomerPage(businessId, params),
      () => api.get<CustomerPage>('/customers', { params: { ...params, paginated: true } }).then((res) => res.data)
    ),
  // Writes are local-first, exactly as products are: the row and its queued push commit
  // together, so a customer added at the counter with no signal exists immediately.
  create: (payload: CustomerFormValues | Partial<Customer>) =>
    localWrite(
      async (businessId) => asCustomer(await createCustomerLocally(payload as CustomerDoc, { businessId })),
      () => api.post<{ customer: Customer }>('/customers', payload).then((res) => res.data.customer)
    ),
  update: (id: string, payload: CustomerFormValues | Partial<Customer>) =>
    localWrite(async (businessId) => {
      const existing = await findCustomerByAnyId(id);
      // Nothing local under that id — it belongs to a collection this device has not synced.
      if (!existing) return api.patch<{ customer: Customer }>(`/customers/${id}`, payload).then((res) => res.data.customer);

      const updated = await updateCustomerLocally(existing.localId, payload as Partial<CustomerDoc>, { businessId });
      if (!updated) throw new Error('That customer no longer exists on this device');
      return asCustomer(updated);
    }, () => api.patch<{ customer: Customer }>(`/customers/${id}`, payload).then((res) => res.data.customer)),
  remove: (id: string) =>
    localWrite(async (businessId) => {
      const existing = await findCustomerByAnyId(id);
      if (!existing) return api.delete(`/customers/${id}`).then((res) => res.data);
      await deleteCustomerLocally(existing.localId, { businessId });
      return { success: true };
    }, () => api.delete(`/customers/${id}`).then((res) => res.data))
};

export const draftsApi = {
  list: (documentType: DocumentType = 'invoice') => api.get<{ drafts: InvoiceDraftDocument[] }>('/drafts', { params: { documentType } }).then((res) => res.data.drafts),
  upsert: (localDraftId: string, payload: DraftUpsertPayload) => api.put<{ draft: InvoiceDraftDocument }>(`/drafts/${localDraftId}`, payload).then((res) => res.data.draft),
  remove: (localDraftId: string) => api.delete(`/drafts/${localDraftId}`).then((res) => res.data)
};

/**
 * The sync protocol's own calls. Device registration is here rather than in the sync engine
 * because it is an ordinary authenticated request — the engine consumes it, it does not own it.
 */
export type DeviceSeriesResponse = {
  deviceId: string;
  deviceIndex: number;
  segment: string;
  documentType: string;
  prefix: string;
  financialYear: string;
  /** Last sequence issued in this series; the device's counter starts above it. */
  currentSequence: number;
  maxDeviceIndex: number;
};

export const syncApi = {
  registerDevice: (payload: { deviceId: string; name?: string; platform?: 'android' | 'ios' | 'web' }) =>
    api
      .post<{ series: DeviceSeriesResponse }>('/sync/device', payload, {
        headers: { [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION), [SYNC_DEVICE_HEADER]: payload.deviceId }
      })
      .then((res) => res.data.series)
};

/** A stored sales document as the screens expect it — see asProduct for the id fallback. */
const asInvoice = (record: InvoiceRecord): Invoice =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as Invoice;

export const invoicesApi = {
  list: (params?: InvoiceQuery) =>
    localFirst(
      { entity: 'invoices', supported: canServeInvoicesLocally(params ?? {}) },
      async (businessId) => (await localInvoicePage(businessId, { ...params, page: 1, limit: params?.limit ?? 200 })).invoices,
      () => api.get<{ invoices: Invoice[] }>('/invoices', { params }).then((res) => res.data.invoices)
    ),
  lastForCustomer: (customerId: string) =>
    localFirst(
      { entity: 'invoices' },
      async (businessId) =>
        (await localInvoicePage(businessId, { customerId, sort: 'newest', page: 1, limit: 1 })).invoices[0] ?? null,
      () =>
        api.get<{ invoices: Invoice[] }>('/invoices', { params: { customerId, sort: 'newest', limit: 1 } }).then((res) => res.data.invoices[0] ?? null)
    ),
  page: (params: InvoiceQuery) =>
    localFirst(
      { entity: 'invoices', supported: canServeInvoicesLocally(params) },
      (businessId) => localInvoicePage(businessId, params),
      () => api.get<InvoicePage>('/invoices', { params: { ...params, paginated: true } }).then((res) => res.data)
    ),
  /**
   * Issuing a bill. Local-first once the device holds a numbering series: the document, its
   * number and its queued push commit together, so the customer gets a final, permanent
   * invoice number with no network at all.
   *
   * Until a series has been allocated (first run, or a device that has never been online) the
   * number would have to be invented, and an invented GST number can collide with another
   * device's. So that case goes to the server, which is the only party that can number safely.
   */
  create: async (payload: InvoiceCreatePayload) => {
    const online = () =>
      api
        .post<{ invoice: Invoice }>('/invoices', payload, { headers: { 'Idempotency-Key': idempotencyKey('invoice') } })
        .then((res) => res.data.invoice);

    return localWrite(async (businessId) => {
      if (!(await canIssueDocumentsLocally())) return online();
      const { record } = await createInvoiceLocally(payload as unknown as Record<string, unknown>, {
        businessId,
        // Refused with the shortfall unless the user has already confirmed the force sale —
        // the same contract the server applies, so one screen handles both paths.
        allowOversell: payload.allowOversell === true
      });
      return asInvoice(record);
    }, online);
  },
  preview: (payload: InvoiceCreatePayload) =>
    api.post<string>('/invoices/preview', payload, { responseType: 'text', transformResponse: (data) => data }).then((res) => res.data),
  get: (id: string) =>
    localFirst(
      { entity: 'invoices' },
      async (businessId) => (await localInvoice(businessId, id)) ?? Promise.reject(new Error('not held locally')),
      () => api.get<{ invoice: Invoice }>(`/invoices/${id}`).then((res) => res.data.invoice)
    ),
  status: (id: string, status: string, cancelReason?: string) =>
    api.patch<{ invoice: Invoice }>(`/invoices/${id}/status`, { status, ...(cancelReason ? { cancelReason } : {}) }).then((res) => res.data.invoice),
  duplicate: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/duplicate`).then((res) => res.data.invoice),
  remove: (id: string) => api.delete(`/invoices/${id}`).then((res) => res.data),
  whatsapp: (id: string) => api.get<{ link: string; message: string }>(`/invoices/${id}/whatsapp`).then((res) => res.data),
  email: (id: string, email: string) => api.post(`/invoices/${id}/email`, { email }).then((res) => res.data),
  pendingReminders: () => api.get<PendingReminderList>('/invoices/reminders/pending').then((res) => res.data),
  // Mints fresh share links, records the share, and returns one ready-to-open wa.me URL per invoice.
  sendReminders: (invoiceIds: string[]) =>
    api.post<{ reminders: PreparedReminder[]; requested: number; prepared: number }>('/invoices/reminders/send', { invoiceIds }).then((res) => res.data),
  rotateShareLink: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/share/rotate`).then((res) => res.data.invoice),
  revokeShareLink: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/share/revoke`).then((res) => res.data.invoice)
};

// Quotations, delivery challans and credit notes. Same sales-document shape as an invoice,
// so they reuse the Invoice type; documentType decides which rules applied server-side.
export const documentsApi = {
  list: (documentType: SalesDocumentKind, params?: { search?: string; status?: string }) =>
    api.get<{ documents: Invoice[] }>(`/documents/${documentType}`, { params }).then((res) => res.data.documents),
  get: (documentType: SalesDocumentKind, id: string) =>
    api.get<{ document: Invoice }>(`/documents/${documentType}/${id}`).then((res) => res.data.document),
  create: (documentType: SalesDocumentKind, payload: DocumentCreatePayload) =>
    api
      .post<{ document: Invoice }>(`/documents/${documentType}`, payload, { headers: { 'Idempotency-Key': idempotencyKey(documentType) } })
      .then((res) => res.data.document),
  convert: (documentType: SalesDocumentKind, id: string) =>
    api
      .post<{ invoice: Invoice }>(`/documents/${documentType}/${id}/convert`, {}, { headers: { 'Idempotency-Key': idempotencyKey(`convert-${id}`) } })
      .then((res) => res.data.invoice),
  cancel: (documentType: SalesDocumentKind, id: string, cancelReason?: string) =>
    api.post<{ document: Invoice }>(`/documents/${documentType}/${id}/cancel`, { cancelReason }).then((res) => res.data.document)
};

export const ordersApi = {
  list: (params?: OrderQuery) => api.get<{ orders: Order[] }>('/orders', { params }).then((res) => res.data.orders),
  page: (params: OrderQuery) => api.get<OrderPage>('/orders', { params: { ...params, paginated: true } }).then((res) => res.data),
  get: (id: string) => api.get<{ order: Order }>(`/orders/${id}`).then((res) => res.data.order),
  create: (payload: OrderCreatePayload) =>
    api.post<{ order: Order }>('/orders', payload, { headers: { 'Idempotency-Key': idempotencyKey('order') } }).then((res) => res.data.order),
  generateInvoice: (id: string) =>
    api
      .post<{ invoice: Invoice }>(`/orders/${id}/generate-invoice`, {}, { headers: { 'Idempotency-Key': idempotencyKey(`order-invoice-${id}`) } })
      .then((res) => res.data.invoice),
  cancel: (id: string) =>
    api.post<{ order: Order }>(`/orders/${id}/cancel`, {}, { headers: { 'Idempotency-Key': idempotencyKey(`order-cancel-${id}`) } }).then((res) => res.data.order)
};

/**
 * A stored receipt in the response shape the screens expect. Allocation, the customer balance
 * and the ledger are server-computed, so the local answer states only what it knows: the
 * receipt itself. Both call sites read the mutation's success, not its body.
 */
const asPaymentResult = (record: PaymentRecord): RecordPaymentResponse => ({
  success: true,
  payment: { ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId } as Payment,
  allocation: null,
  invoice: null as unknown as Invoice,
  customerBalance: null
});

export const paymentsApi = {
  list: (params?: { invoiceId?: string; customerId?: string }) =>
    localFirst(
      { entity: 'payments' },
      (businessId) => localPayments(businessId, params ?? {}),
      () => api.get<{ payments: Payment[] }>('/payments', { params }).then((res) => res.data.payments)
    ),
  /**
   * Money against one bill. Local-first: cash that crossed the counter is recorded before
   * anything else can go wrong, and the queue carries it to the server. The server owns what
   * the receipt settles — this only records that it was taken.
   */
  recordInvoicePayment: (invoiceId: string, payload: RecordPaymentPayload) => {
    const online = () =>
      api
        .post<RecordPaymentResponse>(`/payments/invoices/${invoiceId}/record`, payload, {
          headers: { 'Idempotency-Key': idempotencyKey(`payment-${invoiceId}`) }
        })
        .then((res) => res.data);

    return localWrite(async (businessId) => {
      const { record } = await recordInvoicePaymentLocally(invoiceId, payload, { businessId });
      return asPaymentResult(record);
    }, online);
  },
  customerOutstanding: (customerId: string) =>
    localFirst(
      { entity: 'invoices' },
      (businessId) => localCustomerOutstanding(businessId, customerId),
      () => api.get<CustomerOutstanding>(`/payments/customers/${customerId}/outstanding`).then((res) => res.data)
    ),
  markRefundProcessed: (invoiceId: string) =>
    api
      .post<{ payments: Payment[] }>(`/payments/invoices/${invoiceId}/refund-processed`, {}, {
        headers: { 'Idempotency-Key': idempotencyKey(`refund-${invoiceId}`) }
      })
      .then((res) => res.data.payments),
  /** One payment settling several of a customer's bills — the dues-collection path. */
  recordCustomerPayment: (customerId: string, payload: CustomerPaymentPayload) => {
    const online = () =>
      api
        .post<CustomerPaymentResponse>(`/payments/customers/${customerId}/record`, payload, {
          headers: { 'Idempotency-Key': idempotencyKey(`cust-payment-${customerId}`) }
        })
        .then((res) => res.data);

    return localWrite(async (businessId) => {
      const { record } = await recordCustomerPaymentLocally(customerId, payload, { businessId });
      const result = asPaymentResult(record);
      return { success: true, payment: result.payment, allocations: [], invoices: [], customerBalance: null };
    }, online);
  }
};

/** A stored expense as the screens expect it — see asProduct for the id fallback. */
const asExpense = (record: ExpenseRecord): Expense =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as Expense;

export const expensesApi = {
  list: (params?: LocalExpenseQuery) =>
    localFirst(
      { entity: 'expenses' },
      (businessId) => localExpenseList(businessId, params ?? {}),
      () => api.get<ExpenseListResponse>('/expenses', { params }).then((res) => res.data)
    ),
  create: (payload: ExpensePayload) =>
    localWrite(
      async (businessId) => asExpense(await createExpenseLocally(payload as ExpenseDoc, { businessId })),
      () =>
        api
          .post<{ expense: Expense }>('/expenses', payload, { headers: { 'Idempotency-Key': idempotencyKey('expense') } })
          .then((res) => res.data.expense)
    ),
  update: (id: string, payload: ExpensePayload) =>
    localWrite(async (businessId) => {
      const existing = await findExpenseByAnyId(id);
      if (!existing) return api.patch<{ expense: Expense }>(`/expenses/${id}`, payload).then((res) => res.data.expense);

      const updated = await updateExpenseLocally(existing.localId, payload as Partial<ExpenseDoc>, { businessId });
      if (!updated) throw new Error('That expense no longer exists on this device');
      return asExpense(updated);
    }, () => api.patch<{ expense: Expense }>(`/expenses/${id}`, payload).then((res) => res.data.expense)),
  remove: (id: string) =>
    localWrite(async (businessId) => {
      const existing = await findExpenseByAnyId(id);
      if (!existing) return api.delete<{ expense: Expense }>(`/expenses/${id}`).then((res) => res.data.expense);
      await deleteExpenseLocally(existing.localId, { businessId });
      return asExpense(existing);
    }, () => api.delete<{ expense: Expense }>(`/expenses/${id}`).then((res) => res.data.expense))
};

/** A stored purchase bill as the screens expect it — see asProduct for the id fallback. */
const asPurchase = (record: PurchaseRecord): PurchaseBill =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as PurchaseBill;

/** A stored supplier as the purchase sheet expects it — see asProduct for the id fallback. */
const asVendor = (record: SupplierRecord): Vendor =>
  ({ ...(record.doc ?? {}), _id: record.doc?._id ?? record.localId }) as Vendor;

export const purchasesApi = {
  list: (params?: LocalPurchaseQuery) =>
    localFirst(
      { entity: 'purchases' },
      (businessId) => localPurchases(businessId, params ?? {}),
      () => api.get<{ purchases: PurchaseBill[] }>('/purchases', { params }).then((res) => res.data.purchases)
    ),
  // Online only: the bill's payments are not held locally, so a local answer would show a
  // settled bill as unpaid.
  get: (id: string) => api.get<{ purchase: PurchaseBill; payments: Payment[] }>(`/purchases/${id}`).then((res) => res.data),
  create: (payload: PurchaseCreatePayload) =>
    localWrite(
      async (businessId) => asPurchase(await createPurchaseLocally(payload as PurchaseDoc, { businessId })),
      () =>
        api
          .post<{ purchase: PurchaseBill }>('/purchases', payload, { headers: { 'Idempotency-Key': idempotencyKey('purchase') } })
          .then((res) => res.data.purchase)
    ),
  cancel: (id: string, cancelReason?: string) =>
    api.post<{ purchase: PurchaseBill }>(`/purchases/${id}/cancel`, { cancelReason }).then((res) => res.data.purchase),

  // Suppliers are local-first, reads and writes: the purchase sheet has to be able to add a
  // vendor at the godown gate. The bills themselves stay online-only — see purchasesApi.create.
  vendors: (search?: string) =>
    localFirst(
      { entity: 'suppliers' },
      (businessId) => localVendors(businessId, search),
      () => api.get<{ vendors: Vendor[] }>('/purchases/vendors', { params: { search } }).then((res) => res.data.vendors)
    ),
  createVendor: (payload: Partial<Vendor>) =>
    localWrite(
      async (businessId) => asVendor(await createSupplierLocally(payload as SupplierDoc, { businessId })),
      () => api.post<{ vendor: Vendor }>('/purchases/vendors', payload).then((res) => res.data.vendor)
    ),
  updateVendor: (id: string, payload: Partial<Vendor>) =>
    localWrite(async (businessId) => {
      const existing = await findSupplierByAnyId(id);
      if (!existing) return api.patch<{ vendor: Vendor }>(`/purchases/vendors/${id}`, payload).then((res) => res.data.vendor);

      const updated = await updateSupplierLocally(existing.localId, payload as Partial<SupplierDoc>, { businessId });
      if (!updated) throw new Error('That supplier no longer exists on this device');
      return asVendor(updated);
    }, () => api.patch<{ vendor: Vendor }>(`/purchases/vendors/${id}`, payload).then((res) => res.data.vendor)),
  vendorOutstanding: (id: string) => api.get<VendorOutstanding>(`/purchases/vendors/${id}/outstanding`).then((res) => res.data),
  payVendor: (id: string, payload: VendorPaymentPayload) =>
    api
      .post<{ outstandingPayable: number }>(`/purchases/vendors/${id}/payments`, payload, {
        headers: { 'Idempotency-Key': idempotencyKey(`vendor-pay-${id}`) }
      })
      .then((res) => res.data)
};

export const reportsApi = {
  summary: (params?: ReportQuery) => api.get<{ report: ReportSummary }>('/reports/summary', { params }).then((res) => res.data.report)
};

export const gstApi = {
  gstr1: (period: string) => api.get<{ report: Gstr1Report }>('/gst/gstr1', { params: { period } }).then((res) => res.data.report),
  gstr3b: (period: string) => api.get<{ report: Gstr3bReport }>('/gst/gstr3b', { params: { period } }).then((res) => res.data.report),
  // CSV comes back as text through the authenticated client; the caller writes and shares it.
  sectionCsv: (period: string, section: Gstr1SectionKey) =>
    api
      .get<string>('/gst/gstr1', { params: { period, format: 'csv', section }, responseType: 'text', transformResponse: (data) => data })
      .then((res) => res.data),
  gstr3bCsv: (period: string) =>
    api
      .get<string>('/gst/gstr3b', { params: { period, format: 'csv' }, responseType: 'text', transformResponse: (data) => data })
      .then((res) => res.data)
};

export const auditApi = {
  page: (params: PageQuery) => api.get<Page<AuditLogEntry, 'auditLogs'>>('/audit-logs', { params }).then((res) => res.data)
};

export const ledgerApi = {
  page: (params: PageQuery) => api.get<Page<LedgerEntryRow, 'ledgerEntries'>>('/ledger', { params }).then((res) => res.data)
};

export const exportsApi = {
  list: () => api.get<DataExport[]>('/exports').then((res) => res.data),
  get: (id: string) => api.get<DataExport>(`/exports/${id}`).then((res) => res.data),
  request: () => api.post<DataExport>('/exports').then((res) => res.data),
  // Returns a short-lived presigned URL; download it without the auth header.
  downloadUrl: (id: string) => api.get<DataExportDownload>(`/exports/${id}/download-url`).then((res) => res.data)
};

export const importsApi = {
  preview: (payload: ImportRequest) => api.post<ImportPreview>('/imports/preview', payload).then((res) => res.data),
  commit: (payload: ImportRequest) =>
    api
      .post<ImportResult>('/imports/commit', payload, { headers: { 'Idempotency-Key': idempotencyKey(`import-${payload.type}`) } })
      .then((res) => res.data)
};

export const notificationsApi = {
  page: (params: NotificationQuery) => api.get<NotificationPage>('/notifications', { params }).then((res) => res.data),
  markSeen: (notificationIds: string[], all = false) => api.patch('/notifications/seen', { notificationIds, all }).then((res) => res.data),
  dismiss: (notificationIds: string[]) => api.patch('/notifications/dismiss', { notificationIds }).then((res) => res.data),
  registerDevice: (token: string, platform: 'android' | 'ios' | 'web') =>
    api.post<{ success: boolean }>('/notifications/devices', { token, platform }).then((res) => res.data),
  unregisterDevice: (token: string) =>
    api.delete<{ success: boolean }>(`/notifications/devices/${encodeURIComponent(token)}`).then((res) => res.data),
  getPreferences: () => api.get<{ preferences: NotificationPreferences }>('/notifications/preferences').then((res) => res.data.preferences),
  updatePreferences: (preferences: NotificationPreferences) =>
    api.put<{ preferences: NotificationPreferences }>('/notifications/preferences', { preferences }).then((res) => res.data.preferences)
};
