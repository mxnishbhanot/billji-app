import type { EntityType } from './mappers';

/**
 * What changed in SQLite, announced to whoever cares. The database is now the source the
 * screens read from (see readModel), so a write has to say so — nothing else can tell React
 * Query that a list it is showing is stale.
 *
 * Two properties make this useful rather than a refetch-everything hammer:
 *
 *  1. events carry the identity and the changed fields, so a subscriber can invalidate the
 *     one detail query that is affected instead of a whole entity;
 *  2. events raised inside a transaction are held until it commits. A rolled-back write
 *     announces nothing, and a 200-record pull page emits one flush, not 200.
 */

export type ChangeType = 'created' | 'updated' | 'deleted';

export type ChangeEvent = {
  entity: EntityType;
  type: ChangeType;
  localId: string;
  serverId?: string | null;
  /** Fields the write touched, when known. Absent means "assume all of them". */
  fields?: string[];
  /** Foreign keys the change is visible through — a payment moves an invoice's balance. */
  related?: { entity: EntityType; id: string }[];
  /** Where the change came from. A pull is server truth; a local edit is not yet. */
  origin: 'local' | 'sync';
};

type Listener = (events: ChangeEvent[]) => void;

const listeners = new Set<Listener>();

// Non-null while a transaction is open: events collect here and flush on commit.
let buffer: ChangeEvent[] | null = null;
let depth = 0;

export const subscribeToChanges = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const publish = (events: ChangeEvent[]) => {
  if (!events.length) return;
  for (const listener of listeners) {
    try {
      listener(events);
    } catch (error) {
      // A subscriber that throws must not roll back a write that already committed.
      console.warn('[changeBus] listener failed', error);
    }
  }
};

/** Announces a change. Inside a transaction it is held until the outermost one commits. */
export const emitChange = (event: ChangeEvent) => {
  if (buffer) buffer.push(event);
  else publish([event]);
};

/**
 * Runs `task` with change events buffered. Only the outermost call publishes, and only if the
 * task succeeds — a subscriber must never react to a write that was rolled back.
 */
export const withBufferedChanges = async <T>(task: () => Promise<T>): Promise<T> => {
  if (depth === 0) buffer = [];
  depth += 1;

  try {
    const result = await task();
    depth -= 1;
    if (depth === 0) {
      const events = buffer ?? [];
      buffer = null;
      publish(events);
    }
    return result;
  } catch (error) {
    depth -= 1;
    if (depth === 0) buffer = null;
    throw error;
  }
};

/** Test seam: drops any buffered events and every subscriber. */
export const resetChangeBus = () => {
  listeners.clear();
  buffer = null;
  depth = 0;
};
