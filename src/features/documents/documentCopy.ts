import { Invoice, SalesDocumentKind } from '@/types';

/**
 * The words each sales document is described with, in one place.
 *
 * Cancellation copy in particular used to be written twice — once in the documents list's
 * confirm dialog and once in the document's own detail screen — with the list's version
 * quietly shorter. The consequences of cancelling are the part a user must not read two
 * different accounts of, so both now read from here.
 *
 * `convertsToInvoice` and `touchesCustomers` mirror the server's rules table
 * (backend/src/modules/documents/documentTypes.js): a credit note converts to nothing and is
 * the only one of the three that moves a customer's balance.
 */
export type DocumentCopy = {
  /** Screen title, e.g. the header of the detail screen. */
  title: string;
  /** Lower-case noun for sentences: "Could not cancel {noun}". */
  noun: string;
  cancelTitle: string;
  cancelLabel: string;
  cancelMessage: (document: Pick<Invoice, 'items'>) => string;
  convertsToInvoice: boolean;
  touchesCustomers: boolean;
};

export const DOCUMENT_COPY: Record<SalesDocumentKind, DocumentCopy> = {
  quotation: {
    title: 'Quotation',
    noun: 'quotation',
    cancelTitle: 'Cancel quotation?',
    cancelLabel: 'Cancel quotation',
    cancelMessage: () => 'The quotation can no longer be converted to an invoice. This cannot be undone.',
    convertsToInvoice: true,
    touchesCustomers: false
  },
  delivery_challan: {
    title: 'Delivery challan',
    noun: 'challan',
    cancelTitle: 'Cancel challan?',
    cancelLabel: 'Cancel challan',
    cancelMessage: () =>
      'Stock sent on this challan goes back into inventory and it can no longer be converted to an invoice. This cannot be undone.',
    convertsToInvoice: true,
    touchesCustomers: false
  },
  credit_note: {
    title: 'Credit note',
    noun: 'credit note',
    cancelTitle: 'Cancel credit note?',
    cancelLabel: 'Cancel credit note',
    // Stock only came back for lines that are catalogue products, so only mention it when
    // there are any — the same test the detail screen has always applied.
    cancelMessage: (document) =>
      document.items.some((item) => item.product)
        ? 'The credit is withdrawn and the customer owes the amount again. Returned units are taken back out of stock. This cannot be undone.'
        : 'The credit is withdrawn and the customer owes the amount again. This cannot be undone.',
    convertsToInvoice: false,
    touchesCustomers: true
  }
};
