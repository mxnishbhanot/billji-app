/**
 * Delivery challan detail presentation rules. The lifecycle (numbering, stock movement,
 * conversion, cancellation) lives on the server; what is pinned here is what the screen
 * decides on its own — a challan records goods leaving, not money owed, so no payment,
 * balance or due information may ever appear, and the actions offered must match the three
 * states the API supports (issued, void = already invoiced, cancelled).
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

import { ChallanDetailScreen } from '@/screens/ChallanDetailScreen';
import { documentsApi } from '@/api/endpoints';

const CHALLAN = {
  _id: 'dc-1',
  documentNumber: 'DC-2026-27-0007',
  documentType: 'delivery_challan',
  documentStatus: 'issued',
  date: '2026-02-01',
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
  // Counted by the server from the movements this challan actually wrote.
  stockEffect: { products: 1, quantity: 2, reversed: false },
  notes: 'Deliver at the rear gate before 6pm',
  pdfUrl: 'https://example.test/dc-1.pdf'
} as unknown as Invoice;

const renderDetail = (challan: Partial<Invoice> = {}) => {
  (documentsApi.get as jest.Mock).mockResolvedValue({ ...CHALLAN, ...challan });
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider>
        <ChallanDetailScreen route={{ params: { id: 'dc-1' } } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation };
};

describe('ChallanDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the document as a delivery challan, not an invoice', async () => {
    renderDetail();
    expect(await screen.findByText('Delivery challan')).toBeTruthy();
    expect(screen.getAllByText('DC-2026-27-0007').length).toBeGreaterThan(0);
    expect(screen.getByText('01 Feb 2026')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
  });

  it('headlines the goods value and never an amount owed', async () => {
    renderDetail();
    // Twice: the hero headline and the summary's closing line.
    expect((await screen.findAllByText('Goods value')).length).toBe(2);
    expect(screen.getAllByText('₹1,050.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Goods delivered · reference value only, nothing is owed on this challan')).toBeTruthy();
    expect(screen.queryByText('Amount due')).toBeNull();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('PAYMENT')).toBeNull();
    expect(screen.queryByText('Record payment')).toBeNull();
    expect(screen.queryByText('BILL SUMMARY')).toBeNull();
  });

  it('reports the stock the server says actually moved, and that nothing is owed', async () => {
    renderDetail();
    expect(
      await screen.findByText(
        'A record of goods sent, not a bill. 2 units came off stock when this challan was issued, and nothing is owed until it becomes an invoice.'
      )
    ).toBeTruthy();
    expect(screen.getByText('STOCK & BILLING')).toBeTruthy();
    expect(screen.getByText('2 units deducted on issue')).toBeTruthy();
    expect(screen.getByText('Not invoiced yet')).toBeTruthy();
  });

  it('never claims stock moved when the server reports no tracked products', async () => {
    renderDetail({ stockEffect: { products: 0, quantity: 0, reversed: false } });
    expect(await screen.findByText('No stock-tracked items')).toBeTruthy();
    expect(
      screen.getByText(
        'A record of goods sent, not a bill. Nothing on it is a stock-tracked item, so inventory is unchanged, and nothing is owed until it becomes an invoice.'
      )
    ).toBeTruthy();
  });

  it('says nothing about stock at all when the server did not report it', async () => {
    renderDetail({ stockEffect: undefined });
    expect(await screen.findByText('A record of goods sent, not a bill. Nothing is owed until it becomes an invoice.')).toBeTruthy();
    // The row is dropped rather than guessed from the document type.
    expect(screen.getByText('STOCK & BILLING')).toBeTruthy();
    expect(screen.queryByText('Stock')).toBeNull();
  });

  it('names the recipient and leads each line with what was delivered', async () => {
    renderDetail();
    expect(await screen.findByText('DELIVERED TO')).toBeTruthy();
    expect(screen.getByText('Anita Traders')).toBeTruthy();
    expect(screen.getByText('Shop 4, Station Road, Nashik')).toBeTruthy();
    expect(screen.queryByText('BILLED TO')).toBeNull();
    expect(screen.getByText('GOODS DELIVERED')).toBeTruthy();
    expect(screen.getByText('Steel pipe')).toBeTruthy();
    expect(screen.getByText('2 pcs')).toBeTruthy();
    expect(screen.getByText('₹500.00 each · ₹1,050.00')).toBeTruthy();
  });

  it('summarises the goods value, suppressing rows that do not apply', async () => {
    renderDetail();
    expect(await screen.findByText('Subtotal')).toBeTruthy();
    expect(screen.getByText('CGST')).toBeTruthy();
    expect(screen.getByText('SGST')).toBeTruthy();
    expect(screen.getByText('Maharashtra')).toBeTruthy();
    expect(screen.queryByText('Discount')).toBeNull();
    expect(screen.getByText('NOTES')).toBeTruthy();
    expect(screen.getByText('Deliver at the rear gate before 6pm')).toBeTruthy();
  });

  it('offers sharing and conversion while the challan is unbilled', async () => {
    (documentsApi.convert as jest.Mock).mockResolvedValue({ _id: 'inv-9', invoiceNumber: 'INV-2026-27-0011' });
    const { navigation } = renderDetail();
    expect(await screen.findByText('PDF')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Convert to invoice' }));
    await waitFor(() => expect(documentsApi.convert).toHaveBeenCalledWith('delivery_challan', 'dc-1'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-9' }));
  });

  it('stops offering conversion once the goods have been invoiced', async () => {
    renderDetail({ documentStatus: 'void' });
    expect(await screen.findByText('invoiced')).toBeTruthy();
    expect(screen.getByText('Already invoiced · the invoice carries the amount due')).toBeTruthy();
    expect(
      screen.getByText('These goods have been invoiced. The invoice is the document to collect against; the stock was not deducted a second time.')
    ).toBeTruthy();
    expect(screen.queryByText('Convert to invoice')).toBeNull();
    expect(screen.queryByText('Cancel challan')).toBeNull();
    // A billed challan can still be sent as the delivery record.
    expect(screen.getByText('PDF')).toBeTruthy();
  });

  it('reports the stock going back once cancelled, and drops every action', async () => {
    renderDetail({ documentStatus: 'cancelled', stockEffect: { products: 1, quantity: 2, reversed: true } });
    expect(await screen.findByText('cancelled')).toBeTruthy();
    expect(screen.getByText('Cancelled · the goods went back into stock')).toBeTruthy();
    expect(screen.getByText('2 units returned to stock')).toBeTruthy();
    expect(screen.queryByText('PDF')).toBeNull();
    expect(screen.queryByText('WhatsApp')).toBeNull();
    expect(screen.queryByText('Convert to invoice')).toBeNull();
    expect(screen.queryByText('Cancel challan')).toBeNull();
  });

  it('handles a counter delivery with no customer account, no notes and long text', async () => {
    const longName = 'Shri Balaji Hardware & Sanitary Suppliers Private Limited, Nashik Branch';
    renderDetail({
      customer: null,
      customerSnapshot: { name: longName, address: 'Plot 14, MIDC Industrial Estate, Ambad, Nashik, Maharashtra 422010' } as any,
      notes: '',
      items: [
        { _id: 'it-1', name: 'Heavy duty galvanised steel pipe, 40mm, 6m length', quantity: 12, price: 500, total: 6000 },
        { _id: 'it-2', name: 'Elbow joint', quantity: 40, unit: 'nos', price: 25, total: 1000 },
        { _id: 'it-3', name: 'Pipe clamp', quantity: 100, unit: 'nos', price: 8, total: 800 }
      ] as any
    });
    expect(await screen.findByText('Counter delivery · no customer account')).toBeTruthy();
    expect(screen.getByText(longName)).toBeTruthy();
    expect(screen.getByText('Plot 14, MIDC Industrial Estate, Ambad, Nashik, Maharashtra 422010')).toBeTruthy();
    expect(screen.getByText('Heavy duty galvanised steel pipe, 40mm, 6m length')).toBeTruthy();
    // No unit recorded, so the quantity stands alone rather than inventing one.
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('100 nos')).toBeTruthy();
    expect(screen.queryByText('NOTES')).toBeNull();
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });

  it('links an invoiced challan to the invoice the server resolved, and never invents one', async () => {
    const { navigation } = renderDetail({
      documentStatus: 'void',
      linkedInvoice: { id: 'inv-9', invoiceNumber: 'INV-2026-27-0011' }
    });
    expect(await screen.findByText('Invoiced · INV-2026-27-0011')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View invoice INV-2026-27-0011'));
    expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-9' });

    // No resolvable invoice means no link at all rather than a broken one.
    screen.unmount();
    renderDetail({ documentStatus: 'void', linkedInvoice: null });
    expect(await screen.findByText('invoiced')).toBeTruthy();
    expect(screen.queryByText('INVOICE')).toBeNull();
  });
});
