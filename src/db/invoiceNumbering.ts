import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseError } from './errors';
import { getSetting, setSetting } from './settings';

/**
 * The number an invoice carries when it is issued with no signal.
 *
 * A GST invoice number is a legal identifier: once the customer holds a copy — printed, or
 * on WhatsApp — it can never change. That rules out the intuitive design (a temporary
 * number swapped at sync) and leaves one option that is both offline-capable and
 * defensible: the device issues from its own series, allocated by the server once, at
 * registration.
 *
 * CGST Rule 46(b) caps the number at 16 characters, and today's format already spends all
 * 16 (`INV-2026-27-0001`), so the device segment has to be paid for:
 *
 *   device 1   INV-2026-27-0001   unchanged — a single-device business sees nothing new
 *   device 2   INV-2627-D2-0001   compressed financial year buys the segment its 3 chars
 *
 * Both are complete, gapless, sequential series, which is what GST asks of each series
 * individually — it has always permitted a business to run several.
 *
 * The counter lives in `settings`, keyed by document type and financial year, and is read
 * and advanced inside the same transaction that writes the invoice. Nothing here talks to
 * the network: registration and re-seeding are sync/deviceSeries' job.
 */

export const DEVICE_SERIES_KEY = 'sync.deviceSeries';
export const GST_DOCUMENT_NUMBER_MAX_LENGTH = 16;
export const PRIMARY_DEVICE_INDEX = 1;
export const MAX_DEVICE_INDEX = 35;

export type DeviceSeries = {
  deviceId: string;
  /** 1 is the business's existing unsegmented series. */
  deviceIndex: number;
  prefix: string;
  documentType: string;
};

const sequenceKey = (documentType: string, financialYear: string) => `invoice.sequence.${documentType}.${financialYear}`;

/** April to March, matching the backend's financialYearFor exactly. */
export const financialYearFor = (date: Date | string = new Date()): string => {
  const value = date instanceof Date ? date : new Date(date);
  const at = Number.isNaN(value.getTime()) ? new Date() : value;
  const startYear = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

/** `2026-27` -> `2627`. */
export const compactFinancialYear = (financialYear: string): string => {
  const [start, end] = financialYear.split('-');
  return `${start.slice(-2)}${end}`;
};

/** 2 -> `D2`, 12 -> `DC`. Index 1 has no segment. */
export const deviceSegment = (deviceIndex: number): string => {
  if (deviceIndex === PRIMARY_DEVICE_INDEX) return '';
  if (!Number.isInteger(deviceIndex) || deviceIndex < 1 || deviceIndex > MAX_DEVICE_INDEX) {
    throw new DatabaseError('DB_QUERY_FAILED', `Device series index ${deviceIndex} is outside 1..${MAX_DEVICE_INDEX}`);
  }
  return `D${deviceIndex.toString(36).toUpperCase()}`;
};

const pad = (sequence: number) => String(sequence).padStart(4, '0');

/**
 * Renders one number. Throws rather than truncates if the business's prefix does not leave
 * room: a truncated serial number is a duplicate serial number, which is the worse failure.
 */
export const formatDocumentNumber = ({
  prefix,
  financialYear,
  deviceIndex = PRIMARY_DEVICE_INDEX,
  sequence
}: {
  prefix: string;
  financialYear: string;
  deviceIndex?: number;
  sequence: number;
}): string => {
  const documentNumber =
    deviceIndex === PRIMARY_DEVICE_INDEX
      ? `${prefix}-${financialYear}-${pad(sequence)}`
      : `${prefix}-${compactFinancialYear(financialYear)}-${deviceSegment(deviceIndex)}-${pad(sequence)}`;

  if (documentNumber.length > GST_DOCUMENT_NUMBER_MAX_LENGTH) {
    throw new DatabaseError(
      'DB_QUERY_FAILED',
      `Invoice number "${documentNumber}" is ${documentNumber.length} characters; GST allows ${GST_DOCUMENT_NUMBER_MAX_LENGTH}. Shorten the prefix in Settings.`
    );
  }

  return documentNumber;
};

// -- The device's series ------------------------------------------------------------------

export const getDeviceSeries = async (txn?: SQLiteDatabase): Promise<DeviceSeries | null> => {
  const stored = await getSetting(DEVICE_SERIES_KEY, txn);
  if (!stored) return null;
  try {
    const series = JSON.parse(stored) as DeviceSeries;
    return series?.deviceId && series.deviceIndex ? series : null;
  } catch {
    return null;
  }
};

export const saveDeviceSeries = (series: DeviceSeries, options: { txn?: SQLiteDatabase; now?: string } = {}) =>
  setSetting(DEVICE_SERIES_KEY, JSON.stringify(series), options);

/** True once the server has allocated a series — until then, invoices are created online. */
export const canIssueDocumentsLocally = async (txn?: SQLiteDatabase): Promise<boolean> =>
  (await getDeviceSeries(txn)) !== null;

export const readSequence = async (
  documentType: string,
  financialYear: string,
  txn?: SQLiteDatabase
): Promise<number> => Number((await getSetting(sequenceKey(documentType, financialYear), txn)) ?? 0) || 0;

/**
 * Moves the local counter forward to at least `sequence`, never backwards.
 *
 * Device 1 shares the business's existing sequence with the web app, so every sync re-seeds
 * from the server: without it, a fortnight of online invoicing would leave the device about
 * to reissue numbers that are already on customers' invoices.
 */
export const seedSequence = async (
  documentType: string,
  financialYear: string,
  sequence: number,
  options: { txn?: SQLiteDatabase; now?: string } = {}
): Promise<number> => {
  const current = await readSequence(documentType, financialYear, options.txn);
  const next = Math.max(current, Number(sequence) || 0);
  if (next !== current) await setSetting(sequenceKey(documentType, financialYear), String(next), options);
  return next;
};

/**
 * Takes the next number in this device's series and burns the position.
 *
 * Call it inside the transaction that writes the invoice. Allocating outside would leave a
 * gap whenever the write rolls back, and a gap in a GST series is something the business has
 * to explain at audit.
 */
export const allocateDocumentNumber = async (options: {
  documentType?: string;
  date?: string | Date;
  txn?: SQLiteDatabase;
  now?: string;
}): Promise<{ documentNumber: string; financialYear: string; sequence: number; deviceIndex: number } | null> => {
  const series = await getDeviceSeries(options.txn);
  if (!series) return null;

  const documentType = options.documentType ?? series.documentType ?? 'invoice';
  const financialYear = financialYearFor(options.date ?? new Date());
  const sequence = (await readSequence(documentType, financialYear, options.txn)) + 1;

  // Rendering before the counter moves: an unrenderable number (over-long prefix) must not
  // consume a position in the series.
  const documentNumber = formatDocumentNumber({
    prefix: series.prefix,
    financialYear,
    deviceIndex: series.deviceIndex,
    sequence
  });

  await setSetting(sequenceKey(documentType, financialYear), String(sequence), {
    txn: options.txn,
    now: options.now
  });

  return { documentNumber, financialYear, sequence, deviceIndex: series.deviceIndex };
};
