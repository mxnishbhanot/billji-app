import type { ChecklistTaskKey, OnboardingHints, OnboardingItemProgress, OnboardingProgress } from './types';

/** Derive which checklist items should be marked complete from server hints + local signals. */
export function detectCompletedTasks(
  hints: OnboardingHints | null | undefined,
  extras?: { sharedInvoice?: boolean; openedReports?: boolean; viewedInvoices?: boolean }
): Partial<Record<ChecklistTaskKey, OnboardingItemProgress>> {
  if (!hints) return {};
  const out: Partial<Record<ChecklistTaskKey, OnboardingItemProgress>> = {};
  const mark = (key: ChecklistTaskKey) => {
    out[key] = { status: 'completed', method: 'detected', completedAt: new Date().toISOString() };
  };

  if (hints.profileComplete) mark('complete_profile');
  if (hints.taxConfigured) {
    mark('set_tax');
    mark('review_tax');
  }
  if (hints.customerCount > 0) mark('add_customer');
  if (hints.productCount > 0) mark('add_product');
  if (hints.invoiceCount > 0) mark('create_invoice');
  if (hints.paymentCount > 0) mark('record_payment');
  if (extras?.sharedInvoice) mark('share_invoice');
  if (extras?.openedReports) mark('open_reports');
  if (extras?.viewedInvoices) mark('view_invoices');

  return out;
}

export function mergeDetectedIntoProgress(
  progress: OnboardingProgress,
  detected: Partial<Record<ChecklistTaskKey, OnboardingItemProgress>>
): { progress: OnboardingProgress; changedKeys: ChecklistTaskKey[] } {
  const items = { ...progress.checklist.items };
  const changedKeys: ChecklistTaskKey[] = [];

  for (const [key, value] of Object.entries(detected) as [ChecklistTaskKey, OnboardingItemProgress][]) {
    const existing = items[key];
    if (existing?.status === 'completed' || existing?.status === 'skipped') continue;
    items[key] = value;
    changedKeys.push(key);
  }

  if (!changedKeys.length) return { progress, changedKeys };

  return {
    progress: {
      ...progress,
      checklist: { ...progress.checklist, items }
    },
    changedKeys
  };
}

export function isTaskDone(progress: OnboardingProgress | null, key: string): boolean {
  const status = progress?.checklist.items[key]?.status;
  return status === 'completed' || status === 'skipped';
}

export function requiredTasksComplete(
  progress: OnboardingProgress | null,
  tasks: ChecklistTaskKey[] | undefined
): boolean {
  if (!tasks?.length) return true;
  return tasks.every((key) => isTaskDone(progress, key));
}
