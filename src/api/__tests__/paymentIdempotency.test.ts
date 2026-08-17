import { useAuthStore } from '@/store/authStore';
import { api } from '../client';
import { documentsApi, paymentsApi } from '../endpoints';

/**
 * The online payment retry path: a retry of the same payment must carry the same
 * Idempotency-Key, or a receipt whose response was lost is recorded twice.
 *
 * The local-first path is disabled here (no signed-in business), so every call goes to the
 * network — which is the only path that ever had this hole.
 */

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(async () => undefined)
}));

jest.mock('../client', () => ({
  api: {
    get: jest.fn(async () => ({ data: {} })),
    post: jest.fn(async () => ({ data: {} })),
    patch: jest.fn(async () => ({ data: {} })),
    delete: jest.fn(async () => ({ data: {} }))
  },
  apiBaseUrl: 'http://localhost',
  apiErrorMessage: (error: unknown) => String(error)
}));

const network = api as unknown as { post: jest.Mock };

const PAYMENT = { amount: 500, method: 'cash' as const };

const keyOf = (call: number) => network.post.mock.calls[call][2].headers['Idempotency-Key'] as string;

const timeout = () => Object.assign(new Error('timeout of 0ms exceeded'), { isAxiosError: true, response: undefined });
const refusal = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data: {} } });

beforeEach(() => {
  network.post.mockReset();
  network.post.mockResolvedValue({ data: { success: true } });
  // No business => localWrite falls through to the network path.
  useAuthStore.setState({ user: null });
});

describe('online payment idempotency', () => {
  it('reuses the key when the outcome is unknown', async () => {
    network.post.mockRejectedValueOnce(timeout());

    await expect(paymentsApi.recordInvoicePayment('inv-1', PAYMENT)).rejects.toThrow();
    await paymentsApi.recordInvoicePayment('inv-1', PAYMENT);

    expect(network.post).toHaveBeenCalledTimes(2);
    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('holds the key while the server says the first attempt is still processing', async () => {
    network.post.mockRejectedValueOnce(refusal(409));

    await expect(paymentsApi.recordInvoicePayment('inv-1', PAYMENT)).rejects.toThrow();
    await paymentsApi.recordInvoicePayment('inv-1', PAYMENT);

    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('mints a new key once a payment has succeeded', async () => {
    await paymentsApi.recordInvoicePayment('inv-1', PAYMENT);
    await paymentsApi.recordInvoicePayment('inv-1', PAYMENT);

    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it('mints a new key after a definite refusal', async () => {
    network.post.mockRejectedValueOnce(refusal(422));

    await expect(paymentsApi.recordInvoicePayment('inv-1', PAYMENT)).rejects.toThrow();
    await paymentsApi.recordInvoicePayment('inv-1', PAYMENT);

    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it('does not share a key between different payments', async () => {
    network.post.mockRejectedValue(timeout());

    await expect(paymentsApi.recordInvoicePayment('inv-1', PAYMENT)).rejects.toThrow();
    await expect(paymentsApi.recordInvoicePayment('inv-1', { amount: 250, method: 'cash' })).rejects.toThrow();
    await expect(paymentsApi.recordInvoicePayment('inv-2', PAYMENT)).rejects.toThrow();

    expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3);
  });

  it('applies the same rule to a dues-settling payment', async () => {
    network.post.mockRejectedValueOnce(timeout());
    const payload = { amount: 900, method: 'upi' as const, invoiceIds: ['inv-1', 'inv-2'] };

    await expect(paymentsApi.recordCustomerPayment('cust-1', payload)).rejects.toThrow();
    await paymentsApi.recordCustomerPayment('cust-1', payload);

    expect(keyOf(0)).toBe(keyOf(1));
  });
});

/**
 * Applying credit is a settlement, so it carries the payment contract rather than the
 * plain-create one: a retry after an unknown outcome must not spend the pool twice.
 */
describe('credit application idempotency', () => {
  it('reuses the key when the outcome is unknown', async () => {
    network.post.mockRejectedValueOnce(timeout());

    await expect(paymentsApi.applyCredit('inv-1', 400)).rejects.toThrow();
    await paymentsApi.applyCredit('inv-1', 400);

    expect(network.post).toHaveBeenCalledTimes(2);
    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('holds the key on a 409, which is exactly the unresolved case', async () => {
    network.post.mockRejectedValueOnce(refusal(409));

    await expect(paymentsApi.applyCredit('inv-1', 400)).rejects.toThrow();
    await paymentsApi.applyCredit('inv-1', 400);

    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('mints a new key once an application has succeeded', async () => {
    await paymentsApi.applyCredit('inv-1', 400);
    await paymentsApi.applyCredit('inv-1', 400);

    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it('mints a new key after a definite refusal', async () => {
    network.post.mockRejectedValueOnce(refusal(422));

    await expect(paymentsApi.applyCredit('inv-1', 400)).rejects.toThrow();
    await paymentsApi.applyCredit('inv-1', 400);

    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it('does not share a key between different applications', async () => {
    network.post.mockRejectedValue(timeout());

    await expect(paymentsApi.applyCredit('inv-1', 400)).rejects.toThrow();
    await expect(paymentsApi.applyCredit('inv-1', 250)).rejects.toThrow();
    await expect(paymentsApi.applyCredit('inv-2', 400)).rejects.toThrow();

    expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3);
  });
});

/** A credit note mints credit, so a lost response must not raise a second one. */
describe('credit note creation idempotency', () => {
  const NOTE = {
    customerId: 'cust-1',
    items: [{ productId: 'prod-1', name: 'Rice', quantity: 1, price: 400, taxRate: 0 }],
    taxRate: 0,
    discountType: 'flat' as const,
    discountValue: 0,
    notes: '',
    sourceInvoiceId: 'inv-1'
  };

  it('reuses the key when the outcome is unknown', async () => {
    network.post.mockRejectedValueOnce(timeout());

    await expect(documentsApi.create('credit_note', NOTE)).rejects.toThrow();
    await documentsApi.create('credit_note', NOTE);

    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('mints a new key once the note has been raised', async () => {
    await documentsApi.create('credit_note', NOTE);
    await documentsApi.create('credit_note', NOTE);

    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it('does not share a key between different notes', async () => {
    network.post.mockRejectedValue(timeout());

    await expect(documentsApi.create('credit_note', NOTE)).rejects.toThrow();
    await expect(documentsApi.create('credit_note', { ...NOTE, sourceInvoiceId: 'inv-2' })).rejects.toThrow();
    await expect(documentsApi.create('quotation', NOTE)).rejects.toThrow();

    expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3);
  });
});
