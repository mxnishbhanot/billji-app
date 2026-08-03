import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  GST_DOCUMENT_NUMBER_MAX_LENGTH,
  MAX_DEVICE_INDEX,
  allocateDocumentNumber,
  canIssueDocumentsLocally,
  compactFinancialYear,
  deviceSegment,
  financialYearFor,
  formatDocumentNumber,
  readSequence,
  saveDeviceSeries,
  seedSequence
} from '../invoiceNumbering';
import { openTestDatabase } from './realSqlite';

/**
 * The numbering rules, which are the part of offline invoicing that produces legal artifacts.
 * The length assertion is the important one: CGST Rule 46(b) caps a serial number at 16
 * characters, and today's format already spends every one of them.
 */

const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const series = (deviceIndex: number, prefix = 'INV') =>
  saveDeviceSeries({ deviceId: 'dev-1', deviceIndex, prefix, documentType: 'invoice' }, { txn, now: T0 });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYearFor('2026-08-02T00:00:00.000Z')).toBe('2026-27');
    expect(financialYearFor('2026-03-31T00:00:00.000Z')).toBe('2025-26');
    expect(financialYearFor('2026-04-01T00:00:00.000Z')).toBe('2026-27');
  });

  it('compresses to four characters for the segmented format', () => {
    expect(compactFinancialYear('2026-27')).toBe('2627');
  });
});

describe('the number itself', () => {
  it('leaves device 1 on the format the business already uses', () => {
    expect(formatDocumentNumber({ prefix: 'INV', financialYear: '2026-27', deviceIndex: 1, sequence: 1 })).toBe(
      'INV-2026-27-0001'
    );
  });

  it('gives every other device its own series, inside the 16-character limit', () => {
    for (let index = 2; index <= MAX_DEVICE_INDEX; index += 1) {
      const documentNumber = formatDocumentNumber({
        prefix: 'INV',
        financialYear: '2026-27',
        deviceIndex: index,
        sequence: 9999
      });
      expect(documentNumber.length).toBeLessThanOrEqual(GST_DOCUMENT_NUMBER_MAX_LENGTH);
    }

    expect(formatDocumentNumber({ prefix: 'INV', financialYear: '2026-27', deviceIndex: 2, sequence: 1 })).toBe(
      'INV-2627-D2-0001'
    );
    // One base-36 character, so index 12 is 'C' rather than two digits.
    expect(deviceSegment(12)).toBe('DC');
  });

  it('refuses to issue a number a prefix has made too long', () => {
    // Truncating would produce a duplicate serial number, which is worse than a blocked bill.
    expect(() =>
      formatDocumentNumber({ prefix: 'LONGPREFIX', financialYear: '2026-27', deviceIndex: 2, sequence: 1 })
    ).toThrow(/16/);
  });

  it('refuses a device index outside the series space', () => {
    expect(() => deviceSegment(MAX_DEVICE_INDEX + 1)).toThrow(/outside/);
  });
});

describe('allocating from the local counter', () => {
  it('will not issue anything until the server has allocated a series', async () => {
    expect(await canIssueDocumentsLocally(txn)).toBe(false);
    expect(await allocateDocumentNumber({ txn, now: T0, date: T0 })).toBeNull();
  });

  it('counts up from one, gaplessly', async () => {
    await series(1);

    const first = await allocateDocumentNumber({ txn, now: T0, date: T0 });
    const second = await allocateDocumentNumber({ txn, now: T0, date: T0 });

    expect(first?.documentNumber).toBe('INV-2026-27-0001');
    expect(second?.documentNumber).toBe('INV-2026-27-0002');
    expect(await readSequence('invoice', '2026-27', txn)).toBe(2);
  });

  it('restarts at one in the new financial year, and leaves the old counter alone', async () => {
    await series(2);
    await allocateDocumentNumber({ txn, now: T0, date: '2026-03-31T00:00:00.000Z' });

    const next = await allocateDocumentNumber({ txn, now: T0, date: '2026-04-01T00:00:00.000Z' });

    expect(next?.documentNumber).toBe('INV-2627-D2-0001');
    expect(await readSequence('invoice', '2025-26', txn)).toBe(1);
  });

  it('takes the server position and never rewinds to it', async () => {
    await series(1);
    // Fifteen invoices were issued online while this device was away.
    await seedSequence('invoice', '2026-27', 15, { txn, now: T0 });
    expect((await allocateDocumentNumber({ txn, now: T0, date: T0 }))?.documentNumber).toBe('INV-2026-27-0016');

    // A stale reply must not hand a number back that is already on a customer's invoice.
    await seedSequence('invoice', '2026-27', 3, { txn, now: T0 });
    expect((await allocateDocumentNumber({ txn, now: T0, date: T0 }))?.documentNumber).toBe('INV-2026-27-0017');
  });

  it('does not consume a position when the number cannot be rendered', async () => {
    await series(2, 'TOOLONGPREFIX');

    await expect(allocateDocumentNumber({ txn, now: T0, date: T0 })).rejects.toThrow(/16/);
    expect(await readSequence('invoice', '2026-27', txn)).toBe(0);
  });
});
