import { hasLocalData, isDatabaseAvailable, isDatabaseUnavailable, isLocalRuleError, type EntityType } from '@/db';
import { useAuthStore } from '@/store/authStore';

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
 * The write switch. Same rule as a read, one consequence more: a local write is the record —
 * it commits to SQLite and queues its own push, so the mutation returns without a network
 * call and the sync engine catches up later.
 *
 * The network path is not a fallback for a *failed* local write, it is the path taken when
 * there is no local store to write to (web) or no business to scope it by. A local write
 * that throws is rolled back whole, so retrying it against the server cannot duplicate it.
 */
export const localWrite = async <T>(local: (businessId: string) => Promise<T>, remote: () => Promise<T>): Promise<T> => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable()) return remote();

  try {
    return await local(businessId);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return remote();
    // A rule the server enforces too — not enough stock for the sale as billed. Retrying it
    // online would fail the same way, or succeed and produce a document nobody confirmed.
    if (isLocalRuleError(error)) throw error;
    console.warn('[localWrite] fell back to the network', error);
    return remote();
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
