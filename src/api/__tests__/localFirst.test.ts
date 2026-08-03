import { DatabaseError, LocalRuleError } from '@/db';
import { useAuthStore } from '@/store/authStore';
import {
  isLocalWriteFailedError,
  localFirst,
  localWrite,
  LocalWriteFailedError
} from '../localFirst';

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    isDatabaseAvailable: jest.fn(() => true),
    hasLocalData: jest.fn(async () => true)
  };
});

jest.mock('@/sync/syncStatus', () => ({
  refreshSyncCounts: jest.fn(async () => undefined),
  reportLocalWriteFailure: jest.fn()
}));

const db = jest.requireMock('@/db') as {
  isDatabaseAvailable: jest.Mock;
  hasLocalData: jest.Mock;
};

const syncStatus = jest.requireMock('@/sync/syncStatus') as {
  refreshSyncCounts: jest.Mock;
  reportLocalWriteFailure: jest.Mock;
};

const signedIn = (businessId: string | null) =>
  useAuthStore.setState({ user: businessId ? ({ businessId } as never) : null });

const local = jest.fn(async () => 'local');
const remote = jest.fn(async () => 'remote');

beforeEach(() => {
  jest.clearAllMocks();
  db.isDatabaseAvailable.mockReturnValue(true);
  db.hasLocalData.mockResolvedValue(true);
  signedIn('biz-1');
});

describe('localFirst', () => {
  it('reads locally when the collection is synced and the query is supported', async () => {
    await expect(localFirst({ entity: 'products' }, local, remote)).resolves.toBe('local');
    expect(local).toHaveBeenCalledWith('biz-1');
    expect(remote).not.toHaveBeenCalled();
  });

  it('goes to the network when the query needs something the device does not hold', async () => {
    await expect(localFirst({ entity: 'products', supported: false }, local, remote)).resolves.toBe('remote');
    expect(local).not.toHaveBeenCalled();
  });

  it('goes to the network before the collection has been synced', async () => {
    db.hasLocalData.mockResolvedValue(false);
    await expect(localFirst({ entity: 'invoices' }, local, remote)).resolves.toBe('remote');
  });

  it('goes to the network where there is no local database at all', async () => {
    db.isDatabaseAvailable.mockReturnValue(false);
    await expect(localFirst({ entity: 'invoices' }, local, remote)).resolves.toBe('remote');
    expect(db.hasLocalData).not.toHaveBeenCalled();
  });

  it('goes to the network when no business is selected', async () => {
    signedIn(null);
    await expect(localFirst({ entity: 'customers' }, local, remote)).resolves.toBe('remote');
  });

  it('falls back rather than failing a screen when the local read throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = jest.fn(async () => {
      throw new DatabaseError('DB_QUERY_FAILED', 'no such table');
    });

    await expect(localFirst({ entity: 'payments' }, broken, remote)).resolves.toBe('remote');
    expect(remote).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('localWrite', () => {
  it('writes locally when SQLite and a business are available', async () => {
    await expect(localWrite(local, remote)).resolves.toBe('local');
    expect(remote).not.toHaveBeenCalled();
  });

  it('uses the network when there is no local database (web path)', async () => {
    db.isDatabaseAvailable.mockReturnValue(false);
    await expect(localWrite(local, remote)).resolves.toBe('remote');
    expect(local).not.toHaveBeenCalled();
  });

  it('uses the network when no business is selected', async () => {
    signedIn(null);
    await expect(localWrite(local, remote)).resolves.toBe('remote');
    expect(local).not.toHaveBeenCalled();
  });

  it('rethrows domain refusals without calling the network', async () => {
    const refused = jest.fn(async () => {
      throw new LocalRuleError('INSUFFICIENT_STOCK', 'Not enough stock');
    });
    await expect(localWrite(refused, remote)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(remote).not.toHaveBeenCalled();
  });

  it('falls back when the platform reports DB_UNAVAILABLE inside the local attempt', async () => {
    const unavailable = jest.fn(async () => {
      throw new DatabaseError('DB_UNAVAILABLE', 'no sqlite');
    });
    await expect(localWrite(unavailable, remote)).resolves.toBe('remote');
    expect(remote).toHaveBeenCalled();
  });

  it('fails closed when a local write may have committed — never calls remote', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let committed = false;
    const afterCommit = jest.fn(async () => {
      committed = true;
      throw new DatabaseError('DB_QUERY_FAILED', 'disk I/O error after commit');
    });

    await expect(localWrite(afterCommit, remote)).rejects.toBeInstanceOf(LocalWriteFailedError);
    expect(committed).toBe(true);
    expect(remote).not.toHaveBeenCalled();
    expect(syncStatus.reportLocalWriteFailure).toHaveBeenCalled();
    expect(syncStatus.refreshSyncCounts).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('fails closed when a mapper throws after the transaction', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mapperBoom = jest.fn(async () => {
      throw new TypeError('Cannot read properties of undefined (reading _id)');
    });

    const error = await localWrite(mapperBoom, remote).catch((err) => err);
    expect(isLocalWriteFailedError(error)).toBe(true);
    expect(error).toBeInstanceOf(LocalWriteFailedError);
    expect(remote).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('prevents duplicate creates by refusing network fallback after any local attempt', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const creates: string[] = [];
    const localCreate = jest.fn(async () => {
      creates.push('local');
      throw new Error('enqueue failed after row insert');
    });
    const remoteCreate = jest.fn(async () => {
      creates.push('remote');
      return 'remote-doc';
    });

    await expect(localWrite(localCreate, remoteCreate)).rejects.toBeInstanceOf(LocalWriteFailedError);
    expect(creates).toEqual(['local']);
    expect(remoteCreate).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
