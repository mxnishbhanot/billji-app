import { Invoice } from '@/types';

/**
 * The state of a convertible sales document (quotation, delivery challan), named once.
 *
 * The server stores `documentStatus: 'void'` for "this became an invoice" — the same word it
 * uses nowhere else with that meaning, and the reason every screen used to re-derive and
 * re-comment the mapping. Read it through here instead, so the overloaded word is decoded in
 * exactly one place:
 *
 *   issued    → open      still live, can be converted or cancelled
 *   void      → invoiced  already converted, once; the invoice is the live document
 *   cancelled → cancelled withdrawn, whatever it moved has been put back
 */
export type DocumentLifecycle = 'open' | 'invoiced' | 'cancelled';

export const documentLifecycle = (document: Pick<Invoice, 'documentStatus'>): DocumentLifecycle => {
  if (document.documentStatus === 'cancelled') return 'cancelled';
  if (document.documentStatus === 'void') return 'invoiced';
  return 'open';
};
