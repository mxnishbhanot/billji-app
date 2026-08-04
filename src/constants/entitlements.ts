// Feature and limit KEYS, mirroring the backend catalog (`backend/src/constants/entitlements.js`).
// Same relationship `usePermissions.PERMISSION` has to `permissions.js`: the server owns the
// values, this file only names the keys so a screen never types a string literal.
//
// KEYS ARE PERMANENT. Every key is copied into every subscription snapshot on the server, so a
// rename there is a migration — and a mismatch here silently locks a paying customer out of a
// feature they bought. Add, never rename.

export const FEATURE = {
  offlineMode: 'offline_mode',
  cloudSync: 'cloud_sync',
  automaticBackup: 'automatic_backup',
  gstBilling: 'gst_billing',
  gstInvoices: 'gst_invoices',
  pdfExport: 'pdf_export',
  whatsappSharing: 'whatsapp_sharing',
  barcode: 'barcode',
  basicInventory: 'basic_inventory',
  advancedInventory: 'advanced_inventory',
  basicDashboard: 'basic_dashboard',
  basicReports: 'basic_reports',
  advancedReports: 'advanced_reports',
  profitAndLoss: 'profit_and_loss',
  advancedGstReports: 'advanced_gst_reports',
  advancedAnalytics: 'advanced_analytics',
  expenses: 'expenses',
  purchases: 'purchases',
  paymentReminders: 'payment_reminders',
  dataImport: 'data_import',
  dataExport: 'data_export',
  excelImport: 'excel_import',
  excelExport: 'excel_export',
  businessLogo: 'business_logo',
  customInvoiceTemplates: 'custom_invoice_templates',
  removeBranding: 'remove_branding',
  teams: 'teams',
  rbac: 'rbac',
  customRoles: 'custom_roles',
  auditLogs: 'audit_logs',
  multiBusiness: 'multi_business',
  priorityEmailSupport: 'priority_email_support',
  prioritySupport: 'priority_support',
  dedicatedSupport: 'dedicated_support',
  training: 'training',
  apiAccess: 'api_access',
  customIntegrations: 'custom_integrations'
} as const;

export type FeatureKey = (typeof FEATURE)[keyof typeof FEATURE];

export const LIMIT = {
  documentsPerMonth: 'documents_per_month',
  businesses: 'businesses',
  teamMembers: 'team_members',
  products: 'products',
  customers: 'customers',
  vendors: 'vendors',
  storageBytes: 'storage_bytes',
  exportsPerMonth: 'exports_per_month',
  importsPerMonth: 'imports_per_month',
  apiCallsPerMonth: 'api_calls_per_month',
  aiCreditsPerMonth: 'ai_credits_per_month'
} as const;

export type LimitKey = (typeof LIMIT)[keyof typeof LIMIT];

/** Human labels for the paywall copy. The server sends labels for usage rows; these cover features. */
export const FEATURE_LABELS: Record<string, string> = {
  [FEATURE.expenses]: 'Expenses',
  [FEATURE.purchases]: 'Purchases',
  [FEATURE.advancedReports]: 'Advanced reports',
  [FEATURE.advancedGstReports]: 'GST returns',
  [FEATURE.profitAndLoss]: 'Profit & loss',
  [FEATURE.advancedAnalytics]: 'Advanced analytics',
  [FEATURE.dataImport]: 'Import',
  [FEATURE.dataExport]: 'Export',
  [FEATURE.customInvoiceTemplates]: 'Custom invoice templates',
  [FEATURE.removeBranding]: 'Remove BillJi branding',
  [FEATURE.businessLogo]: 'Business logo',
  [FEATURE.teams]: 'Team members',
  [FEATURE.customRoles]: 'Custom roles',
  [FEATURE.rbac]: 'Roles & permissions',
  [FEATURE.auditLogs]: 'Activity log',
  [FEATURE.multiBusiness]: 'Multiple businesses',
  [FEATURE.advancedInventory]: 'Advanced inventory',
  [FEATURE.paymentReminders]: 'Payment reminders',
  [FEATURE.apiAccess]: 'API access'
};

export const featureLabel = (feature: string) => FEATURE_LABELS[feature] || 'This feature';

/** Money is integer paise everywhere in the billing contract — never a float, never pre-formatted. */
export const formatPaise = (paise: number) => {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: rupees % 1 === 0 ? 0 : 2 })}`;
};
