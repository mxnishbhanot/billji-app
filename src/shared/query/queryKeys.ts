import { ApiParams } from '@/types';

export type QueryParams = ApiParams;

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    sessions: ['auth', 'sessions'] as const,
    twoFactor: ['auth', '2fa'] as const
  },
  customers: {
    all: ['customers'] as const,
    list: (params?: QueryParams) => ['customers', params ?? {}] as const,
    picker: (params?: QueryParams) => ['customers', 'picker', params ?? {}] as const
  },
  products: {
    all: ['products'] as const,
    list: (params?: QueryParams) => ['products', params ?? {}] as const,
    categories: ['products', 'categories'] as const,
    picker: (params?: QueryParams) => ['products', 'picker', params ?? {}] as const,
    stockMovements: (id?: string) => ['products', id, 'stock-movements'] as const
  },
  invoices: {
    all: ['invoices'] as const,
    list: (params?: QueryParams) => ['invoices', params ?? {}] as const,
    detail: (id: string) => ['invoices', id] as const
  },
  orders: {
    all: ['orders'] as const,
    list: (params?: QueryParams) => ['orders', params ?? {}] as const,
    detail: (id: string) => ['orders', id] as const
  },
  notifications: {
    all: ['notifications'] as const,
    preferences: ['notifications', 'preferences'] as const
  },
  drafts: {
    all: ['drafts'] as const
  },
  payments: {
    all: ['payments'] as const,
    invoice: (id: string) => ['payments', 'invoice', id] as const,
    customer: (id: string) => ['payments', 'customer', id] as const,
    customerOutstanding: (id: string) => ['payments', 'customer', id, 'outstanding'] as const
  },
  report: {
    all: ['report'] as const,
    summary: (params?: QueryParams) => ['report', params ?? {}] as const
  },
  audit: {
    all: ['audit'] as const,
    list: (params?: QueryParams) => ['audit', params ?? {}] as const
  },
  ledger: {
    all: ['ledger'] as const,
    list: (params?: QueryParams) => ['ledger', params ?? {}] as const
  },
  team: {
    all: ['team'] as const,
    members: ['team', 'members'] as const,
    invitations: ['team', 'invitations'] as const
  },
  roles: {
    all: ['roles'] as const,
    list: ['roles', 'list'] as const,
    permissionCatalog: ['roles', 'permissions'] as const,
    detail: (id: string) => ['roles', id] as const
  },
  businesses: {
    all: ['businesses'] as const
  },
  onboarding: {
    progress: ['onboarding', 'progress'] as const
  },
  exports: {
    all: ['exports'] as const,
    detail: (id: string) => ['exports', id] as const
  }
} as const;
