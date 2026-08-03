export type InvoiceStatus = 'pending' | 'paid' | 'cancelled';
export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type DiscountType = 'flat' | 'percentage';
export type DocumentType = 'quotation' | 'order' | 'invoice' | 'delivery_challan' | 'credit_note' | 'refund_note';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'wallet' | 'other';
export type PaymentRecordStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'receipt' | 'refund';
export type ApiParamValue = string | number | boolean | null | undefined;
export type ApiParams = Record<string, ApiParamValue>;

export type TaxSettings = {
  defaultRate: number;
  pricesIncludeTax: boolean;
  compoundTax: boolean;
};

export type InvoiceTemplate = {
  accentColor: string;
  showLogo: boolean;
  showNotes: boolean;
  showSignature: boolean;
  signatureUrl?: string;
  showPaymentRows: boolean;
  notes?: string;
};

export type BusinessProfile = {
  businessName?: string;
  logoUrl?: string;
  gstNumber?: string;
  phone?: string;
  countryCode?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  pinCode?: string;
  state?: string;
  invoicePrefix?: string;
  panNumber?: string;
  // GST state code of the place of business; derived from the GSTIN when one is set.
  stateCode?: string;
  taxSettings?: TaxSettings;
  invoiceTemplate?: InvoiceTemplate;
  // WhatsApp payment-reminder text. Empty = server default. Tokens: {name} {invoice}
  // {amount} {link} {business} {days}.
  reminderTemplate?: string;
  theme?: 'light' | 'dark';
};

export type PendingReminder = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  countryCode: string;
  total: number;
  balanceDue: number;
  dueDate: string | null;
  daysOverdue: number;
  reason: 'overdue' | 'pending';
};

export type PendingReminderList = {
  reminders: PendingReminder[];
  totalOutstanding: number;
  skippedWithoutPhone: number;
  template: string;
};

export type PreparedReminder = PendingReminder & { message: string; pdfUrl: string; whatsappUrl: string };

export type BusinessProfileFormValues = {
  businessName: string;
  logoUrl?: string;
  gstNumber?: string;
  phone?: string;
  countryCode?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  pinCode?: string;
  state?: string;
  invoicePrefix: string;
  panNumber?: string;
  theme: 'light' | 'dark';
};

export type User = {
  id: string;
  name: string;
  email: string;
  businessId?: string | null;
  roleKey?: 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer';
  permissions?: string[];
  businessProfile: BusinessProfile;
  createdAt?: string;
};

export type MemberStatus = 'invited' | 'active' | 'archived' | 'removed';

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  roleKey: NonNullable<User['roleKey']>;
  roleName?: string | null;
  roleId?: string | null;
  status: MemberStatus;
  joinedAt?: string;
};

export type TeamInvitation = {
  id: string;
  email: string;
  roleKey: NonNullable<User['roleKey']>;
  roleName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  isArchived: boolean;
  permissions: string[];
};

export type PermissionGroup = {
  domain: string;
  label: string;
  permissions: { name: string; key: string; label: string }[];
};

export type BusinessSummary = {
  businessId: string;
  businessName: string;
  roleKey: NonNullable<User['roleKey']>;
  current: boolean;
};

export type AuthSession = {
  success?: boolean;
  token: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  user: User;
  // Present on the /2fa/verify response when the user asked to trust the device.
  trustedDeviceToken?: string;
};

export type TwoFactorMethod = 'none' | 'totp' | 'email';

// Returned by /login and /google when the account has 2FA on and the device is
// not trusted — no session yet, the client must complete /2fa/verify.
export type TwoFactorChallenge = {
  success?: boolean;
  twoFactorRequired: true;
  method: Exclude<TwoFactorMethod, 'none'>;
  challengeToken: string;
  email?: string;
  // Non-production only: the emailed code echoed for local testing.
  devCode?: string;
};

// A credential submit either logs in outright or requires a second factor.
export type LoginResult = AuthSession | TwoFactorChallenge;

export const isTwoFactorChallenge = (result: LoginResult): result is TwoFactorChallenge =>
  (result as TwoFactorChallenge).twoFactorRequired === true;

export type TwoFactorStatus = {
  method: TwoFactorMethod;
  enabled: boolean;
  enabledAt?: string | null;
  pendingMethod?: TwoFactorMethod | null;
  backupCodesRemaining: number;
};
export type UserSession = {
  id: string;
  business?: string;
  userAgent?: string;
  deviceName?: string;
  ipAddress?: string;
  lastUsedAt?: string;
  createdAt?: string;
  current?: boolean;
};
export type Pagination = { page: number; limit: number; total: number; totalPages: number; hasMore: boolean; nextPage: number | null };
export type PageQuery = ApiParams & { page?: number; limit?: number; paginated?: boolean };

export type Product = {
  _id: string; id?: string; name: string; price: number; stockQuantity: number; sku?: string; category?: string;
  salePrice?: number; purchasePrice?: number; unit?: string; taxRate?: number; hsn?: string; barcode?: string; trackStock?: boolean; isActive?: boolean;
  lowStockThreshold: number; isLowStock?: boolean; totalSales?: number; quantitySold?: number; createdAt?: string; updatedAt?: string;
};

export type StockMovement = {
  _id: string; type: string; quantityChange: number; stockBefore: number; stockAfter: number; note?: string; invoiceNumber?: string; documentNumber?: string; documentType?: string; createdAt?: string;
  customerName?: string; invoiceQuantity?: number; invoiceTotalForProduct?: number; invoiceStatus?: string; documentStatus?: string; paymentStatus?: string; fulfillmentStatus?: string; invoiceDate?: string | null;
};
export type ProductHistorySummary = { quantitySold: number; revenue: number; orderCount: number };
export type ProductStockHistory = Page<StockMovement, 'movements'> & { product?: Pick<Product, '_id' | 'name' | 'price' | 'stockQuantity' | 'sku' | 'category' | 'unit' | 'taxRate' | 'purchasePrice' | 'trackStock' | 'isActive'>; summary?: ProductHistorySummary };
export type Customer = { _id: string; name: string; phone: string; countryCode?: string; email?: string; address?: string; billingAddress?: Record<string, string>; shippingAddress?: Record<string, string>; gstNumber?: string; taxIdentifiers?: Record<string, string>; contactPersons?: Record<string, string>[]; creditBalance?: number; outstandingDues?: number; isActive?: boolean; createdAt?: string; updatedAt?: string };
export type GstTaxSummaryRow = { hsn: string; rate: number; taxableValue: number; cgst: number; sgst: number; igst: number; taxAmount: number };

export type ExpenseCategory =
  | 'rent' | 'salary' | 'transport' | 'utilities' | 'purchase' | 'repairs'
  | 'marketing' | 'professional_fees' | 'bank_charges' | 'travel' | 'office_supplies' | 'other';

export type Expense = {
  _id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  vendorName?: string;
  reference?: string;
  notes?: string;
  isVoided?: boolean;
  createdAt?: string;
};

export type ExpenseSummary = {
  total: number;
  count: number;
  byCategory: { category: ExpenseCategory; total: number; count: number }[];
};

export type ExpenseListResponse = { expenses: Expense[]; summary: ExpenseSummary };

export type ExpenseFormValues = {
  amount: string;
  taxAmount: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  vendorName: string;
  notes: string;
};

export type ExpensePayload = {
  amount: number;
  taxAmount?: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  vendorName?: string;
  notes?: string;
  date?: string;
};

export type Vendor = {
  _id: string;
  name: string;
  phone?: string;
  countryCode?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  panNumber?: string;
  notes?: string;
  outstandingPayable?: number;
  isActive?: boolean;
};

export type VendorFormValues = { name: string; phone: string; gstNumber: string; address: string };

export type PurchaseItem = {
  _id?: string;
  product?: string | null;
  productId?: string;
  name: string;
  sku?: string;
  hsn?: string;
  unit?: string;
  quantity: number;
  price: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
  isCustom?: boolean;
};

export type PurchaseBill = {
  _id: string;
  billNumber: string;
  vendorBillNumber?: string;
  vendor: string;
  vendorSnapshot: { name: string; phone?: string; gstNumber?: string };
  date: string;
  dueDate?: string | null;
  items: PurchaseItem[];
  subtotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  supplyType?: 'intra' | 'inter';
  status: 'received' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  notes?: string;
};

export type PurchaseCreatePayload = {
  vendorId: string;
  items: { productId?: string; name: string; quantity: number; price: number; taxRate?: number; hsn?: string }[];
  vendorBillNumber?: string;
  taxRate?: number;
  notes?: string;
};

export type VendorOutstanding = {
  vendor: Vendor;
  billed: number;
  paid: number;
  outstandingPayable: number;
  bills: { _id: string; billNumber: string; date: string; total: number; paidAmount: number; balanceDue: number }[];
};

export type VendorPaymentPayload = { amount: number; method: PaymentMethod; billId?: string; reference?: string; notes?: string };

export type Gstr1SectionKey = 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'hsn';

/** Sales documents that are not invoices or orders — each has its own number series. */
export type SalesDocumentKind = 'quotation' | 'delivery_challan' | 'credit_note';

/**
 * The number to show for any sales document. Invoices carry invoiceNumber; quotations,
 * challans and credit notes only have documentNumber.
 */
export const documentNumberOf = (document: { invoiceNumber?: string; documentNumber?: string }) =>
  document.invoiceNumber || document.documentNumber || '';

export type DocumentCreatePayload = {
  customerId: string;
  items: InvoiceCreateItem[];
  taxRate: number;
  discountType: DiscountType;
  discountValue: number;
  notes: string;
  placeOfSupplyCode?: string;
  allowOversell?: boolean;
  /** Quotation only. */
  validUntil?: string;
  /** Credit note only — the invoice being reversed. */
  sourceInvoiceId?: string;
  reason?: string;
};

export type Gstr1Report = {
  period: string;
  gstin: string;
  businessName: string;
  counts: Record<Gstr1SectionKey, number>;
  totals: {
    invoiceCount: number; cancelledCount: number; taxableValue: number;
    cgst: number; sgst: number; igst: number; taxAmount: number; invoiceValue: number;
  };
  // Non-zero when the month contains invoices issued before per-item GST, whose split was
  // inferred from a single document rate.
  reconstructedInvoices: number;
  documentSeries: { issued: number; cancelled: number; from: string; to: string };
};

export type Gstr3bReport = {
  period: string;
  gstin: string;
  businessName: string;
  outwardTaxableSupplies: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  invoiceCount: number;
  cancelledCount: number;
  reconstructedInvoices: number;
};
export type InvoiceItem = { _id?: string; _uid?: string; product?: string | null; productId?: string; name: string; sku?: string; unit?: string; quantity: number; price: number; purchasePrice?: number; taxRate?: number; hsn?: string; taxableValue?: number; taxAmount?: number; cgst?: number; sgst?: number; igst?: number; total?: number; isCustom?: boolean };
export type InvoiceCreateItem = Pick<InvoiceItem, 'productId' | 'name' | 'sku' | 'unit' | 'quantity' | 'price' | 'taxRate' | 'hsn' | 'isCustom'>;
export type InvoiceCreatePayload = {
  customerId: string;
  items: InvoiceCreateItem[];
  taxRate: number;
  discountType: DiscountType;
  discountValue: number;
  notes: string;
  // Optional override; the server resolves place of supply from the customer otherwise.
  placeOfSupplyCode?: string;
  allowOversell?: boolean;
  /** Preview only — makes the rendered sheet a quotation/challan instead of a tax invoice. */
  documentType?: SalesDocumentKind;
};

export type InvoiceDraftPayload = {
  selectedCustomerId: string;
  selectedCustomer: Customer | null;
  items: InvoiceItem[];
  taxRate: string;
  discountType: DiscountType;
  discountValue: string;
  notes: string;
};

export type DraftDocument<TPayload = Record<string, unknown>> = {
  _id?: string;
  localDraftId: string;
  serverDraftId?: string | null;
  businessId?: string | null;
  documentType: DocumentType;
  schemaVersion: number;
  payload: TPayload;
  dirty: boolean;
  lastEditedAt: string;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DraftUpsertPayload<TPayload = Record<string, unknown>> = Pick<
  DraftDocument<TPayload>,
  'documentType' | 'schemaVersion' | 'payload' | 'dirty' | 'lastEditedAt'
>;

export type InvoiceEligibility = {
  hasPayments: boolean;
  hasStockMovements: boolean;
  hasLedgerEntries: boolean;
  canCancel: boolean;
  canDelete: boolean;
};

export type Invoice = {
  // documentNumber is the real identity for every sales document; invoiceNumber is only
  // present on invoices (a quotation deliberately has none).
  _id: string; invoiceNumber?: string; documentNumber?: string; documentType?: DocumentType;
  sourceInvoice?: string | null; sourceDocument?: string | null; validUntil?: string | null; reason?: string;
  date: string; dueDate?: string | null; customer?: string | null; customerSnapshot: Customer;
  items: InvoiceItem[]; subtotal: number; tax: { rate: number; amount: number }; discount: { type: DiscountType; value: number; amount: number };
  // GST fields. Absent on documents issued before the GST engine — a missing taxSummary
  // means "legacy single-rate", and the UI falls back to the old single tax row.
  placeOfSupply?: { code: string; state: string }; supplyType?: 'intra' | 'inter'; taxSummary?: GstTaxSummaryRow[];
  total: number; paidAmount?: number; balanceDue?: number; status: InvoiceStatus; documentStatus?: string; paymentStatus?: InvoicePaymentStatus; fulfillmentStatus?: string; sourceOrder?: string | null; notes?: string; pdfUrl: string; shareToken?: string; shareExpiresAt?: string | null; shareRevokedAt?: string | null; emailedAt?: string | null; cancelledAt?: string | null; cancelledBy?: string | null; cancelReason?: string; refundResolvedAt?: string | null; eligibility?: InvoiceEligibility; createdAt?: string; updatedAt?: string;
};

export type OrderStatus = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled';
export type OrderFulfillmentStatus = 'pending' | 'delivered' | 'returned' | 'not_applicable';

export type Order = {
  _id: string; orderNumber: string; date: string; customer?: string | null; customerSnapshot: Customer;
  items: InvoiceItem[]; subtotal: number; tax: { rate: number; amount: number }; discount: { type: DiscountType; value: number; amount: number };
  total: number; orderStatus: OrderStatus; fulfillmentStatus: OrderFulfillmentStatus;
  paymentStatus: InvoicePaymentStatus; paidAmount: number; balanceDue: number; invoiceCount?: number;
  linkedInvoice?: { id: string; invoiceNumber: string; status?: InvoiceStatus } | null;
  notes?: string; createdAt?: string; updatedAt?: string;
};

export type OrderCreatePayload = {
  customerId: string;
  items: InvoiceCreateItem[];
  taxRate: number;
  discountType: DiscountType;
  discountValue: number;
  notes: string;
};

export type PaymentProviderMetadata = {
  provider?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  providerSignature?: string;
  webhookEventId?: string;
};

export type Payment = {
  _id: string;
  business?: string;
  customer?: string | null;
  salesDocument?: string | null;
  invoice?: string | null;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentRecordStatus;
  refundStatus?: 'none' | 'pending' | 'processed';
  amount: number;
  allocatedAmount: number;
  unappliedAmount: number;
  currency: string;
  reference?: string;
  notes?: string;
  receivedAt: string;
  provider?: PaymentProviderMetadata;
  createdAt?: string;
  updatedAt?: string;
};

export type PaymentAllocation = {
  _id: string;
  payment: string;
  salesDocument: string;
  invoice: string;
  customer?: string | null;
  amount: number;
  allocatedAt: string;
};

export type CustomerBalance = {
  _id: string;
  customer: string;
  outstandingDues: number;
  creditBalance: number;
  currency: string;
  lastCalculatedAt: string;
};

export type RecordPaymentPayload = {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  receivedAt?: string;
  provider?: PaymentProviderMetadata;
};

export type RecordPaymentResponse = {
  success: boolean;
  payment: Payment;
  allocation: PaymentAllocation | null;
  invoice: Invoice;
  customerBalance: CustomerBalance | null;
};

export type OutstandingInvoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  balanceDue: number;
};

export type CustomerOutstanding = {
  success?: boolean;
  invoices: OutstandingInvoice[];
  totalOutstanding: number;
};

export type CustomerPaymentPayload = {
  amount: number;
  invoiceIds: string[];
  method: PaymentMethod;
  allowCredit?: boolean;
  reference?: string;
  notes?: string;
  receivedAt?: string;
};

export type CustomerPaymentResponse = {
  success: boolean;
  payment: Payment;
  allocations: PaymentAllocation[];
  invoices: Invoice[];
  customerBalance: CustomerBalance | null;
};

export type AuditLogEntry = {
  _id: string;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  user?: { _id?: string; name?: string; email?: string } | string | null;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type LedgerEntryRow = {
  _id: string;
  account: string;
  direction: 'debit' | 'credit';
  amount: number;
  currency?: string;
  sourceType: string;
  description?: string;
  entryDate?: string;
  customer?: { _id?: string; name?: string } | string | null;
  createdAt?: string;
};

export type DataExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type DataExport = {
  id: string;
  status: DataExportStatus;
  fileName: string;
  sizeBytes: number;
  counts: Record<string, number>;
  requestedAt?: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  emailedAt?: string | null;
  downloadCount: number;
  isExpired: boolean;
  error?: string;
};

export type DataExportDownload = { url: string; fileName: string; sizeBytes: number };

export type ImportType = 'customers' | 'products';
export type ImportRowStatus = 'create' | 'update' | 'duplicate' | 'error';

export type ImportField = { name: string; label: string; required: boolean; example?: string };

export type ImportPreviewRow = {
  line: number;
  status: ImportRowStatus;
  label?: string;
  errors: string[];
  duplicateOfLine?: number;
};

export type ImportPreview = {
  type: ImportType;
  headers: string[];
  /** Our field name → the header in their file. */
  columnMap: Record<string, string>;
  fields: ImportField[];
  duplicateLabel: string;
  total: number;
  counts: Record<ImportRowStatus, number>;
  preview: ImportPreviewRow[];
};

export type ImportResult = {
  type: ImportType;
  mode: 'skip' | 'update';
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: ImportPreviewRow[];
};

export type ImportRequest = {
  type: ImportType;
  csv: string;
  columnMap?: Record<string, string>;
  mode?: 'skip' | 'update';
};

export type NotificationItem = {
  id: string; type: string; resourceType: 'product' | 'invoice' | 'customer' | 'payment' | 'draft' | 'activity' | 'data_export'; resourceId: string; tone: 'danger' | 'warning' | 'info';
  title: string; description: string; to: string; read: boolean; sortDate?: string;
};

export type NotificationChannelPrefs = { inApp?: boolean; push?: boolean };
export type NotificationPreferences = Record<string, NotificationChannelPrefs>;

export type StockShortage = {
  productId: string;
  name: string;
  sku?: string;
  requested: number;
  available: number;
  shortage: number;
};

export type ReportSummary = {
  todaySales: number; weeklySales: number; monthlySales: number; totalInvoices: number; pendingInvoices: number; averageInvoiceValue: number;
  rangeSales: number; rangeLabel: string;
  invoiceCounts: Partial<Record<InvoiceStatus, number>>; topProducts: { name: string; quantity: number; sales: number }[];
  salesTrend: { date: string; sales: number; invoices: number }[]; recentInvoices: Invoice[];
  // Q1 — how much did I sell? (invoiced/gross)
  sales: {
    today: number; week: number; month: number; range: number; rangeLabel: string; invoiceCount: number;
    trend: { date: string; sales: number; invoices: number }[];
  };
  // Q2 — how much did I collect? (real payments)
  collected: {
    today: number; week: number; month: number; range: number; rangeLabel: string;
    invoicedInRange: number; uncollectedInRange: number;
    methodBreakdown: { method: PaymentMethod; amount: number; count: number }[];
  };
  // Q3 — who owes me money? (open-balance snapshot)
  dues: {
    totalOutstanding: number; unpaidCount: number; unpaidAmount: number; partialCount: number; partialAmount: number;
    topDebtors: { customerId: string | null; name: string; balance: number; invoices: number }[];
  };
  // Q5 — am I actually making money?
  profit: {
    rangeLabel: string;
    revenue: number;
    costOfGoods: number;
    grossProfit: number;
    expenses: number;
    expenseCount: number;
    expensesByCategory: { category: ExpenseCategory; total: number; count: number }[];
    netProfit: number;
    /** % of sold lines that had a purchase price recorded — how trustworthy the margin is. */
    costCoverage: number;
    /** Stock bought in the period, and what is still owed for it. Not deducted from profit. */
    purchases: number;
    purchaseCount: number;
    payables: number;
  };
  // Q4 — what is performing well?
  performance: {
    topProducts: { name: string; quantity: number; sales: number }[];
    topCustomers: { customerId: string | null; name: string; sales: number; invoices: number }[];
    averageInvoiceValue: number;
  };
};

export type Page<T, K extends string> = { success: boolean; pagination: Pagination } & Record<K, T[]>;

export type ProductQuery = PageQuery & {
  search?: string;
  category?: string;
  stockStatus?: 'all' | 'available' | 'low' | 'out';
  status?: 'all' | 'active' | 'inactive';
  minPrice?: number | string;
  maxPrice?: number | string;
  sort?: 'updated' | 'top-sales' | 'name-asc' | 'price-high' | 'price-low' | 'stock-low';
  from?: string;
  to?: string;
};

export type CustomerQuery = PageQuery & {
  search?: string;
  contactInfo?: 'withEmail' | 'withoutEmail' | 'withAddress' | 'withoutAddress' | '';
  billingStatus?: 'all' | 'invoiced' | 'notInvoiced' | 'pending' | 'paid';
  sort?: 'updated' | 'newest' | 'oldest' | 'name-asc';
};

export type InvoiceQuery = PageQuery & {
  search?: string;
  customerId?: string;
  status?: '' | InvoiceStatus;
  from?: string;
  to?: string;
  minAmount?: number | string;
  maxAmount?: number | string;
  sort?: 'newest' | 'oldest' | 'amount-high' | 'amount-low';
};

export type OrderQuery = PageQuery & {
  search?: string;
  orderStatus?: '' | OrderStatus;
  paymentStatus?: '' | InvoicePaymentStatus;
  fulfillmentStatus?: '' | OrderFulfillmentStatus;
  customerId?: string;
  from?: string;
  to?: string;
  minAmount?: number | string;
  maxAmount?: number | string;
  sort?: 'newest' | 'oldest' | 'amount-high' | 'amount-low';
};

export type ReportQuery = ApiParams & { from?: string; to?: string };
export type NotificationQuery = PageQuery;
export type ProductStockMovementQuery = PageQuery;

export type CustomerFormValues = {
  name: string;
  phone: string;
  countryCode?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
};

export type ProductFormValues = {
  name: string;
  price: string;
  stockQuantity: string;
  sku?: string;
  category?: string;
  unit?: string;
  hsn?: string;
  taxRate?: string;
  barcode?: string;
  lowStockThreshold?: string;
};

export type CustomItemFormValues = {
  name: string;
  price: string;
  quantity: string;
  unit: string;
};
