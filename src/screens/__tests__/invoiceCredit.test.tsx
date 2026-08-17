/**
 * The credit surfaces on the invoice detail screen: what an invoice reports when part of it
 * was settled by customer credit, and when the "Apply credit" action is offered at all.
 *
 * The application itself (FIFO, allocation rows, ledger) is the server's and is covered by
 * the backend suite; what is pinned here is that money and credit stay separate figures on
 * screen, and that credit is only offered when there is some to spend.
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
jest.mock('@/components/AppToast', () => ({ useAppToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/pdf', () => ({ openOrSharePdf: jest.fn() }));
jest.mock('@/features/onboarding', () => ({
  ANCHOR: { shareInvoice: 'shareInvoice' },
  TourAnchor: ({ children }: { children: React.ReactNode }) => children,
  useOnboardingOptional: () => null
}));
// Both sheets pull in the native keyboard controller, which has no binding under jest.
jest.mock('@/components/PaymentHistorySheet', () => ({ PaymentHistorySheet: () => null }));
jest.mock('@/components/ApplyCreditSheet', () => ({ ApplyCreditSheet: () => null }));
jest.mock('@/components/RecordPaymentSheet', () => ({ RecordPaymentSheet: () => null }));

jest.mock('@/api/endpoints', () => ({
  invoicesApi: { get: jest.fn() },
  paymentsApi: {
    list: jest.fn(async () => []),
    customerOutstanding: jest.fn(async () => ({ invoices: [], totalOutstanding: 0 })),
    customerCredits: jest.fn(async () => ({ credits: [], availableCredit: 0 }))
  }
}));

import { InvoiceDetailScreen } from '@/screens/InvoiceDetailScreen';
import { invoicesApi, paymentsApi } from '@/api/endpoints';

const INVOICE = {
  _id: 'inv-1',
  invoiceNumber: 'INV-1',
  date: '2026-01-01',
  customer: 'cust-1',
  customerSnapshot: { name: 'Anita Traders', phone: '9876543210' },
  items: [{ name: 'Rice', quantity: 2, price: 2500, total: 5000 }],
  subtotal: 5000,
  discount: { type: 'flat', value: 0, amount: 0 },
  tax: { rate: 0, amount: 0 },
  total: 5000,
  paidAmount: 0,
  creditApplied: 2000,
  balanceDue: 3000,
  status: 'pending',
  paymentStatus: 'partial'
} as unknown as Invoice;

const renderDetail = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaperProvider>
        <InvoiceDetailScreen
          route={{ params: { id: 'inv-1' } } as any}
          navigation={{ setParams: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as any}
        />
      </PaperProvider>
    </QueryClientProvider>
  );
};

describe('an invoice partly settled by customer credit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (invoicesApi.get as jest.Mock).mockResolvedValue(INVOICE);
    (paymentsApi.list as jest.Mock).mockResolvedValue([]);
    (paymentsApi.customerOutstanding as jest.Mock).mockResolvedValue({ invoices: [], totalOutstanding: 3000 });
    (paymentsApi.customerCredits as jest.Mock).mockResolvedValue({ credits: [], availableCredit: 0 });
  });

  it('reports credit separately from money received', async () => {
    renderDetail();

    expect(await screen.findByText('Credit applied')).toBeTruthy();
    expect(screen.getByText('₹2,000.00')).toBeTruthy();
    // "Paid" stays at zero: no money arrived, and saying otherwise would not tie to any receipt.
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('₹0.00')).toBeTruthy();
    expect(screen.getAllByText('₹3,000.00').length).toBeGreaterThan(0);
  });

  it('does not offer to apply credit when the customer holds none', async () => {
    renderDetail();

    await screen.findByText('Credit applied');
    expect(screen.queryByText(/Apply credit/)).toBeNull();
  });

  it('offers the customer credit it has, with the amount in the label', async () => {
    (paymentsApi.customerCredits as jest.Mock).mockResolvedValue({ credits: [], availableCredit: 1500 });
    renderDetail();

    await waitFor(() => expect(screen.getByText('Apply credit · ₹1,500.00 available')).toBeTruthy());
  });

  it('hides the credit row entirely when none was applied', async () => {
    (invoicesApi.get as jest.Mock).mockResolvedValue({ ...INVOICE, creditApplied: 0, balanceDue: 5000, paymentStatus: 'unpaid' });
    renderDetail();

    await screen.findByText('Paid');
    expect(screen.queryByText('Credit applied')).toBeNull();
  });
});
