import { ANCHOR, ORIENTATION_TOUR, TOUR_REGISTRY, featureGuidesForPermissions } from '../registry';

describe('onboarding registry', () => {
  const allowAll = () => true;
  const allowNone = () => false;

  it('orientation has at most 7 steps', () => {
    expect(ORIENTATION_TOUR.steps.length).toBeLessThanOrEqual(7);
  });

  it('every tour step targets a known anchor', () => {
    const anchorIds = new Set(Object.values(ANCHOR));
    for (const tour of TOUR_REGISTRY) {
      for (const step of tour.steps) {
        expect(anchorIds.has(step.anchorId as (typeof ANCHOR)[keyof typeof ANCHOR])).toBe(true);
      }
    }
  });

  it('every step has a navigate target unless its anchor is always mounted', () => {
    // Tab-bar icons are the only anchors present on every screen.
    const alwaysMounted = new Set<string>([ANCHOR.tabInvoices, ANCHOR.tabCustomers, ANCHOR.tabCatalog, ANCHOR.tabSettings]);
    for (const tour of TOUR_REGISTRY) {
      for (const step of tour.steps) {
        if (alwaysMounted.has(step.anchorId)) continue;
        expect(step.navigate?.screen).toBeTruthy();
      }
    }
  });

  it('feature guides respect permissions', () => {
    const guides = featureGuidesForPermissions(allowNone);
    expect(guides).toHaveLength(0);
    const all = featureGuidesForPermissions(allowAll);
    expect(all.length).toBeGreaterThan(0);
  });
});
