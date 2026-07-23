import { detectCompletedTasks, mergeDetectedIntoProgress, isTaskDone, requiredTasksComplete } from '../completionDetect';
import type { OnboardingHints, OnboardingProgress } from '../types';

describe('completionDetect', () => {
  const hints: OnboardingHints = {
    profileComplete: true,
    taxConfigured: true,
    customerCount: 2,
    productCount: 0,
    invoiceCount: 1,
    paymentCount: 0,
    hasInvoices: true,
    skipOrientation: true
  };

  it('detects tasks from hints', () => {
    const detected = detectCompletedTasks(hints, { sharedInvoice: true });
    expect(detected.complete_profile?.status).toBe('completed');
    expect(detected.set_tax?.status).toBe('completed');
    expect(detected.add_customer?.status).toBe('completed');
    expect(detected.create_invoice?.status).toBe('completed');
    expect(detected.share_invoice?.status).toBe('completed');
    expect(detected.add_product).toBeUndefined();
  });

  it('merges only pending items', () => {
    const progress: OnboardingProgress = {
      id: '1',
      roleKeyAtStart: 'owner',
      orientation: { tourId: 'orientation-v1', version: 1, status: 'completed', currentStep: '' },
      checklist: {
        status: 'active',
        items: {
          add_customer: { status: 'completed', method: 'action' }
        }
      },
      tips: {}
    };
    const detected = detectCompletedTasks(hints);
    const { changedKeys, progress: merged } = mergeDetectedIntoProgress(progress, detected);
    expect(changedKeys).not.toContain('add_customer');
    expect(changedKeys).toContain('create_invoice');
    expect(merged.checklist.items.create_invoice?.method).toBe('detected');
  });

  it('checks required tasks', () => {
    const progress: OnboardingProgress = {
      id: '1',
      roleKeyAtStart: 'owner',
      orientation: { tourId: 'orientation-v1', version: 1, status: 'pending', currentStep: '' },
      checklist: {
        status: 'active',
        items: { create_invoice: { status: 'completed', method: 'action' } }
      },
      tips: {}
    };
    expect(isTaskDone(progress, 'create_invoice')).toBe(true);
    expect(requiredTasksComplete(progress, ['create_invoice'])).toBe(true);
    expect(requiredTasksComplete(progress, ['share_invoice'])).toBe(false);
  });
});
