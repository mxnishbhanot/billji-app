/**
 * Credit note detail presentation rules. The lifecycle (stock restore, reversing ledger,
 * customer balance) lives on the server; what is pinned here is what the screen decides on
 * its own — a credit note is not a receivable, so no payment, balance or due information may
 * ever appear, and the actions offered must match the two states the API actually supports.
 */
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Invoice } from '@/types';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn(async () => undefined) }));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/components/AppDialog', () => ({ useAppDialog: () => ({ showDialog: jest.fn() }) }));
jest.mock('@/services/pdf', () => ({ openOrSharePdf: jest.fn(async () => undefined) }));
jest.mock('@/api/endpoints', () => ({
  documentsApi: { get: jest.fn(), cancel: jest.fn() },
  invoicesApi: { get: jest.fn() }
}));
jest.mock('@/shared/hooks/usePermissions', () => ({
  PERMISSION: { invoicesUpdate: 'invoices.update' },
  usePermissions: () => ({ can: () => true })
}));

import { CreditNoteDetailScreen } from '@/screens/CreditNoteDetailScreen';
import { documentsApi, invoicesApi } from '@/api/endpoints';

const CREDIT_NOTE = {
  _id: 'cn-1',
  documentNumber: 'CN-2026-27-0001',
  documentType: 'credit_note',
  documentStatus: 'issued',
  date: '2026-02-01',
  customer: 'cus-1',
  customerSnapshot: { name: 'Anita Traders', phone: '9876543210', countryCode: '+91', address: 'Shop 4, Station Road, Nashik' },
  sourceInvoice: 'inv-1',
  reason: 'Two bags arrived torn',
  items: [{ _id: 'it-1', name: 'Steel pipe', quantity: 1, unit: 'pcs', price: 500, total: 525, product: 'prod-1' }],
  subtotal: 500,
  discount: { type: 'flat', value: 0, amount: 0 },
  tax: { rate: 5, amount: 25 },
  taxSummary: [{ hsn: '1006', taxableValue: 500, cgst: 12.5, sgst: 12.5, igst: 0 }],
  supplyType: 'intra',
  placeOfSupply: { code: '27', state: 'Maharashtra' },
  total: 525,
  status: 'pending',
  pdfUrl: 'https://example.test/cn-1.pdf'
} as unknown as Invoice;

const renderDetail = (creditNote: Invoice = CREDIT_NOTE) => {
  (documentsApi.get as jest.Mock).mockResolvedValue(creditNote);
  (invoicesApi.get as jest.Mock).mockResolvedValue({ _id: 'inv-1', invoiceNumber: 'INV-2026-27-0007' });
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider>
        <CreditNoteDetailScreen route={{ params: { id: 'cn-1' } } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation };
};

describe('CreditNoteDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the document as a credit note, not an invoice', async () => {
    renderDetail();
    expect(await screen.findByText('Credit note')).toBeTruthy();
    expect(screen.getAllByText('CN-2026-27-0001').length).toBeGreaterThan(0);
    expect(screen.getByText('01 Feb 2026')).toBeTruthy();
    expect(screen.getByText('issued')).toBeTruthy();
  });

  it('headlines the credit issued rather than an amount due', async () => {
    renderDetail();
    expect(await screen.findByText('Credit issued')).toBeTruthy();
    expect(screen.getAllByText('₹525.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Amount due')).toBeNull();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('PAYMENT')).toBeNull();
    expect(screen.queryByText('Record payment')).toBeNull();
  });

  it('names the customer as the party the credit was issued to', async () => {
    renderDetail();
    expect(await screen.findByText('ISSUED TO')).toBeTruthy();
    expect(screen.getByText('Anita Traders')).toBeTruthy();
    expect(screen.getByText('Shop 4, Station Road, Nashik')).toBeTruthy();
    expect(screen.queryByText('BILLED TO')).toBeNull();
  });

  it('lists the returned items and a credit summary ending in the total credited', async () => {
    renderDetail();
    expect(await screen.findByText('RETURNED ITEMS')).toBeTruthy();
    expect(screen.getByText('Steel pipe')).toBeTruthy();
    expect(screen.getByText('CREDIT SUMMARY')).toBeTruthy();
    expect(screen.getByText('Value of returned items')).toBeTruthy();
    expect(screen.getByText('CGST reversed')).toBeTruthy();
    expect(screen.getByText('Total credited')).toBeTruthy();
    // Zero-value rows stay suppressed, as everywhere else in BillJi.
    expect(screen.queryByText('Discount reversed')).toBeNull();
  });

  it('links to the invoice the credit reverses, by number', async () => {
    const { navigation } = renderDetail();
    expect(await screen.findByText('CREDITED AGAINST')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('INV-2026-27-0007')).toBeTruthy());
    expect(screen.getByText('Credited against INV-2026-27-0007')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('explains the credit and offers sharing while it is live', async () => {
    renderDetail();
    expect(await screen.findByText('EFFECT')).toBeTruthy();
    expect(screen.getByText('₹525.00 was taken off what Anita Traders owes you.')).toBeTruthy();
    expect(screen.getByText('Returned units went back into stock.')).toBeTruthy();
    expect(screen.getByText('REASON FOR CREDIT')).toBeTruthy();
    expect(screen.getByText('Two bags arrived torn')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Cancel credit note')).toBeTruthy();
  });

  it('withdraws the credit visually once cancelled, and stops offering share or cancel', async () => {
    renderDetail({ ...CREDIT_NOTE, documentStatus: 'cancelled', cancelReason: 'Raised twice by mistake' } as Invoice);
    expect(await screen.findByText('Credit withdrawn')).toBeTruthy();
    expect(screen.getByText('Cancelled · the customer owes this amount again')).toBeTruthy();
    expect(screen.getByText('This credit note was cancelled: Raised twice by mistake')).toBeTruthy();
    expect(screen.queryByText('PDF')).toBeNull();
    expect(screen.queryByText('WhatsApp')).toBeNull();
    expect(screen.queryByText('Cancel credit note')).toBeNull();
    expect(screen.queryByText('EFFECT')).toBeNull();
  });

  it('handles a counter sale with no customer account and no optional content', async () => {
    renderDetail({
      ...CREDIT_NOTE,
      customer: null,
      customerSnapshot: { name: 'Walk-in customer' },
      sourceInvoice: null,
      reason: '',
      items: [{ _id: 'it-1', name: 'Loose cable', quantity: 1, price: 500, total: 525 }]
    } as unknown as Invoice);
    expect(await screen.findByText('Counter sale · no customer account')).toBeTruthy();
    expect(screen.getByText('Credited against the original invoice')).toBeTruthy();
    expect(screen.queryByText('CREDITED AGAINST')).toBeNull();
    expect(screen.queryByText('REASON FOR CREDIT')).toBeNull();
    // No catalogue product on the line, so nothing was put back on the shelf.
    expect(screen.queryByText('Returned units went back into stock.')).toBeNull();
    expect(screen.getByText('The sale was reversed in your accounts and reported as a credit note in GST returns.')).toBeTruthy();
  });
});
