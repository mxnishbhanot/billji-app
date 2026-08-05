import type { Migration } from '../migrations';

/**
 * The local record of a referral code this device applied.
 *
 * Deliberately NOT a mirror of the server's Referral collection — referrals are not a synced
 * collection, and this device never pulls them. It holds exactly one thing: the code the user entered
 * and how far its APPLY_REFERRAL operation has got, so the outbox has a row to point at, pushAck has a
 * table to write the server id back into, and the Sync Inspector has something to show.
 *
 * Everything that matters about a referral — whether the code is valid, whether the user is eligible,
 * whether a free month was granted — lives on the server and is never decided here. `status` is what
 * the server last told us, `sync_state` is where the operation is in the queue; the two are different
 * questions and the reward is a third (it arrives as a subscription, through the normal billing read).
 *
 * Same envelope as every other local table (see 001_initial), including `payload` and `deleted_at`,
 * even though neither carries much here: keeping the envelope identical is what lets toRow, pushAck and
 * the change bus treat this table like any other instead of needing a referral-shaped special case.
 */
const SQL = `
CREATE TABLE IF NOT EXISTS referrals (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  business_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER,
  sync_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_state IN ('synced', 'pending', 'conflict', 'failed')),
  deleted_at TEXT,
  server_updated_at TEXT,
  local_updated_at TEXT NOT NULL,
  code TEXT NOT NULL,
  -- What the SERVER last said about this referral. Never decided here.
  status TEXT NOT NULL DEFAULT 'pending'
);
-- One applied code per business is the normal case, so this is a lookup, not a list scan.
CREATE INDEX IF NOT EXISTS idx_referrals_business ON referrals (business_id, local_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_pending ON referrals (business_id, sync_state)
  WHERE sync_state <> 'synced';
`;

export const referralsSchema: Migration = {
  version: 3,
  name: 'referrals',
  up: async (db) => {
    await db.execAsync(SQL);
  }
};
