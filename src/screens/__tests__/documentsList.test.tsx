/**
 * Documents list presentation rules. The list, conversion and cancellation all belong to the
 * server; what is pinned here is what the screen decides on its own — that each tab shows its
 * own document type, that the three types stay distinguishable (a quotation states how long
 * its price holds, a challan what left the shelf, a credit note why it was given), that the
 * status word matches the stored lifecycle, and that a state only offers the actions the API
 * accepts for it.
 */
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { darkTheme, lightTheme } from '@/theme/theme';
import { Invoice, SalesDocumentKind } from '@/types';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn(async () => undefined) }));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children, headerAction }: { children: React.ReactNode; headerAction?: React.ReactNode }) => (
    <View>{headerAction}{children}</View>
  ) };
});
jest.mock('@/components/AppDialog', () => ({ useAppDialog: () => ({ showDialog: jest.fn() }) }));
jest.mock('@/components/AppToast', () => ({ useAppToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/pdf', () => ({ openOrSharePdf: jest.fn(async () => undefined) }));
jest.mock('@/api/endpoints', () => ({
  documentsApi: { list: jest.fn(), convert: jest.fn(), cancel: jest.fn() }
}));
const mockDenied = new Set<string>();
jest.mock('@/shared/hooks/usePermissions', () => ({
  PERMISSION: { invoicesCreate: 'invoices.create', invoicesUpdate: 'invoices.update' },
  usePermissions: () => ({ can: (permission: string) => !mockDenied.has(permission) })
}));

import { DocumentsScreen } from '@/screens/DocumentsScreen';
import { documentsApi } from '@/api/endpoints';

const dayOffset = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const base = {
  _id: 'doc-1',
  date: '2026-08-15',
  customerSnapshot: { name: 'Manish', phone: '9876543210' },
  items: [{ _id: 'it-1', name: 'Steel pipe', quantity: 3, unit: 'pcs', price: 400, total: 1200 }],
  subtotal: 1000,
  total: 1000,
  status: 'pending',
  documentStatus: 'issued',
  pdfUrl: 'https://example.test/doc-1.pdf'
} as unknown as Invoice;

const QUOTATION = { ...base, documentNumber: 'QTN-2026-27-0001', documentType: 'quotation', validUntil: dayOffset(14) } as Invoice;
const CHALLAN = { ...base, _id: 'dc-1', documentNumber: 'DC-2026-27-0001', documentType: 'delivery_challan' } as Invoice;
const CREDIT_NOTE = {
  ...base,
  _id: 'cn-1',
  documentNumber: 'CN-2026-27-0001',
  documentType: 'credit_note',
  reason: 'Two pipes returned damaged'
} as Invoice;

const listByKind = (rows: Partial<Record<SalesDocumentKind, Invoice[]>>) => {
  (documentsApi.list as jest.Mock).mockImplementation(async (kind: SalesDocumentKind) => rows[kind] ?? []);
};

const renderList = (theme: typeof lightTheme | typeof darkTheme = lightTheme) => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider theme={theme}>
        <DocumentsScreen route={{ params: {} } as never} navigation={navigation as never} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation };
};

describe('DocumentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDenied.clear();
  });

  it('withholds cancel from a member who cannot update invoices, as the detail screen does', async () => {
    mockDenied.add('invoices.update');
    listByKind({ quotation: [QUOTATION] });
    renderList();

    expect(await screen.findByText('QTN-2026-27-0001')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    expect(screen.getByLabelText('Convert to invoice')).toBeTruthy();
  });

  it('opens on quotations and states how long the price holds', async () => {
    listByKind({ quotation: [QUOTATION] });
    renderList();

    expect(await screen.findByText('QTN-2026-27-0001')).toBeTruthy();
    expect(screen.getByText('Manish · 15 Aug 2026')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText(/Valid until/)).toBeTruthy();
    expect(documentsApi.list).toHaveBeenCalledWith('quotation');
  });

  it('shows a lapsed quote as expired without withdrawing the conversion the server still allows', async () => {
    listByKind({ quotation: [{ ...QUOTATION, validUntil: dayOffset(-3) }] });
    renderList();

    expect(await screen.findByText('Expired')).toBeTruthy();
    expect(screen.getByText(/Expired on/)).toBeTruthy();
    expect(screen.getByLabelText('Convert to invoice')).toBeTruthy();
  });

  it('switches to the challan tab and describes the goods, not a price validity', async () => {
    listByKind({ quotation: [QUOTATION], delivery_challan: [CHALLAN] });
    renderList();
    await screen.findByText('QTN-2026-27-0001');

    fireEvent.press(screen.getByText('Challans'));

    expect(await screen.findByText('DC-2026-27-0001')).toBeTruthy();
    expect(screen.getByText('1 item · 3 units delivered')).toBeTruthy();
    expect(screen.getByText('Issued')).toBeTruthy();
    expect(screen.queryByText('QTN-2026-27-0001')).toBeNull();
  });

  it('gives a credit note its reason and no conversion action', async () => {
    listByKind({ credit_note: [CREDIT_NOTE] });
    renderList();
    fireEvent.press(screen.getByText('Credit notes'));

    expect(await screen.findByText('CN-2026-27-0001')).toBeTruthy();
    expect(screen.getByText('Two pipes returned damaged')).toBeTruthy();
    expect(screen.queryByLabelText('Convert to invoice')).toBeNull();
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });

  it('offers no conversion or cancellation once a document is spent', async () => {
    listByKind({ quotation: [{ ...QUOTATION, documentStatus: 'void' }] });
    renderList();

    expect(await screen.findByText('Invoiced')).toBeTruthy();
    expect(screen.queryByLabelText('Convert to invoice')).toBeNull();
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });

  it('does not offer to send a cancelled document', async () => {
    listByKind({ quotation: [{ ...QUOTATION, documentStatus: 'cancelled' }] });
    renderList();

    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(screen.queryByLabelText('Send')).toBeNull();
    expect(screen.getByText('Cancelled · can no longer be invoiced')).toBeTruthy();
  });

  it('converts through the API of the tab in view', async () => {
    listByKind({ quotation: [QUOTATION] });
    (documentsApi.convert as jest.Mock).mockResolvedValue({ _id: 'inv-1', invoiceNumber: 'INV-1' });
    const { navigation } = renderList();
    fireEvent.press(await screen.findByLabelText('Convert to invoice'));

    await waitFor(() => expect(documentsApi.convert).toHaveBeenCalledWith('quotation', 'doc-1'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-1' }));
  });

  it('confirms before cancelling and cancels the row that was tapped', async () => {
    listByKind({ quotation: [QUOTATION] });
    (documentsApi.cancel as jest.Mock).mockResolvedValue({ ...QUOTATION, documentStatus: 'cancelled' });
    renderList();
    fireEvent.press(await screen.findByLabelText('Cancel'));

    expect(await screen.findByText('Cancel quotation?')).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel quotation'));
    await waitFor(() => expect(documentsApi.cancel).toHaveBeenCalledWith('quotation', 'doc-1'));
  });

  it('opens the type-specific detail screen', async () => {
    listByKind({ quotation: [QUOTATION] });
    const { navigation } = renderList();
    fireEvent.press(await screen.findByLabelText('View QTN-2026-27-0001'));
    expect(navigation.navigate).toHaveBeenCalledWith('QuotationDetail', { id: 'doc-1' });
  });

  it('narrows the list by number or customer and offers a way back', async () => {
    listByKind({ quotation: [QUOTATION, { ...QUOTATION, _id: 'doc-2', documentNumber: 'QTN-2026-27-0002', customerSnapshot: { name: 'Anita Traders' } as never }] });
    renderList();
    await screen.findByText('QTN-2026-27-0001');

    fireEvent.changeText(screen.getByLabelText('Search quotations'), 'anita');
    await waitFor(() => expect(screen.queryByText('QTN-2026-27-0001')).toBeNull());
    expect(screen.getByText('QTN-2026-27-0002')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search quotations'), 'nothing here');
    expect(await screen.findByText('No quotations match “nothing here”')).toBeTruthy();
    fireEvent.press(screen.getByText('Clear search'));
    expect(await screen.findByText('QTN-2026-27-0001')).toBeTruthy();
  });

  it('offers creation from the empty state of a type this screen can create', async () => {
    listByKind({});
    const { navigation } = renderList();

    expect(await screen.findByText('No quotations yet')).toBeTruthy();
    fireEvent.press(screen.getByText('New quotation'));
    expect(navigation.navigate).toHaveBeenCalledWith('InvoiceCreate', { documentType: 'quotation' });
  });

  it('never offers to create a credit note from here — it is raised from its invoice', async () => {
    listByKind({});
    renderList();
    fireEvent.press(screen.getByText('Credit notes'));

    expect(await screen.findByText('No credit notes yet')).toBeTruthy();
    expect(screen.queryByText('New credit note')).toBeNull();
  });

  it('renders the same content in dark mode, with long names and large amounts intact', async () => {
    listByKind({
      quotation: [
        {
          ...QUOTATION,
          documentNumber: 'QTN-2026-27-000123456',
          customerSnapshot: { name: 'Shree Balaji Steel & Hardware Traders Private Limited' } as never,
          total: 1234567.5
        }
      ]
    });
    renderList(darkTheme);

    expect(await screen.findByText('QTN-2026-27-000123456')).toBeTruthy();
    expect(screen.getByText(/Shree Balaji Steel/)).toBeTruthy();
    expect(screen.getByText('₹12,34,567.50')).toBeTruthy();
    expect(screen.getByLabelText('Convert to invoice')).toBeTruthy();
  });

  it('shows placeholder rows, not a bare spinner, while the first list loads', () => {
    (documentsApi.list as jest.Mock).mockImplementation(() => new Promise(() => undefined));
    renderList();
    expect(screen.getByLabelText('Loading documents')).toBeTruthy();
  });
});
