/**
 * Quotation detail presentation rules. The lifecycle (numbering, conversion, cancellation)
 * lives on the server; what is pinned here is what the screen decides on its own — a
 * quotation is an offer, not a receivable, so no payment, balance or due information may
 * ever appear, and the actions offered must match the three states the API supports
 * (issued, void = already invoiced, cancelled).
 */
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
  documentsApi: { get: jest.fn(), convert: jest.fn(), cancel: jest.fn() }
}));
jest.mock('@/shared/hooks/usePermissions', () => ({
  PERMISSION: { invoicesCreate: 'invoices.create', invoicesUpdate: 'invoices.update' },
  usePermissions: () => ({ can: () => true })
}));

import { QuotationDetailScreen } from '@/screens/QuotationDetailScreen';
import { documentsApi } from '@/api/endpoints';

const dayOffset = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const QUOTATION = {
  _id: 'qt-1',
  documentNumber: 'QTN-2026-27-0004',
  documentType: 'quotation',
  documentStatus: 'issued',
  date: '2026-02-01',
  // Relative so the fixture stays a live quote whenever the suite runs.
  validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
  customer: 'cus-1',
  customerSnapshot: { name: 'Anita Traders', phone: '9876543210', countryCode: '+91', address: 'Shop 4, Station Road, Nashik' },
  items: [{ _id: 'it-1', name: 'Steel pipe', quantity: 2, unit: 'pcs', price: 500, total: 1050 }],
  subtotal: 1000,
  discount: { type: 'flat', value: 0, amount: 0 },
  tax: { rate: 5, amount: 50 },
  taxSummary: [{ hsn: '7306', taxableValue: 1000, cgst: 25, sgst: 25, igst: 0 }],
  supplyType: 'intra',
  placeOfSupply: { code: '27', state: 'Maharashtra' },
  total: 1050,
  status: 'pending',
  notes: 'Delivery in 7 working days',
  pdfUrl: 'https://example.test/qt-1.pdf'
} as unknown as Invoice;

const renderDetail = (quotation: Partial<Invoice> = {}) => {
  (documentsApi.get as jest.Mock).mockResolvedValue({ ...QUOTATION, ...quotation });
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider>
        <QuotationDetailScreen route={{ params: { id: 'qt-1' } } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation };
};

describe('QuotationDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the document as a quotation, not an invoice', async () => {
    renderDetail();
    expect(await screen.findByText('Quotation')).toBeTruthy();
    expect(screen.getAllByText('QTN-2026-27-0004').length).toBeGreaterThan(0);
    expect(screen.getByText('01 Feb 2026')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
  });

  it('headlines the quoted total and never an amount owed', async () => {
    renderDetail();
    // Twice: the hero headline and the summary's closing line.
    expect((await screen.findAllByText('Quoted total')).length).toBe(2);
    expect(screen.getAllByText('₹1,050.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Amount due')).toBeNull();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('PAYMENT')).toBeNull();
    expect(screen.queryByText('Record payment')).toBeNull();
    expect(screen.queryByText('BILL SUMMARY')).toBeNull();
    expect(
      screen.getByText('An offer, not a bill — nothing is owed, no stock has moved, and nothing is collected until this becomes an invoice.')
    ).toBeTruthy();
  });

  it('states how long the price holds', async () => {
    renderDetail({ validUntil: dayOffset(10) });
    expect(await screen.findByText(/^Valid until /)).toBeTruthy();
  });

  it('says so plainly when there is no validity date', async () => {
    renderDetail({ validUntil: null });
    expect(await screen.findByText('No expiry date · this price holds until you withdraw it')).toBeTruthy();
  });

  it('marks a lapsed quote expired without treating it as an error, and still allows invoicing', async () => {
    renderDetail({ validUntil: dayOffset(-3) });
    expect(await screen.findByText('expired')).toBeTruthy();
    expect(screen.getByText(/^Expired on /)).toBeTruthy();
    expect(screen.getByText('The price on this quote has lapsed. You can still invoice it, or raise a fresh quotation at current prices.')).toBeTruthy();
    expect(screen.getByText('Convert to invoice')).toBeTruthy();
  });

  it('names the party the quote was prepared for, and lists what was quoted', async () => {
    renderDetail();
    expect(await screen.findByText('QUOTED TO')).toBeTruthy();
    expect(screen.getByText('Anita Traders')).toBeTruthy();
    expect(screen.getByText('Shop 4, Station Road, Nashik')).toBeTruthy();
    expect(screen.queryByText('BILLED TO')).toBeNull();
    expect(screen.getByText('QUOTED ITEMS')).toBeTruthy();
    expect(screen.getByText('Steel pipe')).toBeTruthy();
    expect(screen.getByText('2 pcs × ₹500.00')).toBeTruthy();
  });

  it('summarises the offer, suppressing rows that do not apply', async () => {
    renderDetail();
    expect(await screen.findByText('QUOTATION SUMMARY')).toBeTruthy();
    expect(screen.getByText('Subtotal')).toBeTruthy();
    expect(screen.getByText('CGST')).toBeTruthy();
    expect(screen.getByText('SGST')).toBeTruthy();
    expect(screen.getByText('Maharashtra')).toBeTruthy();
    expect(screen.getAllByText('Quoted total').length).toBe(2);
    expect(screen.queryByText('Discount')).toBeNull();
    expect(screen.getByText('NOTES')).toBeTruthy();
    expect(screen.getByText('Delivery in 7 working days')).toBeTruthy();
  });

  it('offers sharing and conversion while the quote is live', async () => {
    (documentsApi.convert as jest.Mock).mockResolvedValue({ _id: 'inv-9', invoiceNumber: 'INV-2026-27-0011' });
    const { navigation } = renderDetail();
    expect(await screen.findByText('PDF')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Convert to invoice' }));
    await waitFor(() => expect(documentsApi.convert).toHaveBeenCalledWith('quotation', 'qt-1'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-9' }));
  });

  it('stops offering conversion once the quote has become an invoice', async () => {
    renderDetail({ documentStatus: 'void' });
    expect(await screen.findByText('invoiced')).toBeTruthy();
    expect(screen.getByText('Already converted to an invoice')).toBeTruthy();
    expect(screen.queryByText('Convert to invoice')).toBeNull();
    expect(screen.queryByText('Cancel quotation')).toBeNull();
    // A spent quote can still be sent as a record of what was offered.
    expect(screen.getByText('PDF')).toBeTruthy();
  });

  it('withdraws the offer once cancelled, and stops offering share, convert or cancel', async () => {
    renderDetail({ documentStatus: 'cancelled' });
    expect(await screen.findByText('cancelled')).toBeTruthy();
    expect(screen.getByText('Cancelled · this quote can no longer be invoiced')).toBeTruthy();
    expect(screen.queryByText('PDF')).toBeNull();
    expect(screen.queryByText('WhatsApp')).toBeNull();
    expect(screen.queryByText('Convert to invoice')).toBeNull();
    expect(screen.queryByText('Cancel quotation')).toBeNull();
  });

  it('handles a counter enquiry with no customer account, no notes and long text', async () => {
    const longName = 'Shri Balaji Hardware & Sanitary Suppliers Private Limited, Nashik Branch';
    renderDetail({
      customer: null,
      customerSnapshot: { name: longName } as any,
      notes: '',
      items: [{ _id: 'it-1', name: 'Heavy duty galvanised steel pipe, 40mm, 6m length', quantity: 1, price: 500, total: 525 }] as any
    });
    expect(await screen.findByText('Counter enquiry · no customer account')).toBeTruthy();
    expect(screen.getByText(longName)).toBeTruthy();
    expect(screen.getByText('Heavy duty galvanised steel pipe, 40mm, 6m length')).toBeTruthy();
    expect(screen.queryByText('NOTES')).toBeNull();
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });

  it('links a converted quotation to the invoice the server resolved, and never invents one', async () => {
    const { navigation } = renderDetail({
      documentStatus: 'void',
      linkedInvoice: { id: 'inv-9', invoiceNumber: 'INV-2026-27-0011' }
    });
    fireEvent.press(await screen.findByLabelText('View invoice INV-2026-27-0011'));
    expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-9' });

    // No resolvable invoice means no link at all rather than a broken one.
    screen.unmount();
    renderDetail({ documentStatus: 'void', linkedInvoice: null });
    expect(await screen.findByText('invoiced')).toBeTruthy();
    expect(screen.queryByText('INVOICE')).toBeNull();
  });
});
