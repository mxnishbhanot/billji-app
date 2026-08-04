import { billingApi } from '@/api/endpoints';
import { api } from '@/api/client';

/**
 * REGRESSION (audit P1-1).
 *
 * The checkout route mounts the idempotency middleware, and that middleware short-circuits when the
 * request carries no `Idempotency-Key`. This client sent none, so a double tap on Upgrade minted two
 * Razorpay orders — both payable, and the second activation overwrites the first plan. The customer
 * paid twice and got one plan.
 *
 * The key must also be STABLE for the same purchase attempt: the random `idempotencyKey()` helper the
 * other endpoints use would give two taps two keys and change nothing.
 */

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(async () => undefined)
}));

jest.mock('@/api/client', () => ({
  api: { get: jest.fn(), post: jest.fn(async () => ({ data: { checkout: {} } })), patch: jest.fn(), delete: jest.fn() },
  isPaywallError: jest.fn(() => false),
  apiErrorMessage: jest.fn(() => '')
}));

const post = api.post as jest.Mock;
const headerFor = (call: unknown[]) => (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key'];

describe('checkout idempotency key', () => {
  beforeEach(() => post.mockClear());

  it('sends an Idempotency-Key with every checkout', async () => {
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year' });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, , config] = post.mock.calls[0];
    expect(url).toBe('/billing/checkout');
    expect((config as { headers: Record<string, string> }).headers['Idempotency-Key']).toBeTruthy();
  });

  it('reuses the same key for a double tap, so the server replays the first order', async () => {
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year' });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year' });

    expect(headerFor(post.mock.calls[0])).toBe(headerFor(post.mock.calls[1]));
  });

  it('gives different terms different keys, so a real second purchase is not swallowed', async () => {
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year' });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'month' });
    await billingApi.checkout({ planId: 'plan_business', interval: 'year' });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year', couponCode: 'LAUNCH50' });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year', autopay: true });

    const keys = post.mock.calls.map(headerFor);
    expect(new Set(keys).size).toBe(5);
  });

  /**
   * The payment MODE is part of the terms: autopay mints a mandate, manual mints a one-off order. If it
   * were missing from the key, a customer who tried autopay, backed out and chose manual inside the
   * same 5-minute bucket would have the mandate checkout replayed at them.
   */
  it('gives autopay and manual different keys for the same plan and interval', async () => {
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year', autopay: true });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'year' });

    expect(headerFor(post.mock.calls[0])).not.toBe(headerFor(post.mock.calls[1]));
  });

  it('keeps one key across a double tap on autopay, so only one mandate is created', async () => {
    await billingApi.checkout({ planId: 'plan_pro', interval: 'month', autopay: true });
    await billingApi.checkout({ planId: 'plan_pro', interval: 'month', autopay: true });

    expect(headerFor(post.mock.calls[0])).toBe(headerFor(post.mock.calls[1]));
  });
});
