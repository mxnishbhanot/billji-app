import { Invoice } from '@/types';

/**
 * Tax heads to print, summed from the stored HSN summary. Returns [] for documents
 * issued before the GST engine, which have no summary and fall back to a single merged
 * "Tax" row. Plain function rather than a memo: it walks a handful of rows, and the
 * document is only available after a screen's loading guards.
 *
 * Shared by every sales document — a credit note files the same heads as the supply it
 * reverses, so the split must be printed identically on both.
 */
export const gstHeadsFor = (document: Pick<Invoice, 'taxSummary' | 'supplyType'>) => {
  const summary = document.taxSummary ?? [];
  if (!summary.length) return [];

  const sum = (key: 'cgst' | 'sgst' | 'igst') =>
    Math.round(summary.reduce((total, row) => total + Number(row[key] || 0), 0) * 100) / 100;

  return (
    document.supplyType === 'inter'
      ? [{ label: 'IGST', amount: sum('igst') }]
      : [
          { label: 'CGST', amount: sum('cgst') },
          { label: 'SGST', amount: sum('sgst') }
        ]
  ).filter((head) => head.amount > 0);
};
