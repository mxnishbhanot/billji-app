import { Platform } from 'react-native';
import { getDeviceSeries, saveDeviceSeries, seedSequence, type DeviceSeries } from '../db/invoiceNumbering';
import { countOperations } from '../db/outbox';
import { getSetting, setSetting } from '../db/settings';
import { uuidv7 } from '../db/mappers';
import { syncApi } from '../api/endpoints';

/**
 * Getting this device its own invoice numbering series.
 *
 * Registration is a one-time online step, but the call is repeated on every sync for one
 * specific reason: device 1 shares the business's existing sequence with the web app, so the
 * reply is also how the device learns that fifteen invoices were issued online while it was
 * away. Without that re-seed it would confidently reissue numbers that are already on
 * customers' invoices — and a duplicate GST number is an integrity incident, not a bug.
 *
 * Offline is not a failure here. A device that already holds a series keeps issuing from it;
 * one that does not simply cannot bill offline yet, and invoice creation stays online until
 * it can (see endpoints.invoicesApi.create). Inventing a series locally is the one thing that
 * must never happen: two devices guessing the same segment write the same numbers.
 */

export const DEVICE_ID_KEY = 'sync.deviceId';

/** Stable for the life of the install, and the X-Device-Id every sync request carries. */
export const getDeviceId = async (): Promise<string> => {
  const existing = await getSetting(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = uuidv7();
  await setSetting(DEVICE_ID_KEY, deviceId);
  return deviceId;
};

const platform = (): 'android' | 'ios' | 'web' =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

/**
 * Registers if needed, re-seeds the local counter, and hands back the device id for the sync
 * headers. Never throws: a failed registration means "carry on with what is already stored".
 */
export const ensureDeviceSeries = async (
  businessId: string
): Promise<{ deviceId: string; series: DeviceSeries | null }> => {
  const deviceId = await getDeviceId();
  const stored = await getDeviceSeries();

  try {
    const series = await syncApi.registerDevice({ deviceId, platform: platform() });

    // A number the device has already put on an invoice is not negotiable, so the counter
    // only ever moves forward — seedSequence takes the higher of the two.
    if (series.currentSequence != null) {
      const pendingInvoices = await countOperations({
        businessId,
        entityType: 'invoices',
        status: ['pending', 'inflight', 'failed', 'conflict']
      });
      await seedSequence(series.documentType, series.financialYear, series.currentSequence);
      if (pendingInvoices > 0 && series.deviceIndex === 1) {
        // The shared series moved while this device was holding unsent invoices, so the
        // numbers it has already issued may now be taken. The push will report those as
        // conflicts; nothing is silently renumbered.
        console.warn('[deviceSeries] shared series advanced with invoices still queued');
      }
    }

    const next: DeviceSeries = {
      deviceId,
      deviceIndex: series.deviceIndex,
      prefix: series.prefix,
      documentType: series.documentType
    };
    await saveDeviceSeries(next);
    return { deviceId, series: next };
  } catch (error) {
    console.warn('[deviceSeries] could not confirm the numbering series', error);
    return { deviceId, series: stored };
  }
};
