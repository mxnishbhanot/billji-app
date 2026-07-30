import { Linking } from 'react-native';
import { openSequentially, overdueLabel } from '../reminderActions';
import { PendingReminder, PreparedReminder } from '@/types';

const reminder = (invoiceId: string): PreparedReminder => ({
  invoiceId,
  invoiceNumber: `INV-${invoiceId}`,
  customerId: null,
  customerName: 'Ramesh',
  phone: '9876543210',
  countryCode: '+91',
  total: 1000,
  balanceDue: 1000,
  dueDate: null,
  daysOverdue: 12,
  reason: 'overdue',
  message: 'pay up',
  pdfUrl: 'https://billji.test/a.pdf',
  whatsappUrl: `https://wa.me/919876543210?text=${invoiceId}`
});

const row = (overrides: Partial<PendingReminder>): PendingReminder => ({ ...reminder('1'), ...overrides });

// Linking.openURL is already a jest.fn from the RN preset, so spyOn reuses one shared
// spy across tests — clear the call log explicitly or counts leak between them.
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// delayMs: 0 skips the inter-chat pause; the pause itself is cosmetic, the ordering
// and the stop-on-failure behaviour are what matter.
const noDelay = { delayMs: 0 };

test('opens every chat in turn and reports how many were opened', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  const opened = await openSequentially([reminder('a'), reminder('b'), reminder('c')], noDelay);

  expect(opened).toBe(3);
  expect(openURL).toHaveBeenCalledTimes(3);
  expect(openURL).toHaveBeenNthCalledWith(2, 'https://wa.me/919876543210?text=b');
});

test('stops at the first failure instead of erroring once per customer', async () => {
  // No WhatsApp installed: the first openURL rejects and every later one would too.
  const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no activity found'));

  const opened = await openSequentially([reminder('a'), reminder('b')], noDelay);

  expect(opened).toBe(0);
  expect(openURL).toHaveBeenCalledTimes(1);
});

test('labels overdue and aged-pending invoices differently', () => {
  expect(overdueLabel(row({ reason: 'overdue', daysOverdue: 18 }))).toBe('18d overdue');
  expect(overdueLabel(row({ reason: 'overdue', daysOverdue: 0 }))).toBe('Due today');
  expect(overdueLabel(row({ reason: 'pending', daysOverdue: 9 }))).toBe('Pending 9d');
});
