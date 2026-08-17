/**
 * Order detail presentation rules. The business logic (generate-invoice, cancel eligibility)
 * lives on the server and is unchanged by the visual migration — what is worth pinning here
 * is the presentation decision the screen makes on its own: an order is not a receivable, so
 * the payment view only appears once a linked invoice stands behind those numbers.
 */
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Order } from '@/types';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn(async () => undefined) }));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/components/AppDialog', () => ({ useAppDialog: () => ({ showDialog: jest.fn() }) }));
jest.mock('@/api/endpoints', () => ({ ordersApi: { get: jest.fn() } }));
jest.mock('@/shared/hooks/usePermissions', () => ({
  PERMISSION: { ordersManage: 'orders.manage' },
  usePermissions: () => ({ can: () => true })
}));

import { OrderDetailScreen } from '@/screens/OrderDetailScreen';
import { ordersApi } from '@/api/endpoints';

const ORDER = {
  _id: 'ord-1',
  orderNumber: 'ORD-1',
  date: '2026-01-01',
  customer: 'cus-1',
  customerSnapshot: { name: 'Anita Traders', phone: '9876543210', countryCode: '+91' },
  items: [{ name: 'Steel pipe', quantity: 2, price: 500, total: 1000 }],
  subtotal: 1000,
  discount: { type: 'flat', value: 0, amount: 0 },
  tax: { rate: 0, amount: 0 },
  total: 1000,
  orderStatus: 'draft',
  fulfillmentStatus: 'pending',
  paymentStatus: 'unpaid',
  paidAmount: 0,
  balanceDue: 1000,
  linkedInvoice: null
} as unknown as Order;

const renderDetail = () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PaperProvider>
        <OrderDetailScreen route={{ params: { id: 'ord-1' } } as any} navigation={navigation as any} />
      </PaperProvider>
    </QueryClientProvider>
  );
  return { ...view, navigation };
};

describe('OrderDetail presentation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hides the payment view on an order that has not been invoiced', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(ORDER);
    renderDetail();

    await waitFor(() => expect(screen.getByText('ORD-1')).toBeTruthy());
    // The order total is what the document is worth, not what is owed. It reads twice:
    // once as the hero label, once as the summary's closing line.
    expect(screen.getAllByText('Order total')).toHaveLength(2);
    expect(screen.getByText('Not yet invoiced')).toBeTruthy();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByText('PAYMENT')).toBeNull();
  });

  it('shows the payment view, sourced from the invoice, once one exists', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue({
      ...ORDER,
      orderStatus: 'confirmed',
      paymentStatus: 'partial',
      paidAmount: 400,
      balanceDue: 600,
      linkedInvoice: { id: 'inv-9', invoiceNumber: 'INV-9', status: 'pending' }
    });
    renderDetail();

    await waitFor(() => expect(screen.getByText('PAYMENT')).toBeTruthy());
    expect(screen.getByText('Balance due')).toBeTruthy();
    expect(screen.getByText('Invoiced as INV-9')).toBeTruthy();
    // Generate invoice is spent once the order has produced one; cancel is blocked server-side too.
    expect(screen.queryByText('Generate invoice')).toBeNull();
    expect(screen.queryByText('Cancel order')).toBeNull();
  });

  it('offers generate and cancel only while the order is open', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(ORDER);
    renderDetail();

    await waitFor(() => expect(screen.getByText('Generate invoice')).toBeTruthy());
    expect(screen.getByText('Cancel order')).toBeTruthy();
  });

  it('withdraws both actions from a cancelled order', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue({ ...ORDER, orderStatus: 'cancelled' });
    renderDetail();

    await waitFor(() => expect(screen.getByText('Cancelled · no invoice was issued')).toBeTruthy());
    expect(screen.queryByText('Generate invoice')).toBeNull();
    expect(screen.queryByText('Cancel order')).toBeNull();
  });
});
