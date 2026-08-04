import { renderHook } from '@testing-library/react-native';
import { FEATURE, LIMIT } from '@/constants/entitlements';
import { useEntitlements } from '@/shared/hooks/useEntitlements';
import { useAuthStore } from '@/store/authStore';
import type { Subscription, UsageRow } from '@/types';

const usageRow = (overrides: Partial<UsageRow> & { key: string }): UsageRow => ({
  label: overrides.key,
  unit: 'count',
  used: 0,
  limit: null,
  remaining: null,
  percentUsed: 0,
  unlimited: true,
  overage: 0,
  resetsAt: null,
  ...overrides
});

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  contractVersion: 1,
  planId: 'plan-1',
  planName: 'BillJi Pro',
  planKey: 'pro',
  snapshotVersion: 1,
  subscriptionStatus: 'active',
  billingInterval: 'month',
  renewalDate: null,
  expiryDate: null,
  gracePeriodEndsAt: null,
  isTrial: false,
  trialEndsAt: null,
  inGracePeriod: false,
  cancelAtPeriodEnd: false,
  features: {},
  limits: {},
  usageSummary: [],
  remainingLimits: {},
  ...overrides
});

const setUser = (user: unknown) => useAuthStore.setState({ user: user as never });

describe('useEntitlements', () => {
  afterEach(() => setUser(null));

  // The one rule that separates this from usePermissions: no plan data must never mean "allow".
  it('fails CLOSED with no subscription on the session', () => {
    setUser({ roleKey: 'owner' });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.can(FEATURE.expenses)).toBe(false);
    expect(result.current.can(FEATURE.teams)).toBe(false);
    expect(result.current.isLocked(FEATURE.dataExport)).toBe(true);
  });

  it('still allows the free tier with no subscription, so a fresh signup can bill', () => {
    setUser({ roleKey: 'owner' });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.can(FEATURE.gstInvoices)).toBe(true);
    expect(result.current.can(FEATURE.pdfExport)).toBe(true);
  });

  it('does not fail open for an owner, unlike permissions', () => {
    setUser({ roleKey: 'owner', subscription: subscription({ features: { expenses: false } }) });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.can(FEATURE.expenses)).toBe(false);
  });

  it('reads features from the snapshot on the session', () => {
    setUser({ subscription: subscription({ features: { expenses: true, teams: false } }) });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.can(FEATURE.expenses)).toBe(true);
    expect(result.current.can(FEATURE.teams)).toBe(false);
  });

  it('treats a null limit as unlimited, never as zero', () => {
    setUser({
      subscription: subscription({
        limits: { [LIMIT.documentsPerMonth]: null },
        remainingLimits: { [LIMIT.documentsPerMonth]: null }
      })
    });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.limit(LIMIT.documentsPerMonth)).toBeNull();
    expect(result.current.remaining(LIMIT.documentsPerMonth)).toBe(Infinity);
    expect(result.current.isAtLimit(LIMIT.documentsPerMonth)).toBe(false);
  });

  it('reports a spent quota', () => {
    setUser({
      subscription: subscription({
        limits: { [LIMIT.documentsPerMonth]: 200 },
        remainingLimits: { [LIMIT.documentsPerMonth]: 0 },
        usageSummary: [usageRow({ key: LIMIT.documentsPerMonth, used: 200, limit: 200, remaining: 0, percentUsed: 100, unlimited: false })]
      })
    });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isAtLimit(LIMIT.documentsPerMonth)).toBe(true);
    expect(result.current.isNearLimit(LIMIT.documentsPerMonth)).toBe(true);
    expect(result.current.documents?.used).toBe(200);
  });

  it('only calls a quota near its limit past the threshold', () => {
    setUser({
      subscription: subscription({
        usageSummary: [usageRow({ key: LIMIT.documentsPerMonth, used: 100, limit: 200, remaining: 100, percentUsed: 50, unlimited: false })]
      })
    });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isNearLimit(LIMIT.documentsPerMonth)).toBe(false);
  });

  it('never calls an unlimited quota near its limit', () => {
    setUser({
      subscription: subscription({
        usageSummary: [usageRow({ key: LIMIT.documentsPerMonth, used: 9999, percentUsed: 0, unlimited: true })]
      })
    });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isNearLimit(LIMIT.documentsPerMonth)).toBe(false);
  });

  it('reports a lapsed plan so the UI can prompt without locking data', () => {
    setUser({ subscription: subscription({ subscriptionStatus: 'expired' }) });
    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isLapsed).toBe(true);
    expect(result.current.status).toBe('expired');
  });
});
