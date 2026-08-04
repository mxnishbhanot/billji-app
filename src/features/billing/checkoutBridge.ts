import type { Checkout } from '@/types';

// The two pure halves of the gateway checkout: the page we hand the WebView, and how we read what it
// says back. Kept out of the component because both are money logic — the first decides whether a
// one-off payment or a recurring mandate is opened, the second decides what counts as paid — and
// neither should need a native WebView bridge loaded to be tested.

// Exactly one correlating id comes back, and which one tells the server what it is confirming: an
// order (one-time payment) or a subscription (autopay mandate). They are signed with different HMACs,
// so the client must not merge them into one field.
export type CheckoutResult = { orderId?: string; subscriptionId?: string; paymentId: string; signature: string };

/**
 * Razorpay Checkout, as a self-contained page.
 *
 * The page talks back over `postMessage` and nothing else — the app never reads the DOM, and every
 * signature it forwards is verified server-side against our own record before anything is granted.
 */
export const checkoutHtml = ({
  checkout,
  customerName,
  customerEmail
}: {
  checkout: Checkout;
  customerName?: string;
  customerEmail?: string;
}) => {
  // Autopay passes `subscription_id` and NOTHING else about the money: Razorpay derives the amount and
  // currency from the plan the mandate names, and sending our own alongside it invites a mismatch we
  // cannot win. A one-time payment passes the order and its fixed amount, as before.
  const target = checkout.subscriptionId
    ? `subscription_id: ${JSON.stringify(checkout.subscriptionId)},`
    : `order_id: ${JSON.stringify(checkout.orderId || '')},
          amount: ${Number(checkout.amount)},
          currency: ${JSON.stringify(checkout.currency)},`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>html,body{margin:0;height:100%;background:transparent;font-family:-apple-system,Roboto,sans-serif}</style>
  </head>
  <body>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      var post = function (payload) { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); };
      try {
        var rzp = new Razorpay({
          key: ${JSON.stringify(checkout.providerConfig?.keyId || '')},
          ${target}
          name: 'BillJi',
          description: ${JSON.stringify(checkout.plan.name)},
          prefill: { name: ${JSON.stringify(customerName || '')}, email: ${JSON.stringify(customerEmail || '')} },
          theme: { color: '#4F46E5' },
          // The handler carries the values the server needs to prove Razorpay produced this pair.
          // Amount, plan and period always come from our own record, never from here.
          //
          // Both ids are posted unconditionally: JSON.stringify drops whichever is undefined, so one
          // handler serves a one-time payment and a mandate without branching.
          handler: function (response) {
            post({
              type: 'paid',
              orderId: response.razorpay_order_id,
              subscriptionId: response.razorpay_subscription_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            });
          },
          modal: { ondismiss: function () { post({ type: 'dismissed' }); } }
        });
        rzp.on('payment.failed', function (event) {
          post({ type: 'failed', message: (event && event.error && event.error.description) || 'Payment failed' });
        });
        rzp.open();
      } catch (error) {
        post({ type: 'failed', message: String((error && error.message) || error) });
      }
    </script>
  </body>
</html>`;
};

export type CheckoutMessage =
  | { kind: 'paid'; result: CheckoutResult }
  | { kind: 'failed'; message?: string }
  | { kind: 'dismissed' }
  | { kind: 'ignore' };

/**
 * Reads one postMessage from the checkout page.
 *
 * A `paid` payload must carry a payment id, a signature, and exactly one correlating id. Anything
 * short of that is not a payment — the server would reject it anyway, and treating it as success would
 * show the customer an active plan they do not have.
 */
export const parseCheckoutMessage = (raw: string): CheckoutMessage => {
  let payload: { type?: string; orderId?: string; subscriptionId?: string; paymentId?: string; signature?: string; message?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return { kind: 'ignore' };
  }

  if (payload.type === 'paid') {
    const hasId = Boolean(payload.orderId || payload.subscriptionId);
    if (payload.paymentId && payload.signature && hasId) {
      return {
        kind: 'paid',
        result: {
          ...(payload.orderId ? { orderId: payload.orderId } : {}),
          ...(payload.subscriptionId ? { subscriptionId: payload.subscriptionId } : {}),
          paymentId: payload.paymentId,
          signature: payload.signature
        }
      };
    }
    // Claimed paid but unverifiable. Report it as a failure rather than silently dismissing, so the
    // customer is told something went wrong instead of being left on the plans screen.
    return { kind: 'failed', message: 'We could not read that payment. Nothing extra has been charged.' };
  }

  if (payload.type === 'failed') return { kind: 'failed', message: payload.message };
  return { kind: 'dismissed' };
};
