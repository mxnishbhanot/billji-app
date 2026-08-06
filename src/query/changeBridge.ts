import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { subscribeToChanges, type ChangeEvent } from '@/db';
import { queryKeys } from '@/shared/query/queryKeys';

/**
 * SQLite change events to React Query invalidations.
 *
 * The rule this module exists to enforce: **invalidate what changed, nothing else.** A sync
 * pull that lands 200 products must not refetch the invoice list, the dashboard and the
 * customer ledger. On a phone that is the difference between a list that stays put and one
 * that flickers and re-scrolls while a shopkeeper is reading it.
 *
 * Three things keep it narrow:
 *
 *  1. **Prefix keys, not `invalidateQueries()` with no argument.** `['products']` matches every
 *     product list and picker and nothing else. There is no global invalidation anywhere here.
 *  2. **Ids where ids exist.** A payment against invoice A invalidates A's detail and A's
 *     payment list; invoice B is untouched.
 *  3. **Changed fields where they are known.** Renaming a product does not invalidate the
 *     category filter list; changing its category does.
 *
 * Events are coalesced across a short window, so one pull page produces one invalidation pass
 * with a deduplicated key set rather than one pass per record.
 */

const FLUSH_DELAY_MS = 50;

const serialise = (key: QueryKey) => JSON.stringify(key);

/** Keys affected by one event. Everything here is a prefix match against an existing key. */
const keysFor = (event: ChangeEvent): QueryKey[] => {
  const keys: QueryKey[] = [];
  const ids = [event.serverId, event.localId].filter(Boolean) as string[];

  switch (event.entity) {
    case 'products': {
      keys.push(queryKeys.products.all);
      // The category filter list only changes when a category does.
      if (!event.fields || event.fields.includes('category')) keys.push(queryKeys.products.categories);
      break;
    }

    case 'customers': {
      keys.push(queryKeys.customers.all);
      // A customer's name is snapshotted onto its documents' list rows.
      if (!event.fields || event.fields.includes('name')) {
        for (const id of ids) keys.push(queryKeys.payments.customer(id));
      }
      break;
    }

    case 'invoices': {
      keys.push(queryKeys.invoices.all);
      keys.push(queryKeys.documents.all);
      keys.push(queryKeys.report.all);
      for (const id of ids) keys.push(queryKeys.invoices.detail(id));
      break;
    }

    case 'referrals': {
      keys.push(queryKeys.referrals.all);
      // The reward IS a subscription change, and it arrives with the server's acknowledgement of the
      // referral. Invalidating the plan here is what makes the app go Pro through the path every other
      // plan change already uses — no referral-specific payload, no socket, no bespoke notification.
      if (event.origin === 'sync') keys.push(queryKeys.billing.all);
      break;
    }

    case 'payments': {
      keys.push(queryKeys.payments.all);
      keys.push(queryKeys.report.all);
      // A receipt moves the balance and the status chip on the bill's list row too, not only
      // on its detail screen.
      keys.push(queryKeys.invoices.all);
      // A receipt moves the invoice's balance and the customer's dues — but only theirs.
      for (const relation of event.related ?? []) {
        if (relation.entity === 'invoices') {
          keys.push(queryKeys.payments.invoice(relation.id));
          keys.push(queryKeys.invoices.detail(relation.id));
        }
        if (relation.entity === 'customers') {
          keys.push(queryKeys.payments.customer(relation.id));
          keys.push(queryKeys.payments.customerOutstanding(relation.id));
        }
      }
      break;
    }

    case 'expenses': {
      keys.push(queryKeys.expenses.all);
      keys.push(queryKeys.report.all);
      break;
    }

    case 'suppliers': {
      keys.push(queryKeys.purchases.all);
      break;
    }

    case 'business': {
      keys.push(queryKeys.auth.me);
      break;
    }
  }

  return keys;
};

/** Exported for tests: the exact key set a batch of events touches, deduplicated. */
export const invalidationKeysFor = (events: ChangeEvent[]): QueryKey[] => {
  const unique = new Map<string, QueryKey>();
  for (const event of events) {
    for (const key of keysFor(event)) unique.set(serialise(key), key);
  }
  return [...unique.values()];
};

/**
 * Subscribes the query cache to local database changes. Returns an unsubscribe, and is safe
 * to call twice — the second call replaces the first rather than doubling the invalidations.
 */
export const setupChangeBridge = (client: QueryClient, { delayMs = FLUSH_DELAY_MS } = {}) => {
  let pending: ChangeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const events = pending;
    pending = [];

    for (const key of invalidationKeysFor(events)) {
      // Prefix match: `['invoices']` covers every invoice list, `['invoices', id]` one detail.
      client.invalidateQueries({ queryKey: key });
    }
  };

  const unsubscribe = subscribeToChanges((events) => {
    pending.push(...events);
    // Coalesced: a 200-record pull page is one invalidation pass, not two hundred.
    if (!timer) timer = setTimeout(flush, delayMs);
  });

  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    timer = null;
    pending = [];
  };
};
