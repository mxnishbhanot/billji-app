export type InvoiceStatus = 'pending' | 'paid' | 'cancelled';
export type DiscountType = 'flat' | 'percentage';

export type BusinessProfile = {
  businessName?: string;
  logoUrl?: string;
  gstNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  invoicePrefix?: string;
  theme?: 'light' | 'dark';
};

export type User = {
  id: string;
  name: string;
  email: string;
  businessProfile: BusinessProfile;
  createdAt?: string;
};

export type AuthSession = { success?: boolean; token: string; user: User };
export type Pagination = { page: number; limit: number; total: number; totalPages: number; hasMore: boolean; nextPage: number | null };

export type Product = {
  _id: string; id?: string; name: string; price: number; stockQuantity: number; sku?: string; category?: string;
  lowStockThreshold: number; isLowStock?: boolean; createdAt?: string; updatedAt?: string;
};

export type StockMovement = { _id: string; type: string; quantityChange: number; stockBefore: number; stockAfter: number; note?: string; invoiceNumber?: string; createdAt?: string };
export type Customer = { _id: string; name: string; phone: string; email?: string; address?: string; createdAt?: string; updatedAt?: string };
export type InvoiceItem = { _id?: string; product?: string | null; productId?: string; name: string; sku?: string; quantity: number; price: number; total?: number; isCustom?: boolean };

export type Invoice = {
  _id: string; invoiceNumber: string; date: string; dueDate?: string | null; customer?: string | null; customerSnapshot: Customer;
  items: InvoiceItem[]; subtotal: number; tax: { rate: number; amount: number }; discount: { type: DiscountType; value: number; amount: number };
  total: number; status: InvoiceStatus; notes?: string; pdfUrl: string; shareToken?: string; emailedAt?: string | null; createdAt?: string; updatedAt?: string;
};

export type NotificationItem = {
  id: string; type: string; resourceType: 'product' | 'invoice'; resourceId: string; tone: 'danger' | 'warning' | 'info';
  title: string; description: string; to: string; read: boolean;
};

export type ReportSummary = {
  todaySales: number; weeklySales: number; monthlySales: number; totalInvoices: number; pendingInvoices: number; averageInvoiceValue: number;
  rangeSales: number; rangeLabel: string;
  invoiceCounts: Partial<Record<InvoiceStatus, number>>; topProducts: { name: string; quantity: number; sales: number }[];
  salesTrend: { date: string; sales: number; invoices: number }[]; recentInvoices: Invoice[];
};

export type Page<T, K extends string> = { success: boolean; pagination: Pagination } & Record<K, T[]>;
