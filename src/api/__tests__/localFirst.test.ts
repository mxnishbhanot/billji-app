import { DatabaseError } from '@/db';
import { useAuthStore } from '@/store/authStore';
import { localFirst } from '../localFirst';

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    isDatabaseAvailable: jest.fn(() => true),
    hasLocalData: jest.fn(async () => true)
  };
});

const db = jest.requireMock('@/db') as {
  isDatabaseAvailable: jest.Mock;
  hasLocalData: jest.Mock;
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
