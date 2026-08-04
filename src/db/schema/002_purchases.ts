import type { Migration } from '../migrations';

/**
 * Purchase bills: the inward side of the ledger, and the last list a shop needs at the
 * godown gate — where the signal is worst and the delivery is happening anyway.
 *
 * Same envelope as every other synced table (see 001_initial for what the columns mean) and
 * the same promotion rule: only what a screen filters or sorts by becomes a column. The
 * vendor is referenced from both sides, local and server, exactly as an invoice references
 * its customer — a bill can be received against a supplier this device added minutes ago
 * and has not synced yet.
 *
 * The money columns are the server's arithmetic once the bill has synced. Before that they
 * hold the device's provisional sum, which the list needs in order to show anything at all;
 * the authoritative figures — GST split, discount, bill number — are computed on the server
 * and arrive with the pull. See conflictResolver.SERVER_OWNED.
 */
const SQL = `
CREATE TABLE IF NOT EXISTS purchases (
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
  bill_number TEXT,
  vendor_bill_number TEXT,
  vendor_local_id TEXT,
  vendor_server_id TEXT,
  vendor_name TEXT,
  date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  balance_due REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
);
-- The bill list: filtered by status, sorted newest first, keyset-paged on (date, local_id).
CREATE INDEX IF NOT EXISTS idx_purchases_list ON purchases (business_id, status, date DESC, local_id DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases (business_id, vendor_server_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_unpaid ON purchases (business_id, payment_status, date DESC)
  WHERE payment_status IN ('unpaid', 'partial');
CREATE INDEX IF NOT EXISTS idx_purchases_number ON purchases (business_id, bill_number);
CREATE INDEX IF NOT EXISTS idx_purchases_cursor ON purchases (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_purchases_pending ON purchases (business_id, sync_state)
  WHERE sync_state <> 'synced';
`;

export const purchasesSchema: Migration = {
  version: 2,
  name: 'purchases',
  up: async (db) => {
    await db.execAsync(SQL);
  }
};
