import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A referral code the user typed before the server had a chance to accept it.
 *
 * Why this exists at all: signing up is the one thing in BillJi that CANNOT happen offline — the
 * account, the business and the tokens are all minted by the server. So a code entered on the signup
 * screen with no connection has nowhere to go yet, and the outbox cannot hold it either (every outbox
 * row is scoped to a business id that does not exist).
 *
 * So it waits here, on the device, until there is a session. Then reconcilePendingReferral() turns it
 * into a normal APPLY_REFERRAL outbox operation and the existing sync engine takes over.
 *
 * Not SecureStore: a referral code is not a credential — it is printed on marketing material.
 */

export const PENDING_REFERRAL_KEY = 'billji.referral.pending.v1';

export const savePendingReferralCode = async (code: string) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  await AsyncStorage.setItem(PENDING_REFERRAL_KEY, normalized);
};

export const readPendingReferralCode = async (): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    return value ? value.trim().toUpperCase() : null;
  } catch {
    // A code we cannot read is a code the user can retype. Never fail a signup over it.
    return null;
  }
};

export const clearPendingReferralCode = () => AsyncStorage.removeItem(PENDING_REFERRAL_KEY).catch(() => undefined);
