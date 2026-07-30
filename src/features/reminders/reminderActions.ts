import { Linking } from 'react-native';
import { PendingReminder, PreparedReminder } from '@/types';

// Gap between chats: WhatsApp needs a moment to foreground before the next intent,
// and the user has to come back to the app in between anyway.
const CHAT_SWITCH_DELAY_MS = 900;

export const overdueLabel = (row: PendingReminder) => {
  if (row.reason === 'pending') return `Pending ${row.daysOverdue}d`;
  return row.daysOverdue === 0 ? 'Due today' : `${row.daysOverdue}d overdue`;
};

/**
 * Opens one WhatsApp chat per reminder, in turn, and returns how many actually opened.
 *
 * Sequential because WhatsApp shows a single chat at a time. Stops at the first failure:
 * the realistic cause is WhatsApp not being installed, and that would otherwise raise the
 * same error once per selected customer.
 */
export const openSequentially = async (reminders: PreparedReminder[], { delayMs = CHAT_SWITCH_DELAY_MS } = {}) => {
  let opened = 0;

  for (const reminder of reminders) {
    try {
      await Linking.openURL(reminder.whatsappUrl);
      opened += 1;
    } catch {
      break;
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return opened;
};
