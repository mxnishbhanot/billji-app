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
  showPaymentRows: boolean;
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
  taxSettings?: TaxSettings;
  invoiceTemplate?: InvoiceTemplate;
  theme?: 'light' | 'dark';
};

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

export type AuthSession = {
  success?: boolean;
  token: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  user: User;
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
  salePrice?: number; purchasePrice?: number; unit?: string; taxRate?: number; trackStock?: boolean; isActive?: boolean;
  lowStockThreshold: number; isLowStock?: boolean; totalSales?: number; quantitySold?: number; createdAt?: string; updatedAt?: string;
};

export type StockMovement = {
  _id: string; type: string; quantityChange: number; stockBefore: number; stockAfter: number; note?: string; invoiceNumber?: string; documentNumber?: string; documentType?: string; createdAt?: string;
  customerName?: string; invoiceQuantity?: number; invoiceTotalForProduct?: number; invoiceStatus?: string; documentStatus?: string; paymentStatus?: string; fulfillmentStatus?: string; invoiceDate?: string | null;
};
export type ProductHistorySummary = { quantitySold: number; revenue: number; orderCount: number };
export type ProductStockHistory = Page<StockMovement, 'movements'> & { product?: Pick<Product, '_id' | 'name' | 'price' | 'stockQuantity' | 'sku' | 'category' | 'unit' | 'taxRate' | 'purchasePrice' | 'trackStock' | 'isActive'>; summary?: ProductHistorySummary };
export type Customer = { _id: string; name: string; phone: string; countryCode?: string; email?: string; address?: string; billingAddress?: Record<string, string>; shippingAddress?: Record<string, string>; gstNumber?: string; taxIdentifiers?: Record<string, string>; contactPersons?: Record<string, string>[]; creditBalance?: number; outstandingDues?: number; isActive?: boolean; createdAt?: string; updatedAt?: string };
export type InvoiceItem = { _id?: string; _uid?: string; product?: string | null; productId?: string; name: string; sku?: string; unit?: string; quantity: number; price: number; purchasePrice?: number; taxRate?: number; taxAmount?: number; total?: number; isCustom?: boolean };
export type InvoiceCreateItem = Pick<InvoiceItem, 'productId' | 'name' | 'sku' | 'unit' | 'quantity' | 'price' | 'taxRate' | 'isCustom'>;
export type InvoiceCreatePayload = {
  customerId: string;
  items: InvoiceCreateItem[];
  taxRate: number;
  discountType: DiscountType;
  discountValue: number;
  notes: string;
  allowOversell?: boolean;
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
  _id: string; invoiceNumber: string; date: string; dueDate?: string | null; customer?: string | null; customerSnapshot: Customer;
  items: InvoiceItem[]; subtotal: number; tax: { rate: number; amount: number }; discount: { type: DiscountType; value: number; amount: number };
  total: number; paidAmount?: number; balanceDue?: number; status: InvoiceStatus; documentStatus?: string; paymentStatus?: InvoicePaymentStatus; fulfillmentStatus?: string; sourceOrder?: string | null; notes?: string; pdfUrl: string; shareToken?: string; shareExpiresAt?: string | null; shareRevokedAt?: string | null; emailedAt?: string | null; cancelledAt?: string | null; cancelledBy?: string | null; cancelReason?: string; eligibility?: InvoiceEligibility; createdAt?: string; updatedAt?: string;
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

export type NotificationItem = {
  id: string; type: string; resourceType: 'product' | 'invoice' | 'customer' | 'payment' | 'draft' | 'activity'; resourceId: string; tone: 'danger' | 'warning' | 'info';
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
};

export type ProductFormValues = {
  name: string;
  price: string;
  stockQuantity: string;
  sku?: string;
  category?: string;
  unit?: string;
  lowStockThreshold?: string;
};

export type CustomItemFormValues = {
  name: string;
  price: string;
  quantity: string;
  unit: string;
};
