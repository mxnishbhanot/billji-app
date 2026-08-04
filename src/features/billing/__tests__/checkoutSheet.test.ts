import { checkoutHtml, parseCheckoutMessage } from '@/features/billing/checkoutBridge';
import type { Checkout } from '@/types';

/**
 * The two pure pieces of the checkout sheet, tested without mounting a WebView.
 *
 * Both are money paths dressed up as string handling:
 *   - the HTML branch decides whether the gateway opens a ONE-OFF ORDER or a RECURRING MANDATE. The
 *     wrong branch either errors out or, worse, charges a mandate as a single payment.
 *   - the message guard decides what counts as "paid". Loosening it to accept any `paid` payload would
 *     show the customer an active plan the server never granted.
 *
 * Deliberately untested here: the WebView render, Razorpay's own script, the UPI app switch. None can
 * be exercised in jest, and all three need a physical device.
 */

const base: Checkout = {
  paymentId: 'pay_row_1',
  amount: 199900,
  currency: 'INR',
  provider: 'razorpay',
  providerConfig: { keyId: 'rzp_test_key' },
  plan: { planId: 'plan_1', planKey: 'pro', name: 'BillJi Pro' },
  interval: 'year',
  breakdown: { gross: 199900, discount: 0, proratedCredit: 0, netAmount: 199900 }
};

describe('checkoutHtml', () => {
  // Assertions target the OPTIONS keys (`<key>: <value>`), not bare substrings: the handler names both
  // `razorpay_order_id` and `razorpay_subscription_id` on purpose, so a substring check would fail on
  // correct code.
  it('opens a one-time order with its fixed amount', () => {
    const html = checkoutHtml({ checkout: { ...base, orderId: 'order_1' } });

    expect(html).toContain('order_id: "order_1"');
    expect(html).toContain('amount: 199900');
    expect(html).toContain('currency: "INR"');
    expect(html).not.toMatch(/\bsubscription_id: /);
  });

  it('opens a mandate by subscription id and sends no amount of its own', () => {
    const html = checkoutHtml({ checkout: { ...base, subscriptionId: 'sub_1', autopay: true } });

    expect(html).toContain('subscription_id: "sub_1"');
    // Razorpay derives both from the plan the mandate names; sending ours invites a mismatch we lose.
    expect(html).not.toMatch(/\border_id: /);
    expect(html).not.toContain('amount: 199900');
    expect(html).not.toMatch(/\bcurrency: /);
  });

  it('always carries the publishable key and never a secret-looking field', () => {
    const html = checkoutHtml({ checkout: { ...base, orderId: 'order_1' } });

    expect(html).toContain('key: "rzp_test_key"');
    expect(html).not.toMatch(/secret/i);
  });

  it('escapes the customer values it interpolates', () => {
    const html = checkoutHtml({
      checkout: { ...base, orderId: 'order_1' },
      customerName: 'Ra"j</script>',
      customerEmail: 'raj@example.com'
    });

    expect(html).not.toContain('Ra"j</script>');
    expect(html).toContain('raj@example.com');
  });
});

describe('parseCheckoutMessage', () => {
  const paid = (payload: Record<string, unknown>) => parseCheckoutMessage(JSON.stringify({ type: 'paid', ...payload }));

  it('accepts a one-time payment triple', () => {
    expect(paid({ orderId: 'order_1', paymentId: 'pay_1', signature: 'sig' })).toEqual({
      kind: 'paid',
      result: { orderId: 'order_1', paymentId: 'pay_1', signature: 'sig' }
    });
  });

  it('accepts a mandate triple and keeps the subscription id', () => {
    expect(paid({ subscriptionId: 'sub_1', paymentId: 'pay_1', signature: 'sig' })).toEqual({
      kind: 'paid',
      result: { subscriptionId: 'sub_1', paymentId: 'pay_1', signature: 'sig' }
    });
  });

  it('refuses a payment with no signature', () => {
    expect(paid({ orderId: 'order_1', paymentId: 'pay_1' }).kind).toBe('failed');
  });

  it('refuses a payment with no payment id', () => {
    expect(paid({ orderId: 'order_1', signature: 'sig' }).kind).toBe('failed');
  });

  it('refuses a payment that correlates to nothing', () => {
    expect(paid({ paymentId: 'pay_1', signature: 'sig' }).kind).toBe('failed');
  });

  it('passes a gateway failure message through', () => {
    expect(parseCheckoutMessage(JSON.stringify({ type: 'failed', message: 'card declined' }))).toEqual({
      kind: 'failed',
      message: 'card declined'
    });
  });

  it('treats a dismissal as a dismissal, not a failure', () => {
    expect(parseCheckoutMessage(JSON.stringify({ type: 'dismissed' })).kind).toBe('dismissed');
  });

  it('ignores anything that is not JSON, rather than throwing inside the WebView handler', () => {
    expect(parseCheckoutMessage('not json at all').kind).toBe('ignore');
  });
});
