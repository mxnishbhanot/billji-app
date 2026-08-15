/**
 * "Generate & Receive": the opt-in second action on the invoice builder, and the one-shot
 * intent it hands to the invoice detail screen.
 *
 * What is worth pinning here is only the new wiring — which action sets the intent, that the
 * same create path serves both, and that the sheet opens exactly once per arrival. The payment
 * itself (idempotency, offline queueing, allocation) is the existing flow and is covered by
 * api/__tests__/paymentIdempotency.test.ts and sync/__tests__/offlinePayments.test.ts.
 */
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Invoice } from '@/types';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn(async () => undefined) }));

// Icon fonts pull in the whole expo-font/asset chain; these screens are tested for behaviour.
jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/components/AppDialog', () => ({ useAppDialog: () => ({ showDialog: jest.fn() }) }));
jest.mock('@/components/AppToast', () => ({ useAppToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));

// ---------------------------------------------------------------- detail screen

jest.mock('@/api/endpoints', () => ({
  invoicesApi: { get: jest.fn() },
  paymentsApi: { list: jest.fn(async () => []), customerOutstanding: jest.fn(async () => ({ invoices: [], totalOutstanding: 0 })) }
}));
jest.mock('@/services/pdf', () => ({ openOrSharePdf: jest.fn() }));
jest.mock('@/features/onboarding', () => ({
  ANCHOR: { shareInvoice: 'shareInvoice' },
  TourAnchor: ({ children }: { children: React.ReactNode }) => children,
  useOnboardingOptional: () => null
}));
jest.mock('@/components/PaymentHistorySheet', () => ({ PaymentHistorySheet: () => null }));
jest.mock('@/components/RecordPaymentSheet', () => {
  const { Text: RNText } = require('react-native');
  return {
    RecordPaymentSheet: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
      visible ? <RNText testID="payment-sheet" onPress={onClose}>sheet</RNText> : null
  };
});

import { InvoiceDetailScreen } from '@/screens/InvoiceDetailScreen';
import { invoicesApi } from '@/api/endpoints';

const INVOICE = {
  _id: 'inv-1',
  invoiceNumber: 'INV-1',
  date: '2026-01-01',
  customer: null,
  customerSnapshot: { name: 'Walk-in customer' },
  items: [{ name: 'Item', quantity: 1, price: 1500, total: 1500 }],
  subtotal: 1500,
  discount: { type: 'flat', value: 0, amount: 0 },
  tax: { rate: 0, amount: 0 },
  total: 1500,
  paidAmount: 0,
  balanceDue: 1500,
  status: 'sent',
  paymentStatus: 'unpaid'
} as unknown as Invoice;

const renderDetail = (params: { id: string; openRecordPayment?: boolean }) => {
  const setParams = jest.fn();
  const navigation = { setParams, navigate: jest.fn(), goBack: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider>
      <InvoiceDetailScreen route={{ params } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation, client };
};

describe('InvoiceDetail record-payment intent', () => {
  beforeEach(() => {
    (invoicesApi.get as jest.Mock).mockReset();
    (invoicesApi.get as jest.Mock).mockResolvedValue(INVOICE);
  });

  it('does not open the payment sheet without the intent (plain Generate invoice)', async () => {
    renderDetail({ id: 'inv-1' });
    await screen.findByText('INV-1');
    expect(screen.queryByTestId('payment-sheet')).toBeNull();
  });

  it('opens the payment sheet once when the intent is set, and clears the param', async () => {
    const { navigation } = renderDetail({ id: 'inv-1', openRecordPayment: true });
    await screen.findByTestId('payment-sheet');
    expect(navigation.setParams).toHaveBeenCalledWith({ openRecordPayment: undefined });
  });

  it('waits for the invoice before opening', async () => {
    let resolveInvoice: (invoice: Invoice) => void = () => undefined;
    (invoicesApi.get as jest.Mock).mockReturnValue(new Promise<Invoice>((resolve) => { resolveInvoice = resolve; }));

    renderDetail({ id: 'inv-1', openRecordPayment: true });
    expect(screen.queryByTestId('payment-sheet')).toBeNull();

    await act(async () => { resolveInvoice(INVOICE); });
    await screen.findByTestId('payment-sheet');
  });

  it('does not reopen after dismissal, a refetch, or a re-render', async () => {
    const { client, rerender, navigation } = renderDetail({ id: 'inv-1', openRecordPayment: true });
    const sheet = await screen.findByTestId('payment-sheet');

    fireEvent.press(sheet); // dismiss
    await waitFor(() => expect(screen.queryByTestId('payment-sheet')).toBeNull());

    await act(async () => { await client.refetchQueries(); });
    rerender(
      <QueryClientProvider client={client}>
        <PaperProvider>
        <InvoiceDetailScreen route={{ params: { id: 'inv-1', openRecordPayment: true } } as any} navigation={navigation as any} />
        </PaperProvider>
      </QueryClientProvider>
    );

    expect(screen.queryByTestId('payment-sheet')).toBeNull();
  });
});

// ---------------------------------------------------------------- builder screen

const mockBuilder = {
  activeCustomer: null,
  addCustomer: { isPending: false, mutate: jest.fn() },
  applyPrefillInvoice: jest.fn(),
  addCustomItem: jest.fn(),
  addProduct: jest.fn(),
  addScannedProduct: jest.fn(),
  createInvoice: jest.fn(),
  createInvoiceMutation: { isPending: false },
  customerModal: false,
  customerPicker: false,
  customerSearch: '',
  customers: [],
  customersQuery: {},
  customModal: false,
  discardRecoveryDraft: jest.fn(),
  dismissRecoveryDraft: jest.fn(),
  duplicateDraft: jest.fn(),
  continueWithOversell: jest.fn(),
  discountType: 'flat',
  discountValue: '0',
  hasDraftContent: false,
  isDraftDirty: false,
  isGenerating: false,
  items: [],
  notes: '',
  productSearch: '',
  products: [],
  productsQuery: {},
  recoveryDraft: null,
  removeItem: jest.fn(),
  resumeDraft: jest.fn(),
  selectCustomer: jest.fn(),
  setCustomerModal: jest.fn(),
  setCustomerPicker: jest.fn(),
  setCustomerSearch: jest.fn(),
  setCustomModal: jest.fn(),
  setDiscountType: jest.fn(),
  setDiscountValue: jest.fn(),
  setNotes: jest.fn(),
  setPrice: jest.fn(),
  setProductSearch: jest.fn(),
  setQuantity: jest.fn(),
  setStockWarning: jest.fn(),
  setTaxRate: jest.fn(),
  stockWarning: null,
  paywall: null,
  dismissPaywall: jest.fn(),
  taxRate: '0',
  totals: { subtotal: 0, discount: 0, tax: 0, total: 0 },
  updateQuantity: jest.fn(),
  buildPayload: jest.fn()
};
let mockCapturedOnCreated: (invoice: Invoice) => void = () => undefined;

jest.mock('@/features/invoices/hooks/useInvoiceBuilder', () => ({
  useInvoiceBuilder: (options: { onCreated: (invoice: Invoice) => void }) => {
    mockCapturedOnCreated = options.onCreated;
    return mockBuilder;
  }
}));
jest.mock('@/features/invoices/components/InvoiceBuilderParts', () => ({
  CustomerSelectorCard: () => null,
  DraftSyncIndicator: () => null,
  InvoiceBuilderDialogs: () => null,
  InvoiceItemsEditor: () => null,
  ProductPickerList: () => null,
  TotalsExtrasCard: () => null
}));
jest.mock('@/components/BarcodeScannerSheet', () => ({ BarcodeScannerSheet: () => null }));
jest.mock('@/components/UpgradeSheet', () => ({ UpgradeSheet: () => null }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/shared/hooks/useEntitlements', () => ({ useEntitlements: () => ({ usage: () => null }) }));

import { InvoiceBuilderScreen } from '@/screens/InvoiceBuilderScreen';

const renderBuilder = (params?: { documentType?: string }) => {
  const navigation = { replace: jest.fn(), navigate: jest.fn(), addListener: jest.fn(() => jest.fn()), dispatch: jest.fn(), isFocused: () => true };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaperProvider>
      <InvoiceBuilderScreen route={{ params } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return navigation;
};

describe('InvoiceBuilder generate actions', () => {
  beforeEach(() => mockBuilder.createInvoice.mockReset());

  it('Generate invoice navigates without the payment intent', async () => {
    const navigation = renderBuilder();
    fireEvent.press(screen.getByText(/Generate invoice/));
    expect(mockBuilder.createInvoice).toHaveBeenCalledTimes(1);

    act(() => mockCapturedOnCreated(INVOICE));
    expect(navigation.replace).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-1' });
  });

  it('Generate & Receive uses the same create path and carries the intent', () => {
    const navigation = renderBuilder();
    fireEvent.press(screen.getByTestId('generate-and-receive'));
    expect(mockBuilder.createInvoice).toHaveBeenCalledTimes(1);

    act(() => mockCapturedOnCreated(INVOICE));
    expect(navigation.replace).toHaveBeenCalledWith('InvoiceDetail', { id: 'inv-1', openRecordPayment: true });
  });

  it('is not offered for non-payable documents', () => {
    renderBuilder({ documentType: 'quotation' });
    expect(screen.queryByTestId('generate-and-receive')).toBeNull();
  });

  it('is disabled while a create is in flight, so rapid taps cannot create two invoices', () => {
    mockBuilder.isGenerating = true;
    try {
      renderBuilder();
      const button = screen.getByTestId('generate-and-receive');
      fireEvent.press(button);
      fireEvent.press(button);
      expect(mockBuilder.createInvoice).not.toHaveBeenCalled();
    } finally {
      mockBuilder.isGenerating = false;
    }
  });
});
