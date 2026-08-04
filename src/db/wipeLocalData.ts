import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUERY_CACHE_KEY } from '@/query/persistence';
import { resetDraftDatabase } from '@/shared/drafts/draftStore';
import { sessionStorage } from '@/store/sessionStorage';
import { clearTrustedDeviceToken } from '@/store/trustedDevice';
import { countOperations } from './outbox';
import { isDatabaseAvailable, resetDatabase } from './connection';

/**
 * Secure teardown of every on-device store that belongs to the signed-in business.
 * Call on logout and business switch — after the user has confirmed discarding pending work.
 *
 * Keeps the SQLCipher key (install-scoped, not business data). Clears session-adjacent
 * SecureStore entries so the next account cannot inherit the previous tenant's offline books
 * or a remembered 2FA device token from that session boundary.
 */
export const pendingLocalSyncCount = async (businessId: string | null): Promise<number> => {
  if (!businessId || !isDatabaseAvailable()) return 0;
  try {
    return await countOperations({
      businessId,
      status: ['pending', 'inflight', 'failed', 'conflict']
    });
  } catch {
    return 0;
  }
};

export type WipeLocalOptions = {
  /** Logout only — drop session + trusted-device so the next account starts clean. */
  clearSecureSession?: boolean;
};

export const wipeLocalBusinessData = async (options: WipeLocalOptions = {}): Promise<void> => {
  if (isDatabaseAvailable()) {
    await resetDatabase().catch((error) => console.warn('[wipe] main database', error));
  }
  await resetDraftDatabase().catch((error) => console.warn('[wipe] drafts database', error));
  await AsyncStorage.removeItem(QUERY_CACHE_KEY).catch(() => undefined);

  if (options.clearSecureSession) {
    // Trusted-device must not survive into another account on a shared phone.
    await clearTrustedDeviceToken().catch(() => undefined);
    // Belt-and-braces: session must not outlive the wipe if logout ordering changes.
    await sessionStorage.deleteItemAsync('billji-auth-session').catch(() => undefined);
  }
};
