import { columnsFor, fromRow, isUuid, normalizePhone, toBoolInt, toIsoText, toRow, uuidv7 } from '../mappers';

const CTX = { businessId: 'biz1', now: '2026-08-02T00:00:00.000Z' };

describe('primitive conversions', () => {
  it('normalises every date shape to ISO text, and garbage to null', () => {
    expect(toIsoText('2026-08-02T10:30:00+05:30')).toBe('2026-08-02T05:00:00.000Z');
    expect(toIsoText(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(toIsoText(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(toIsoText('not a date')).toBeNull();
    expect(toIsoText(undefined)).toBeNull();
    expect(toIsoText('')).toBeNull();
  });

  it('maps booleans to 0/1 and keeps missing distinct from false', () => {
    expect(toBoolInt(true)).toBe(1);
    expect(toBoolInt(false)).toBe(0);
    expect(toBoolInt('true')).toBe(1);
    expect(toBoolInt(undefined)).toBeNull();
  });

  it('mints time-ordered v7 uuids', () => {
    const early = uuidv7(1_000_000);
    const late = uuidv7(2_000_000);
    expect(isUuid(early)).toBe(true);
    expect(early[14]).toBe('7');
    expect('89ab').toContain(late[19]);
    expect(early < late).toBe(true);
    expect(uuidv7()).not.toBe(uuidv7());
  });

  it('strips the country code for duplicate detection', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('9876543210')).toBe('9876543210');
    expect(normalizePhone('')).toBeNull();
  });
});

describe('toRow', () => {
  const product = {
    _id: '65f0000000000000000000aa',
    business: 'biz1',
    name: 'Cement bag',
    price: 380,
    stockQuantity: 12,
    sku: '',
    trackStock: false,
    isActive: true,
    taxRate: 18,
    version: 3,
    deletedAt: null,
    updatedAt: '2026-08-01T09:00:00.000Z'
  };

  it('fills the envelope and promotes columns', () => {
    const row = toRow('products', product, CTX);

    expect(row.server_id).toBe('65f0000000000000000000aa');
    expect(row.business_id).toBe('biz1');
    expect(row.version).toBe(3);
    expect(row.sync_state).toBe('synced');
    expect(row.deleted_at).toBeNull();
    expect(row.server_updated_at).toBe('2026-08-01T09:00:00.000Z');
    expect(row.local_updated_at).toBe(CTX.now);
    expect(isUuid(String(row.local_id))).toBe(true);
    // false must survive as 0, not fall through to the column default.
    expect(row.track_stock).toBe(0);
    expect(row.is_active).toBe(1);
    // Empty Mongo string is null so the partial SKU index skips it.
    expect(row.sku).toBeNull();
    expect(row.low_stock_threshold).toBeNull();
  });

  it('applies NOT NULL defaults where the document has nothing', () => {
    const row = toRow('products', { name: 'Sand' }, CTX);
    expect(row.price).toBe(0);
    expect(row.stock_quantity).toBe(0);
    expect(row.track_stock).toBe(1);
    expect(row.server_id).toBeNull();
  });

  it('keeps the payload verbatim, unknown fields included', () => {
    const row = toRow('products', { ...product, futureField: { nested: true } }, CTX);
    expect(fromRow(row).doc).toMatchObject({ name: 'Cement bag', futureField: { nested: true } });
  });

  it('reuses clientId as local_id on first insert and never rewrites it after', () => {
    const clientId = uuidv7();
    expect(toRow('products', { ...product, clientId }, CTX).local_id).toBe(clientId);
    expect(toRow('products', { ...product, clientId }, { ...CTX, localId: 'kept' }).local_id).toBe('kept');
  });

  it('records both sides of a reference and resolves the local id when known', () => {
    const invoice = {
      _id: 'inv1',
      documentNumber: 'INV/0001',
      customer: { _id: 'cust1', name: 'ignored' },
      customerSnapshot: { name: 'Ramesh' },
      date: '2026-07-30T00:00:00.000Z',
      dueDate: null,
      total: 1180,
      paidAmount: 180
    };
    const row = toRow('invoices', invoice, { ...CTX, resolveLocalId: (entity, id) => (id === 'cust1' ? 'cust-local' : null) });

    expect(row.customer_server_id).toBe('cust1');
    expect(row.customer_local_id).toBe('cust-local');
    expect(row.customer_name).toBe('Ramesh');
    expect(row.due_date).toBeNull();
    expect(row.balance_due).toBe(0);
    expect(row.document_status).toBe('draft');

    const unresolved = toRow('invoices', invoice, CTX);
    expect(unresolved.customer_local_id).toBeNull();
    expect(unresolved.customer_server_id).toBe('cust1');
  });

  it('falls back to the legacy invoice ref on payments', () => {
    const row = toRow('payments', { invoice: 'inv1', amount: 500, receivedAt: '2026-07-31T00:00:00.000Z' }, CTX);
    expect(row.invoice_server_id).toBe('inv1');
    expect(row.status).toBe('completed');
    expect(row.received_at).toBe('2026-07-31T00:00:00.000Z');
  });

  it('maps the vendor model onto the supplier table', () => {
    const row = toRow('suppliers', { name: 'Acme', phone: '+91 90000 11111', outstandingPayable: 2500 }, CTX);
    expect(row.name).toBe('Acme');
    expect(row.phone_normalized).toBe('9000011111');
    expect(row.outstanding_payable).toBe(2500);
  });

  it('produces exactly the declared columns', () => {
    expect(Object.keys(toRow('customers', { name: 'A', phone: '1' }, CTX)).sort()).toEqual(columnsFor('customers').sort());
  });
});

describe('fromRow', () => {
  it('round-trips the document and typed envelope', () => {
    const doc = { _id: 'c1', name: 'Ramesh', isActive: false, createdAt: '2026-01-01T00:00:00.000Z' };
    const record = fromRow(toRow('customers', doc, { ...CTX, syncState: 'pending' }));

    expect(record.doc).toEqual(doc);
    expect(record.serverId).toBe('c1');
    expect(record.syncState).toBe('pending');
    expect(record.version).toBeNull();
  });

  it('returns a null document for a corrupt payload instead of throwing', () => {
    expect(fromRow({ local_id: 'x', payload: '{oops' }).doc).toBeNull();
  });
});
