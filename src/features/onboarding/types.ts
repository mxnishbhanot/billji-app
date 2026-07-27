export type OrientationStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
export type TipStatus = 'pending' | 'seen' | 'completed' | 'dismissed' | 'snoozed';

export type OrientationProgress = {
  tourId: string;
  version: number;
  status: OrientationStatus;
  currentStep: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
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

export type TourStepDef = {
  id: string;
  anchorId: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Screen the anchor lives on; the tour navigates here before measuring. Omit for always-mounted anchors (e.g. tab-bar icons). */
  navigate?: {
    tab?: 'DashboardTab' | 'InvoicesTab' | 'CatalogTab' | 'CustomersTab' | 'SettingsTab';
    screen: string;
    params?: Record<string, unknown>;
  };
};

export type TourDefinition = {
  id: string;
  version: number;
  priority: number;
  trigger: 'first_session' | 'route_focus' | 'manual' | 'after_activation';
  route?: string;
  requiredPermissions?: string[];
  /** Hold the tip back until the business has billed something (server hint). */
  requiresInvoice?: boolean;
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
