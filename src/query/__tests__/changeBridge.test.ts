import { QueryClient } from '@tanstack/react-query';
import { emitChange, resetChangeBus, type ChangeEvent } from '@/db';
import { queryKeys } from '@/shared/query/queryKeys';
import { invalidationKeysFor, setupChangeBridge } from '../changeBridge';

const event = (overrides: Partial<ChangeEvent> & Pick<ChangeEvent, 'entity'>): ChangeEvent => ({
  type: 'updated',
  localId: 'local-1',
  origin: 'local',
  ...overrides
});

const keys = (events: ChangeEvent[]) => invalidationKeysFor(events).map((key) => JSON.stringify(key));

afterEach(() => resetChangeBus());

describe('key selection', () => {
  it('touches one entity, never the whole cache', () => {
    const selected = keys([event({ entity: 'products', fields: ['price'] })]);

    expect(selected).toEqual(['["products"]']);
    // The category filter list is untouched by a price edit.
    expect(selected).not.toContain(JSON.stringify(queryKeys.products.categories));
    expect(selected).not.toContain('["invoices"]');
    expect(selected).not.toContain('["report"]');
  });

  it('invalidates the category list only when a category changes', () => {
    expect(keys([event({ entity: 'products', fields: ['category'] })])).toContain(
      JSON.stringify(queryKeys.products.categories)
    );
    // Unknown fields means "assume everything", which is the safe direction.
    expect(keys([event({ entity: 'products' })])).toContain(JSON.stringify(queryKeys.products.categories));
  });

  it('invalidates one invoice detail, not every invoice detail', () => {
    const selected = keys([event({ entity: 'invoices', localId: 'local-9', serverId: 'srv-9' })]);

    expect(selected).toEqual(
      expect.arrayContaining([
        JSON.stringify(queryKeys.invoices.detail('srv-9')),
        JSON.stringify(queryKeys.invoices.detail('local-9'))
      ])
    );
    expect(selected).not.toContain(JSON.stringify(queryKeys.invoices.detail('some-other-invoice')));
  });

  it('follows a payment to the invoice and customer it moves, and no further', () => {
    const selected = keys([
      event({
        entity: 'payments',
        type: 'created',
        related: [
          { entity: 'invoices', id: 'inv-1' },
          { entity: 'customers', id: 'cust-1' }
        ]
      })
    ]);

    expect(selected).toEqual(
      expect.arrayContaining([
        JSON.stringify(queryKeys.payments.invoice('inv-1')),
        JSON.stringify(queryKeys.invoices.detail('inv-1')),
        JSON.stringify(queryKeys.payments.customerOutstanding('cust-1'))
      ])
    );
    expect(selected).not.toContain(JSON.stringify(queryKeys.payments.invoice('inv-2')));
    expect(selected).not.toContain('["customers"]');
    // The bill's list row shows the balance too, so the list refreshes with the detail.
    expect(selected).toContain(JSON.stringify(queryKeys.invoices.all));
  });

  it('follows a dues collection to every bill it settled', () => {
    const selected = keys([
      event({
        entity: 'payments',
        type: 'created',
        related: [
          { entity: 'invoices', id: 'inv-1' },
          { entity: 'invoices', id: 'inv-2' },
          { entity: 'customers', id: 'cust-1' }
        ]
      })
    ]);

    // One receipt, two bills: naming only the last one leaves the other showing a paid
    // balance as still owing.
    expect(selected).toEqual(
      expect.arrayContaining([
        JSON.stringify(queryKeys.invoices.detail('inv-1')),
        JSON.stringify(queryKeys.invoices.detail('inv-2'))
      ])
    );
  });

  it('deduplicates a batch instead of repeating a key per record', () => {
    const page = Array.from({ length: 200 }, (_, index) =>
      event({ entity: 'products', localId: `p${index}`, fields: ['price'] })
    );

    expect(keys(page)).toEqual(['["products"]']);
  });
});

describe('bridge', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('invalidates only the affected queries when a change lands', async () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const stop = setupChangeBridge(client, { delayMs: 1 });

    emitChange(event({ entity: 'customers', fields: ['email'] }));
    await flush();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.customers.all });
    stop();
  });

  it('coalesces a burst into one pass', async () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const stop = setupChangeBridge(client, { delayMs: 5 });

    for (let index = 0; index < 50; index += 1) {
      emitChange(event({ entity: 'products', localId: `p${index}`, fields: ['price'] }));
    }
    await flush();

    // Fifty records, one invalidation.
    expect(invalidate).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops invalidating once unsubscribed', async () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    setupChangeBridge(client, { delayMs: 1 })();

    emitChange(event({ entity: 'invoices' }));
    await flush();

    expect(invalidate).not.toHaveBeenCalled();
  });
});
