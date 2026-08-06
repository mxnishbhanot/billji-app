import {
  hasLocalData,
  isDatabaseAvailable,
  isDatabaseUnavailable,
  isLocalRuleError,
  isUnsupportedOperation,
  type EntityType
} from '@/db';
import { useAuthStore } from '@/store/authStore';
import { refreshSyncCounts, reportLocalWriteFailure } from '@/sync/syncStatus';

/**
 * The read switch. React Query's queryFn no longer decides where data comes from — this does,
 * per read:
 *
 *   React Query -> endpoints -> localFirst -> read model -> SQLite   (and the sync engine
 *                                          \-> axios                  fills SQLite)
 *
 * Nothing above this line changed: the endpoint functions keep their names, arguments and
 * response shapes, so every screen, hook and query key is untouched.
 *
 * Four reasons a read still goes to the network, and all of them are deliberate:
 *
 *  1. no local database (web, where expo-sqlite is alpha) — the app is online-first there;
 *  2. no signed-in business yet, so there is no tenant to scope a local query to;
 *  3. the collection has not been synced, so a local answer would be an empty list rather
 *     than the truth;
 *  4. the query needs something the device does not hold — a sales aggregate, a ledger-derived
 *     status. Answering those locally would mean answering them wrongly.
 *
 * A local read that throws also falls through to the network. The local store is an
 * optimisation; it is never allowed to be the reason a screen fails.
 */

export const activeBusinessId = () => useAuthStore.getState().user?.businessId ?? null;

export type LocalFirstOptions = {
  /** The table that must hold data for the local read to be trustworthy. */
  entity: EntityType;
  /** False when the query needs something only the server can compute. */
  supported?: boolean;
};

/**
 * A local write that may already have committed. Never retried against the network — that
 * path is how offline creates get duplicated. The user is pointed at Sync Issues / Retry.
 */
export class LocalWriteFailedError extends Error {
  readonly code = 'LOCAL_WRITE_FAILED' as const;

  constructor(
    message = 'Could not finish saving on this device. Check Sync Issues, then try again.',
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'LocalWriteFailedError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export const isLocalWriteFailedError = (error: unknown): error is LocalWriteFailedError =>
  error instanceof LocalWriteFailedError;

const surfaceLocalWriteFailure = async (error: unknown) => {
  try {
    reportLocalWriteFailure((error as Error)?.message ?? 'Local save failed');
    await refreshSyncCounts();
  } catch {
    // Badge projection is best-effort; the thrown LocalWriteFailedError is the user path.
  }
};

/**
 * The write switch. Same rule as a read, one consequence more: a local write is the record —
 * it commits to SQLite and queues its own push, so the mutation returns without a network
 * call and the sync engine catches up later.
 *
 * The network path is taken only when there is no local store (web) or no business to scope
 * by — never as a fallback after a local attempt that may already have committed. Fail closed.
 */
export const localWrite = async <T>(local: (businessId: string) => Promise<T>, remote: () => Promise<T>): Promise<T> => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable()) return remote();

  try {
    return await local(businessId);
  } catch (error) {
    // Platform has no SQLite at all — there was no local attempt with side effects.
    if (isDatabaseUnavailable(error)) return remote();
    // The queue refused to carry this operation, and refused it *inside* the write transaction, so
    // nothing was committed. Same situation as a platform without SQLite: send it online. This is
    // the honest version of what used to happen — the write was accepted locally and then quietly
    // discarded by the push engine, which no user could see and no error reported.
    if (isUnsupportedOperation(error)) return remote();
    // Domain refusal (oversell, overpayment): same answer online; never invent a document.
    if (isLocalRuleError(error)) throw error;
    if (isLocalWriteFailedError(error)) throw error;

    console.warn('[localWrite] local write failed; not falling back to network', error);
    await surfaceLocalWriteFailure(error);
    throw new LocalWriteFailedError(undefined, { cause: error });
  }
};

export const localFirst = async <T>(
  { entity, supported = true }: LocalFirstOptions,
  local: (businessId: string) => Promise<T>,
  remote: () => Promise<T>
): Promise<T> => {
  const businessId = activeBusinessId();
  if (!supported || !businessId || !isDatabaseAvailable()) return remote();

  try {
    if (!(await hasLocalData(entity, businessId))) return remote();
    return await local(businessId);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return remote();
    // A corrupt or locked local store must degrade to online, not to a broken screen.
    console.warn(`[localFirst] ${entity} read fell back to the network`, error);
    return remote();
  }
};
