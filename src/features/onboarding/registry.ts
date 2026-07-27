import { PERMISSION } from '@/shared/hooks/usePermissions';
import type { TourDefinition } from './types';

export const ORIENTATION_TOUR_ID = 'orientation-v1';

/** Anchor ids used by TourAnchor components across the app. */
export const ANCHOR = {
  createInvoice: 'anchor-create-invoice',
  tabInvoices: 'anchor-tab-invoices',
  tabCustomers: 'anchor-tab-customers',
  tabCatalog: 'anchor-tab-catalog',
  tabSettings: 'anchor-tab-settings',
  reportsButton: 'anchor-reports-button',
  ordersHeader: 'anchor-orders-header',
  teamInvite: 'anchor-team-invite',
  invoiceTemplate: 'anchor-invoice-template',
  shareInvoice: 'anchor-share-invoice',
  productsHeader: 'anchor-products-header'
} as const;

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
      placement: 'bottom',
      navigate: { tab: 'DashboardTab', screen: 'DashboardHome' }
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
      id: 'tab-inventory',
      anchorId: ANCHOR.tabCatalog,
      title: 'Stock your inventory',
      description: 'Save products once and they fill in your line items on every invoice.',
      placement: 'top'
    },
    {
      id: 'tab-settings',
      anchorId: ANCHOR.tabSettings,
      title: 'Make BillJi yours',
      description: 'Business details, tax defaults, and your invoice template all live here.',
      placement: 'top'
    },
    {
      id: 'reports',
      anchorId: ANCHOR.reportsButton,
      title: 'See how you’re doing',
      description: 'Tap Reports for sales, dues, and payment trends over any period.',
      placement: 'top',
      navigate: { tab: 'DashboardTab', screen: 'DashboardHome' }
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
    requiresInvoice: true,
    title: 'Orders',
    description: 'Plan a sale as an order before invoicing.',
    steps: [
      {
        id: 'orders-tip',
        anchorId: ANCHOR.ordersHeader,
        title: 'Plan sales with orders',
        description: 'Sketch the sale as an order first — turn it into an invoice when it\u2019s ready.',
        placement: 'bottom',
        navigate: { tab: 'InvoicesTab', screen: 'OrderList' }
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
    requiresInvoice: true,
    title: 'Team',
    description: 'Invite office staff with roles.',
    steps: [
      {
        id: 'team-tip',
        anchorId: ANCHOR.teamInvite,
        title: 'Bring your team in',
        description: 'Invite teammates with roles so everyone sees exactly what they need.',
        placement: 'bottom',
        navigate: { tab: 'SettingsTab', screen: 'Team' }
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
    requiresInvoice: true,
    title: 'Invoice template',
    description: 'Match PDF look to your brand.',
    steps: [
      {
        id: 'template-tip',
        anchorId: ANCHOR.invoiceTemplate,
        title: 'Make invoices yours',
        description: 'Add your logo, colors, and notes so PDFs look like your business.',
        placement: 'bottom',
        navigate: { tab: 'SettingsTab', screen: 'InvoiceTemplate' }
      }
    ]
  },
  {
    id: 'products-speed-v1',
    version: 1,
    priority: 13,
    trigger: 'after_activation',
    route: 'Products',
    requiredPermissions: [PERMISSION.productsManage],
    requiresInvoice: true,
    title: 'Products catalog',
    description: 'Save products to speed line items.',
    steps: [
      {
        id: 'products-tip',
        anchorId: ANCHOR.productsHeader,
        title: 'Speed up your line items',
        description: 'Save products to Inventory and your next invoice fills itself in.',
        placement: 'bottom',
        navigate: { tab: 'CatalogTab', screen: 'Products' }
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
