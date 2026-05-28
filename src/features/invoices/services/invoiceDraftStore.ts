import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { DraftDocument, InvoiceDraftPayload } from '@/types';

const DATABASE_NAME = 'billji-drafts.db';
const SCHEMA_VERSION = 1;
export const INVOICE_DRAFT_SCHEMA_VERSION = 1;

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

let dbPromise: Promise<SQLiteDatabase> | null = null;

const database = async () => {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DATABASE_NAME);
  }
  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA user_version = ${SCHEMA_VERSION};
    CREATE TABLE IF NOT EXISTS invoice_drafts (
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
      ON invoice_drafts (businessId, documentType, lastEditedAt DESC);
  `);
  return db;
};

const rowToDraft = (row: DraftRow): DraftDocument<InvoiceDraftPayload> => ({
  localDraftId: row.localDraftId,
  serverDraftId: row.serverDraftId,
  businessId: row.businessId,
  documentType: row.documentType as DraftDocument<InvoiceDraftPayload>['documentType'],
  schemaVersion: row.schemaVersion,
  payload: JSON.parse(row.payload) as InvoiceDraftPayload,
  dirty: Boolean(row.dirty),
  lastEditedAt: row.lastEditedAt,
  lastSyncedAt: row.lastSyncedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const getLatestInvoiceDraft = async (businessId?: string | null) => {
  const db = await database();
  const row = await db.getFirstAsync<DraftRow>(
    `
      SELECT * FROM invoice_drafts
      WHERE documentType = 'invoice' AND (businessId = ? OR businessId IS NULL)
      ORDER BY lastEditedAt DESC
      LIMIT 1
    `,
    businessId || null
  );
  return row ? rowToDraft(row) : null;
};

export const saveInvoiceDraft = async (draft: DraftDocument<InvoiceDraftPayload>) => {
  const db = await database();
  const now = new Date().toISOString();
  await db.runAsync(
    `
      INSERT INTO invoice_drafts (
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
};

export const deleteInvoiceDraft = async (localDraftId: string) => {
  const db = await database();
  await db.runAsync('DELETE FROM invoice_drafts WHERE localDraftId = ?', localDraftId);
};

export const createInvoiceDraftId = () => `invoice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
