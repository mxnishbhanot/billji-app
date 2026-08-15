/**
 * The two small decisions the document copy layer makes on its own: what the stored status
 * means, and what cancelling a document actually costs. Both were duplicated per screen
 * before, which is exactly how the list and the detail screen came to describe the same
 * cancellation differently.
 */
import { Invoice } from '@/types';
import { DOCUMENT_COPY } from '../documentCopy';
import { documentLifecycle } from '../lifecycle';

const withItems = (items: { product?: string | null }[]) => ({ items } as Pick<Invoice, 'items'>);

describe('documentLifecycle', () => {
  it('reads the overloaded "void" as invoiced, never as an error state', () => {
    expect(documentLifecycle({ documentStatus: 'void' })).toBe('invoiced');
    expect(documentLifecycle({ documentStatus: 'cancelled' })).toBe('cancelled');
    expect(documentLifecycle({ documentStatus: 'issued' })).toBe('open');
    // Anything the server has not taught us about is still a live document.
    expect(documentLifecycle({ documentStatus: undefined })).toBe('open');
  });
});

describe('DOCUMENT_COPY', () => {
  it('states the consequence of cancelling, per document type', () => {
    expect(DOCUMENT_COPY.quotation.cancelMessage(withItems([]))).toContain('can no longer be converted to an invoice');
    expect(DOCUMENT_COPY.delivery_challan.cancelMessage(withItems([]))).toContain('goes back into inventory');
  });

  it('only promises a credit note takes stock back when it holds catalogue products', () => {
    expect(DOCUMENT_COPY.credit_note.cancelMessage(withItems([{ product: 'prod-1' }]))).toContain('taken back out of stock');
    expect(DOCUMENT_COPY.credit_note.cancelMessage(withItems([{ product: null }]))).not.toContain('stock');
  });

  it('mirrors the server rules for conversion and customer balances', () => {
    expect(DOCUMENT_COPY.quotation.convertsToInvoice).toBe(true);
    expect(DOCUMENT_COPY.delivery_challan.convertsToInvoice).toBe(true);
    expect(DOCUMENT_COPY.credit_note.convertsToInvoice).toBe(false);
    expect(DOCUMENT_COPY.credit_note.touchesCustomers).toBe(true);
    expect(DOCUMENT_COPY.quotation.touchesCustomers).toBe(false);
  });
});
