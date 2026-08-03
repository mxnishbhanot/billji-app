import { Platform } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { getOrCreateDbEncryptionKey, pragmaKeySql } from '@/db/encryptionKey';
import { DocumentType, DraftDocument } from '@/types';

const DATABASE_NAME = 'billji-drafts.db';
const SCHEMA_VERSION = 1;
export const DRAFT_SCHEMA_VERSION = 1;

// Table name is historical (invoice drafts shipped first) — it now stores every
// documentType, discriminated by the documentType column. Renaming it would drop
// drafts already saved on devices.
const TABLE = 'invoice_drafts';

type DraftRow = {
  localDraftId: string;
  serverDraftId: string | null;
  businessId: string | null;
  documentType: string;
  schemaVersion: number;
  payload: string;
  dirty: number;
  lastEditedAt: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Local persistence is best-effort: expo-sqlite is unavailable on web without the
// wasm/COEP setup, so every operation fails soft and the builders fall back to
// server-side draft sync instead of crashing draft hydration.
let dbPromise: Promise<SQLiteDatabase | null> | null = null;
let unavailabilityWarned = false;

const warnUnavailable = (error: unknown) => {
  if (unavailabilityWarned) return;
  unavailabilityWarned = true;
  console.warn('[draftStore] Local draft store unavailable; relying on server draft sync only.', error);
};

const database = async () => {
  // expo-sqlite needs wasm + COEP/COOP setup on web (and can hang instead of
  // rejecting without it), so skip local persistence there entirely.
  if (Platform.OS === 'web') {
    warnUnavailable('expo-sqlite is not configured for web');
    return null;
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const key = await getOrCreateDbEncryptionKey();
        const db = await openDatabaseAsync(DATABASE_NAME);
        await db.execAsync(pragmaKeySql(key));
        await db.execAsync(`
          PRAGMA user_version = ${SCHEMA_VERSION};
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            localDraftId TEXT PRIMARY KEY NOT NULL,
            serverDraftId TEXT,
            businessId TEXT,
            documentType TEXT NOT NULL,
            schemaVersion INTEGER NOT NULL,
            payload TEXT NOT NULL,
            dirty INTEGER NOT NULL,
            lastEditedAt TEXT NOT NULL,
            lastSyncedAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_invoice_drafts_business_type_edited
            ON ${TABLE} (businessId, documentType, lastEditedAt DESC);
        `);
        // Mirror the server's 30-day TTL: prune abandoned drafts on first open
        // (ISO-8601 strings compare correctly lexicographically).
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.runAsync(`DELETE FROM ${TABLE} WHERE lastEditedAt < ?`, cutoff);
        return db;
      } catch (error) {
        warnUnavailable(error);
        return null;
      }
    })();
  }
  return dbPromise;
};

/** Logout / business-switch: drop the drafts file so the next account sees nothing. */
export const resetDraftDatabase = async () => {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    const db = await pending.catch(() => null);
    await db?.closeAsync().catch(() => undefined);
  }
  if (Platform.OS === 'web') return;
  await deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
};

const rowToDraft = <TPayload,>(row: DraftRow): DraftDocument<TPayload> => ({
  localDraftId: row.localDraftId,
  serverDraftId: row.serverDraftId,
  businessId: row.businessId,
  documentType: row.documentType as DocumentType,
  schemaVersion: row.schemaVersion,
  payload: JSON.parse(row.payload) as TPayload,
  dirty: Boolean(row.dirty),
  lastEditedAt: row.lastEditedAt,
  lastSyncedAt: row.lastSyncedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const getLatestDraft = async <TPayload,>(documentType: DocumentType, businessId?: string | null) => {
  const db = await database();
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<DraftRow>(
      `
        SELECT * FROM ${TABLE}
        WHERE documentType = ? AND (businessId = ? OR businessId IS NULL)
        ORDER BY lastEditedAt DESC
        LIMIT 1
      `,
      documentType,
      businessId || null
    );
    return row ? rowToDraft<TPayload>(row) : null;
  } catch (error) {
    warnUnavailable(error);
    return null;
  }
};

/** Returns true when the draft was persisted locally, false when the store is unavailable. */
export const saveDraft = async <TPayload,>(draft: DraftDocument<TPayload>) => {
  const db = await database();
  if (!db) return false;
  const now = new Date().toISOString();
  try {
    await db.runAsync(
      `
        INSERT INTO ${TABLE} (
          localDraftId, serverDraftId, businessId, documentType, schemaVersion, payload,
          dirty, lastEditedAt, lastSyncedAt, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(localDraftId) DO UPDATE SET
          serverDraftId = excluded.serverDraftId,
          businessId = excluded.businessId,
          documentType = excluded.documentType,
          schemaVersion = excluded.schemaVersion,
          payload = excluded.payload,
          dirty = excluded.dirty,
          lastEditedAt = excluded.lastEditedAt,
          lastSyncedAt = excluded.lastSyncedAt,
          updatedAt = excluded.updatedAt
      `,
      draft.localDraftId,
      draft.serverDraftId || null,
      draft.businessId || null,
      draft.documentType,
      draft.schemaVersion,
      JSON.stringify(draft.payload),
      draft.dirty ? 1 : 0,
      draft.lastEditedAt,
      draft.lastSyncedAt || null,
      draft.createdAt || now,
      now
    );
    return true;
  } catch (error) {
    warnUnavailable(error);
    return false;
  }
};

export const deleteDraft = async (localDraftId: string) => {
  const db = await database();
  if (!db) return;
  try {
    await db.runAsync(`DELETE FROM ${TABLE} WHERE localDraftId = ?`, localDraftId);
  } catch (error) {
    warnUnavailable(error);
  }
};

export const createDraftId = (documentType: DocumentType) =>
  `${documentType}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
