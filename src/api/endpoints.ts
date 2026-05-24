import { api } from './client';
import { AuthSession, Customer, Invoice, NotificationItem, Page, Product, ReportSummary, StockMovement, User } from '@/types';

type ProductPage = Page<Product, 'products'>;
type CustomerPage = Page<Customer, 'customers'>;
type InvoicePage = Page<Invoice, 'invoices'>;
type MovementPage = Page<StockMovement, 'movements'>;
type NotificationPage = Page<NotificationItem, 'notifications'> & { unreadCount: number };

export const authApi = {
  register: (payload: { name: string; email: string; password: string }) => api.post<AuthSession>('/auth/register', payload).then((res) => res.data),
  login: (payload: { email: string; password: string }) => api.post<AuthSession>('/auth/login', payload).then((res) => res.data),
  me: () => api.get<{ success: boolean; user: User }>('/auth/me').then((res) => res.data.user),
  updateSettings: (payload: Record<string, unknown>) => api.patch<{ success: boolean; user: User }>('/settings', payload).then((res) => res.data)
};

export const productsApi = {
  list: (params?: Record<string, unknown>) => api.get<{ products: Product[] }>('/products', { params }).then((res) => res.data.products),
  page: (params: Record<string, unknown>) => api.get<ProductPage>('/products', { params: { ...params, paginated: true } }).then((res) => res.data),
  create: (payload: Record<string, unknown>) => api.post<{ product: Product }>('/products', payload).then((res) => res.data.product),
  update: (id: string, payload: Record<string, unknown>) => api.patch<{ product: Product }>(`/products/${id}`, payload).then((res) => res.data.product),
  stockMovementsPage: (id: string, params: Record<string, unknown>) => api.get<MovementPage>(`/products/${id}/stock-movements`, { params: { ...params, paginated: true } }).then((res) => res.data),
  remove: (id: string) => api.delete(`/products/${id}`).then((res) => res.data)
};

export const customersApi = {
  list: (params?: Record<string, unknown>) => api.get<{ customers: Customer[] }>('/customers', { params }).then((res) => res.data.customers),
  page: (params: Record<string, unknown>) => api.get<CustomerPage>('/customers', { params: { ...params, paginated: true } }).then((res) => res.data),
  create: (payload: Record<string, unknown>) => api.post<{ customer: Customer }>('/customers', payload).then((res) => res.data.customer),
  update: (id: string, payload: Record<string, unknown>) => api.patch<{ customer: Customer }>(`/customers/${id}`, payload).then((res) => res.data.customer),
  remove: (id: string) => api.delete(`/customers/${id}`).then((res) => res.data)
};

export const invoicesApi = {
  list: (params?: Record<string, unknown>) => api.get<{ invoices: Invoice[] }>('/invoices', { params }).then((res) => res.data.invoices),
  page: (params: Record<string, unknown>) => api.get<InvoicePage>('/invoices', { params: { ...params, paginated: true } }).then((res) => res.data),
  create: (payload: Record<string, unknown>) => api.post<{ invoice: Invoice }>('/invoices', payload).then((res) => res.data.invoice),
  get: (id: string) => api.get<{ invoice: Invoice }>(`/invoices/${id}`).then((res) => res.data.invoice),
  status: (id: string, status: string) => api.patch<{ invoice: Invoice }>(`/invoices/${id}/status`, { status }).then((res) => res.data.invoice),
  duplicate: (id: string) => api.post<{ invoice: Invoice }>(`/invoices/${id}/duplicate`).then((res) => res.data.invoice),
  remove: (id: string) => api.delete(`/invoices/${id}`).then((res) => res.data),
  whatsapp: (id: string) => api.get<{ link: string; message: string }>(`/invoices/${id}/whatsapp`).then((res) => res.data),
  email: (id: string, email: string) => api.post(`/invoices/${id}/email`, { email }).then((res) => res.data)
};

export const reportsApi = {
  summary: (params?: Record<string, unknown>) => api.get<{ report: ReportSummary }>('/reports/summary', { params }).then((res) => res.data.report)
};

export const notificationsApi = {
  page: (params: Record<string, unknown>) => api.get<NotificationPage>('/notifications', { params }).then((res) => res.data),
  markSeen: (notificationIds: string[]) => api.patch('/notifications/seen', { notificationIds }).then((res) => res.data)
};
