import { projectInvoicePayment, projectedBalanceDue } from '../paymentProjection';
import type { MongoDoc } from '../mappers';

/**
 * An invoice partly settled by customer credit, with a receipt still queued on this device.
 * The projection has to count both, or the bill re-opens for money the credit already paid.
 */
const invoice: MongoDoc = { total: 5000, paidAmount: 0, creditApplied: 2000, documentStatus: 'issued', status: 'pending' };

describe('projecting a queued receipt onto an invoice settled partly by credit', () => {
  it('leaves the credit standing when the receipt is applied', () => {
    const projected = projectInvoicePayment(invoice, 1000);
    expect(projected.paidAmount).toBe(1000);
    expect(projected.balanceDue).toBe(2000);
    expect(projected.paymentStatus).toBe('partial');
  });

  it('caps the paid figure at what the credit has not already settled', () => {
    const projected = projectInvoicePayment(invoice, 4000);
    // Only 3000 was left to pay; the rest is the server's to park as credit.
    expect(projected.paidAmount).toBe(3000);
    expect(projected.balanceDue).toBe(0);
    expect(projected.paymentStatus).toBe('paid');
    expect(projected.status).toBe('paid');
  });

  it('counts credit as settled when nothing is queued against it', () => {
    expect(projectedBalanceDue(invoice, 0)).toBe(3000);
    expect(projectedBalanceDue(invoice, 3000)).toBe(0);
  });

  it('still reads unpaid when neither money nor credit has touched it', () => {
    const untouched: MongoDoc = { total: 5000, paidAmount: 0, creditApplied: 0 };
    expect(projectInvoicePayment(untouched, 0)).toBe(untouched);
    expect(projectedBalanceDue(untouched, 0)).toBe(5000);
  });
});
