import { checklistTasksForRole, ORIENTATION_TOUR, featureGuidesForPermissions } from '../registry';
import { PERMISSION } from '@/shared/hooks/usePermissions';

describe('onboarding registry', () => {
  const allowAll = () => true;
  const allowNone = () => false;
  const allowSome = (p: string) =>
    [PERMISSION.invoicesView, PERMISSION.reportsView].includes(p as typeof PERMISSION.invoicesView);

  it('returns owner checklist capped at 5', () => {
    const tasks = checklistTasksForRole('owner', allowAll);
    expect(tasks.length).toBeLessThanOrEqual(5);
    expect(tasks.map((t) => t.key)).toContain('create_invoice');
  });

  it('filters viewer checklist by permissions', () => {
    const tasks = checklistTasksForRole('viewer', allowSome);
    expect(tasks.every((t) => !t.requiredPermissions || t.requiredPermissions.every(allowSome))).toBe(true);
  });

  it('hides create tasks when permissions deny', () => {
    const tasks = checklistTasksForRole('staff', allowNone);
    expect(tasks).toHaveLength(0);
  });

  it('orientation has at most 4 steps', () => {
    expect(ORIENTATION_TOUR.steps.length).toBeLessThanOrEqual(4);
  });

  it('every checklist task has an icon', () => {
    for (const role of ['owner', 'admin', 'accountant', 'staff', 'viewer']) {
      const tasks = checklistTasksForRole(role, allowAll);
      expect(tasks.every((t) => typeof t.icon === 'string' && t.icon.length > 0)).toBe(true);
    }
  });

  it('feature guides respect permissions', () => {
    const guides = featureGuidesForPermissions(allowNone);
    expect(guides).toHaveLength(0);
    const all = featureGuidesForPermissions(allowAll);
    expect(all.length).toBeGreaterThan(0);
  });
});
