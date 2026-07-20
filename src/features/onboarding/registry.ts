import { PERMISSION } from '@/shared/hooks/usePermissions';
import type { ChecklistTaskDef, ChecklistTaskKey, TourDefinition } from './types';

export const ORIENTATION_TOUR_ID = 'orientation-v1';

/** Anchor ids used by TourAnchor components across the app. */
export const ANCHOR = {
  createInvoice: 'anchor-create-invoice',
  tabInvoices: 'anchor-tab-invoices',
  tabCustomers: 'anchor-tab-customers',
  checklist: 'anchor-checklist',
  ordersHeader: 'anchor-orders-header',
  teamInvite: 'anchor-team-invite',
  invoiceTemplate: 'anchor-invoice-template',
  shareInvoice: 'anchor-share-invoice'
} as const;

const ALL_TASKS: Record<ChecklistTaskKey, ChecklistTaskDef> = {
  complete_profile: {
    key: 'complete_profile',
    title: 'Add your business details',
    subtitle: 'Your name, address, and phone make invoices look professional',
    icon: 'storefront-outline',
    requiredPermissions: [PERMISSION.settingsManage],
    navigate: { tab: 'SettingsTab', screen: 'BusinessProfile' }
  },
  set_tax: {
    key: 'set_tax',
    title: 'Set your tax defaults',
    subtitle: 'Set GST once and every invoice calculates itself',
    icon: 'percent-outline',
    requiredPermissions: [PERMISSION.settingsManage],
    navigate: { tab: 'SettingsTab', screen: 'TaxSettings' }
  },
  add_customer: {
    key: 'add_customer',
    title: 'Add your first customer',
    subtitle: 'Save their details once, reuse them forever',
    icon: 'account-plus-outline',
    requiredPermissions: [PERMISSION.customersManage],
    navigate: { tab: 'CustomersTab', screen: 'Customers' }
  },
  create_invoice: {
    key: 'create_invoice',
    title: 'Create your first invoice',
    subtitle: 'The fastest way to see BillJi in action',
    icon: 'file-document-edit-outline',
    requiredPermissions: [PERMISSION.invoicesCreate],
    navigate: { tab: 'InvoicesTab', screen: 'InvoiceCreate' }
  },
  share_invoice: {
    key: 'share_invoice',
    title: 'Share an invoice',
    subtitle: 'Send it over WhatsApp, email, or as a PDF',
    icon: 'share-variant-outline',
    requiredPermissions: [PERMISSION.invoicesView],
    navigate: { tab: 'InvoicesTab', screen: 'InvoiceList' }
  },
  review_tax: {
    key: 'review_tax',
    title: 'Review tax settings',
    subtitle: 'Make sure GST rates match your books',
    icon: 'percent-outline',
    requiredPermissions: [PERMISSION.settingsView],
    navigate: { tab: 'SettingsTab', screen: 'TaxSettings' }
  },
  record_payment: {
    key: 'record_payment',
    title: 'Record a payment',
    subtitle: 'Mark invoices paid as the money comes in',
    icon: 'cash-check',
    requiredPermissions: [PERMISSION.paymentsRecord],
    navigate: { tab: 'DashboardTab', screen: 'Payments' }
  },
  open_reports: {
    key: 'open_reports',
    title: 'Peek at Reports',
    subtitle: 'Sales, dues, and trends at a glance',
    icon: 'chart-line',
    requiredPermissions: [PERMISSION.reportsView],
    navigate: { tab: 'DashboardTab', screen: 'Reports' }
  },
  add_product: {
    key: 'add_product',
    title: 'Add a product',
    subtitle: 'Line items fill themselves in on your next invoice',
    icon: 'package-variant-closed',
    requiredPermissions: [PERMISSION.productsManage],
    optional: true,
    navigate: { tab: 'CatalogTab', screen: 'Products' }
  },
  view_invoices: {
    key: 'view_invoices',
    title: 'Browse invoices',
    subtitle: 'See everything your team has billed',
    icon: 'file-document-multiple-outline',
    requiredPermissions: [PERMISSION.invoicesView],
    navigate: { tab: 'InvoicesTab', screen: 'InvoiceList' }
  },
  viewer_tip: {
    key: 'viewer_tip',
    title: 'Need to create invoices?',
    subtitle: 'Ask an admin for invoice or customer permissions',
    icon: 'key-outline',
    optional: true
  }
};

const ROLE_PRESETS: Record<string, ChecklistTaskKey[]> = {
  owner: ['complete_profile', 'set_tax', 'add_customer', 'create_invoice', 'share_invoice'],
  admin: ['complete_profile', 'set_tax', 'add_customer', 'create_invoice', 'share_invoice'],
  accountant: ['review_tax', 'create_invoice', 'record_payment', 'open_reports'],
  staff: ['add_customer', 'create_invoice', 'add_product'],
  viewer: ['view_invoices', 'open_reports', 'viewer_tip']
};

export function checklistTasksForRole(
  roleKey: string | undefined,
  can: (permission: string) => boolean
): ChecklistTaskDef[] {
  const keys = ROLE_PRESETS[roleKey || 'owner'] ?? ROLE_PRESETS.owner;
  return keys
    .map((key) => ALL_TASKS[key])
    .filter((task) => {
      if (!task.requiredPermissions?.length) return true;
      return task.requiredPermissions.every((p) => can(p));
    })
    .slice(0, 5);
}

export const ORIENTATION_TOUR: TourDefinition = {
  id: ORIENTATION_TOUR_ID,
  version: 1,
  priority: 0,
  trigger: 'first_session',
  title: 'Welcome to BillJi',
  description: 'A quick look at where billing starts',
  steps: [
    {
      id: 'create-invoice',
      anchorId: ANCHOR.createInvoice,
      title: 'Everything starts here',
      description: 'Tap Create Invoice to bill your first customer — it takes about a minute.',
      placement: 'bottom'
    },
    {
      id: 'tab-invoices',
      anchorId: ANCHOR.tabInvoices,
      title: 'Your invoices, all in one place',
      description: 'Drafts, sent, and paid — track every bill from this tab.',
      placement: 'top'
    },
    {
      id: 'tab-customers',
      anchorId: ANCHOR.tabCustomers,
      title: 'Save customers once',
      description: 'Add a customer one time and reuse their details on every invoice.',
      placement: 'top'
    },
    {
      id: 'checklist',
      anchorId: ANCHOR.checklist,
      title: 'Your setup guide',
      description: 'This tracks your first steps. Tap it anytime to pick up where you left off.',
      placement: 'top'
    }
  ]
};

export const FEATURE_TOURS: TourDefinition[] = [
  {
    id: 'orders-intro-v1',
    version: 1,
    priority: 10,
    trigger: 'route_focus',
    route: 'OrderList',
    requiredPermissions: [PERMISSION.ordersCreate],
    requiredTasks: ['create_invoice'],
    title: 'Orders',
    description: 'Plan a sale as an order before invoicing.',
    steps: [
      {
        id: 'orders-tip',
        anchorId: ANCHOR.ordersHeader,
        title: 'Plan sales with orders',
        description: 'Sketch the sale as an order first — turn it into an invoice when it\u2019s ready.',
        placement: 'bottom'
      }
    ]
  },
  {
    id: 'team-intro-v1',
    version: 1,
    priority: 11,
    trigger: 'route_focus',
    route: 'Team',
    requiredPermissions: [PERMISSION.teamManage],
    requiredTasks: ['create_invoice'],
    title: 'Team',
    description: 'Invite office staff with roles.',
    steps: [
      {
        id: 'team-tip',
        anchorId: ANCHOR.teamInvite,
        title: 'Bring your team in',
        description: 'Invite teammates with roles so everyone sees exactly what they need.',
        placement: 'bottom'
      }
    ]
  },
  {
    id: 'template-intro-v1',
    version: 1,
    priority: 12,
    trigger: 'route_focus',
    route: 'InvoiceTemplate',
    requiredPermissions: [PERMISSION.settingsManage],
    requiredTasks: ['create_invoice'],
    title: 'Invoice template',
    description: 'Match PDF look to your brand.',
    steps: [
      {
        id: 'template-tip',
        anchorId: ANCHOR.invoiceTemplate,
        title: 'Make invoices yours',
        description: 'Add your logo, colors, and notes so PDFs look like your business.',
        placement: 'bottom'
      }
    ]
  },
  {
    id: 'products-speed-v1',
    version: 1,
    priority: 13,
    trigger: 'after_activation',
    requiredPermissions: [PERMISSION.productsManage],
    requiredTasks: ['create_invoice'],
    title: 'Products catalog',
    description: 'Save products to speed line items.',
    steps: [
      {
        id: 'products-tip',
        anchorId: ANCHOR.createInvoice,
        title: 'Speed up your line items',
        description: 'Save products to Inventory and your next invoice fills itself in.',
        placement: 'bottom'
      }
    ]
  }
];

export const TOUR_REGISTRY: TourDefinition[] = [ORIENTATION_TOUR, ...FEATURE_TOURS];

export function getTourById(id: string): TourDefinition | undefined {
  return TOUR_REGISTRY.find((t) => t.id === id);
}

export function featureGuidesForPermissions(can: (permission: string) => boolean): TourDefinition[] {
  return FEATURE_TOURS.filter((tour) => {
    if (!tour.requiredPermissions?.length) return true;
    return tour.requiredPermissions.every((p) => can(p));
  });
}
