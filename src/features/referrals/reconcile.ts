import { getLocalReferral, applyReferralLocally, isDatabaseAvailable } from '@/db';
import { refreshSyncCounts, requestSync } from '@/sync/syncStatus';
import { clearPendingReferralCode, readPendingReferralCode } from './pendingCode';
import type { SignupReferralResult } from '@/types';

/**
 * Turns a referral code the server has not accepted yet into a queued APPLY_REFERRAL operation.
 *
 * When this is needed, and why it is not the normal path: on a signup with a connection, the code
 * travels in the register body and the server has already granted the free month by the time the app
 * paints. This covers what is left —
 *
 *   - the code was typed while offline, so the signup itself had to wait and the code sat in
 *     AsyncStorage (see pendingCode);
 *   - the signup succeeded but the attach did not (the server treats a referral as non-fatal, so a
 *     mistyped code or a hiccup never fails a registration);
 *   - the app was killed between the two.
 *
 * From here on nothing is referral-specific: the outbox owns the retry, the dependency order and the
 * idempotency, and the reward arrives as a subscription through the normal pull.
 */

/** Reasons that will fail identically on every retry. Queuing them would be pointless noise. */
const PERMANENT_REASONS = new Set([
  'REFERRAL_CODE_INVALID',
  'REFERRAL_SELF',
  'REFERRAL_ALREADY_APPLIED',
  'REFERRAL_REWARD_ALREADY_RECEIVED',
  'REFERRAL_NOT_ELIGIBLE_PAID',
  'REFERRAL_LIMIT_REACHED'
]);

export const isRetryableReferralReason = (reason: string | null | undefined) =>
  Boolean(reason) && !PERMANENT_REASONS.has(String(reason));

/**
 * Called once a session and a business exist. Idempotent and cheap: with nothing pending it is a single
 * AsyncStorage read.
 */
export const reconcilePendingReferral = async ({
  businessId,
  signupResult = null
}: {
  businessId: string;
  /** The `referral` block from the signup response, when this runs right after one. */
  signupResult?: SignupReferralResult | null;
}): Promise<{ queued: boolean; code?: string }> => {
  // The server already applied it. Nothing to queue, and the stored code has done its job.
  if (signupResult?.applied) {
    await clearPendingReferralCode();
    return { queued: false };
  }

  if (signupResult && !isRetryableReferralReason(signupResult.reason)) {
    // A wrong code, a self-referral, an ineligible account: retrying would fail the same way for ever.
    await clearPendingReferralCode();
    return { queued: false };
  }

  const code = signupResult?.code ?? (await readPendingReferralCode());
  if (!code || !isDatabaseAvailable()) return { queued: false };

  // Already queued or already applied on this device — the outbox row (or the accepted row) is the
  // record, so a relaunch must not enqueue a second operation for the same code.
  const existing = await getLocalReferral(businessId);
  if (existing) {
    await clearPendingReferralCode();
    return { queued: false };
  }

  await applyReferralLocally({ businessId, code });
  await clearPendingReferralCode();
  await refreshSyncCounts();
  // Best effort, and through the funnel: this runs itself at launch, so it honours the same
  // automatic-sync switches every other unattended pass does. Offline it does nothing and the queue
  // keeps the intent.
  void requestSync('referral');

  return { queued: true, code };
};
