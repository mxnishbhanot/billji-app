export type OnboardingItemStatus = 'pending' | 'completed' | 'skipped';
export type OnboardingItemMethod = 'action' | 'detected' | 'skipped' | null;
export type OrientationStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
export type ChecklistStatus = 'active' | 'completed' | 'dismissed';
export type TipStatus = 'pending' | 'seen' | 'completed' | 'dismissed' | 'snoozed';

export type OnboardingItemProgress = {
  status: OnboardingItemStatus;
  completedAt?: string | null;
  method?: OnboardingItemMethod;
};

export type OrientationProgress = {
  tourId: string;
  version: number;
  status: OrientationStatus;
  currentStep: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
};

export type ChecklistProgress = {
  status: ChecklistStatus;
  dismissedAt?: string | null;
  completedAt?: string | null;
  items: Record<string, OnboardingItemProgress>;
};

export type TipProgress = {
  status: TipStatus;
  seenAt?: string | null;
  dismissedAt?: string | null;
  snoozedUntil?: string | null;
};

export type OnboardingProgress = {
  id: string;
  roleKeyAtStart: string;
  orientation: OrientationProgress;
  checklist: ChecklistProgress;
  tips: Record<string, TipProgress>;
  updatedAt?: string;
};

export type OnboardingHints = {
  profileComplete: boolean;
  taxConfigured: boolean;
  customerCount: number;
  productCount: number;
  invoiceCount: number;
  paymentCount: number;
  hasInvoices: boolean;
  skipOrientation: boolean;
};

export type OnboardingProgressResponse = {
  success: boolean;
  progress: OnboardingProgress;
  hints: OnboardingHints;
};

export type ChecklistTaskKey =
  | 'complete_profile'
  | 'set_tax'
  | 'add_customer'
  | 'create_invoice'
  | 'share_invoice'
  | 'review_tax'
  | 'record_payment'
  | 'open_reports'
  | 'add_product'
  | 'view_invoices'
  | 'viewer_tip';

export type TaskIconName = import('react').ComponentProps<typeof import('@expo/vector-icons').MaterialCommunityIcons>['name'];

export type ChecklistTaskDef = {
  key: ChecklistTaskKey;
  title: string;
  subtitle: string;
  /** MaterialCommunityIcons glyph shown next to the task */
  icon: TaskIconName;
  /** Permission keys; empty = always available for that role preset */
  requiredPermissions?: string[];
  optional?: boolean;
  /** Navigation target when tapped */
  navigate?: {
    tab?: 'DashboardTab' | 'InvoicesTab' | 'CatalogTab' | 'CustomersTab' | 'SettingsTab';
    screen: string;
    params?: Record<string, unknown>;
  };
};

export type TourStepDef = {
  id: string;
  anchorId: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
};

export type TourDefinition = {
  id: string;
  version: number;
  priority: number;
  trigger: 'first_session' | 'route_focus' | 'manual' | 'after_activation';
  route?: string;
  requiredPermissions?: string[];
  /** Checklist task keys that must be completed before this tip shows */
  requiredTasks?: ChecklistTaskKey[];
  title: string;
  description: string;
  steps: TourStepDef[];
};

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
