import { api } from './client';
import {
  AuditLogEntry,
  AuthSession,
  BusinessProfile,
  BusinessSummary,
  Customer,
  CustomerFormValues,
  CustomerOutstanding,
  CustomerPaymentPayload,
  CustomerPaymentResponse,
  CustomerQuery,
  DocumentType,
  DraftDocument,
  DraftUpsertPayload,
  Invoice,
  InvoiceCreatePayload,
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
  PermissionGroup,
  Product,
  ProductFormValues,
  ProductQuery,
  ProductStockHistory,
  ProductStockMovementQuery,
  RecordPaymentPayload,
  RecordPaymentResponse,
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

export const productsApi = {
  list: (params?: ProductQuery) => api.get<{ products: Product[] }>('/products', { params }).then((res) => res.data.products),
  page: (params: ProductQuery) => api.get<ProductPage>('/products', { params: { ...params, paginated: true } }).then((res) => res.data),
  categories: () => api.get<{ success: boolean; categories: string[] }>('/products/categories').then((res) => res.data.categories),
  create: (payload: ProductFormValues | Partial<Product>) => api.post<{ product: Product }>('/products', payload).then((res) => res.data.product),
  update: (id: string, payload: ProductFormValues | Partial<Product>) => api.patch<{ product: Product }>(`/products/${id}`, payload).then((res) => res.data.product),
  stockMovementsPage: (id: string, params: ProductStockMovementQuery) => api.get<ProductStockHistory>(`/products/${id}/stock-movements`, { params: { ...params, paginated: true } }).then((res) => res.data),
  remove: (id: string) => api.delete(`/products/${id}`).then((res) => res.data)
};

export const customersApi = {
  list: (params?: CustomerQuery) => api.get<{ customers: Customer[] }>('/customers', { params }).then((res) => res.data.customers),
  page: (params: CustomerQuery) => api.get<CustomerPage>('/customers', { params: { ...params, paginated: true } }).then((res) => res.data),
  create: (payload: CustomerFormValues | Partial<Customer>) => api.post<{ customer: Customer }>('/customers', payload).then((res) => res.data.customer),
  update: (id: string, payload: CustomerFormValues | Partial<Customer>) => api.patch<{ customer: Customer }>(`/customers/${id}`, payload).then((res) => res.data.customer),
  remove: (id: string) => api.delete(`/customers/${id}`).then((res) => res.data)
};

export const draftsApi = {
  list: (documentType: DocumentType = 'invoice') => api.get<{ drafts: InvoiceDraftDocument[] }>('/drafts', { params: { documentType } }).then((res) => res.data.drafts),
  upsert: (localDraftId: string, payload: DraftUpsertPayload) => api.put<{ draft: InvoiceDraftDocument }>(`/drafts/${localDraftId}`, payload).then((res) => res.data.draft),
  remove: (localDraftId: string) => api.delete(`/drafts/${localDraftId}`).then((res) => res.data)
};

export const invoicesApi = {
  list: (params?: InvoiceQuery) => api.get<{ invoices: Invoice[] }>('/invoices', { params }).then((res) => res.data.invoices),
  page: (params: InvoiceQuery) => api.get<InvoicePage>('/invoices', { params: { ...params, paginated: true } }).then((res) => res.data),
  create: (payload: InvoiceCreatePayload) =>
    api.post<{ invoice: Invoice }>('/invoices', payload, { headers: { 'Idempotency-Key': idempotencyKey('invoice') } }).then((res) => res.data.invoice),
  preview: (payload: InvoiceCreatePayload) =>
    api.post<string>('/invoices/preview', payload, { responseType: 'text', transformResponse: (data) => data }).then((res) => res.data),
  get: (id: string) => api.get<{ invoice: Invoice }>(`/invoices/${id}`).then((res) => res.data.invoice),
  status: (id: string, status: string, cancelReason?: string) =>
    api.patch<{ invoice: Invoice }>(`/invoices/${id}/status`, { status, ...(cancelReason ? { cancelReason } : {}) }).then((res) => res.data.invoice),
  duplicate: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/duplicate`).then((res) => res.data.invoice),
  remove: (id: string) => api.delete(`/invoices/${id}`).then((res) => res.data),
  whatsapp: (id: string) => api.get<{ link: string; message: string }>(`/invoices/${id}/whatsapp`).then((res) => res.data),
  email: (id: string, email: string) => api.post(`/invoices/${id}/email`, { email }).then((res) => res.data),
  rotateShareLink: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/share/rotate`).then((res) => res.data.invoice),
  revokeShareLink: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/share/revoke`).then((res) => res.data.invoice)
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

export const paymentsApi = {
  list: (params?: { invoiceId?: string; customerId?: string }) => api.get<{ payments: Payment[] }>('/payments', { params }).then((res) => res.data.payments),
  recordInvoicePayment: (invoiceId: string, payload: RecordPaymentPayload) =>
    api
      .post<RecordPaymentResponse>(`/payments/invoices/${invoiceId}/record`, payload, {
        headers: { 'Idempotency-Key': idempotencyKey(`payment-${invoiceId}`) }
      })
      .then((res) => res.data),
  customerOutstanding: (customerId: string) =>
    api.get<CustomerOutstanding>(`/payments/customers/${customerId}/outstanding`).then((res) => res.data),
  markRefundProcessed: (invoiceId: string) =>
    api
      .post<{ payments: Payment[] }>(`/payments/invoices/${invoiceId}/refund-processed`, {}, {
        headers: { 'Idempotency-Key': idempotencyKey(`refund-${invoiceId}`) }
      })
      .then((res) => res.data.payments),
  recordCustomerPayment: (customerId: string, payload: CustomerPaymentPayload) =>
    api
      .post<CustomerPaymentResponse>(`/payments/customers/${customerId}/record`, payload, {
        headers: { 'Idempotency-Key': idempotencyKey(`cust-payment-${customerId}`) }
      })
      .then((res) => res.data)
};

export const reportsApi = {
  summary: (params?: ReportQuery) => api.get<{ report: ReportSummary }>('/reports/summary', { params }).then((res) => res.data.report)
};

export const auditApi = {
  page: (params: PageQuery) => api.get<Page<AuditLogEntry, 'auditLogs'>>('/audit-logs', { params }).then((res) => res.data)
};

export const ledgerApi = {
  page: (params: PageQuery) => api.get<Page<LedgerEntryRow, 'ledgerEntries'>>('/ledger', { params }).then((res) => res.data)
};

export const notificationsApi = {
  page: (params: NotificationQuery) => api.get<NotificationPage>('/notifications', { params }).then((res) => res.data),
  markSeen: (notificationIds: string[], all = false) => api.patch('/notifications/seen', { notificationIds, all }).then((res) => res.data),
  dismiss: (notificationIds: string[]) => api.patch('/notifications/dismiss', { notificationIds }).then((res) => res.data),
  getPreferences: () => api.get<{ preferences: NotificationPreferences }>('/notifications/preferences').then((res) => res.data.preferences),
  updatePreferences: (preferences: NotificationPreferences) =>
    api.put<{ preferences: NotificationPreferences }>('/notifications/preferences', { preferences }).then((res) => res.data.preferences)
};
