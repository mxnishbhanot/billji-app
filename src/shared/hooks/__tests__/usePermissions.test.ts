import { renderHook } from '@testing-library/react-native';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';

const setUser = (user: unknown) => {
  useAuthStore.setState({ user: user as never });
};

describe('usePermissions', () => {
  afterEach(() => setUser(null));

  it('allows everything for an owner regardless of permissions array', () => {
    setUser({ roleKey: 'owner', permissions: [] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('invoices.delete')).toBe(true);
  });

  it('treats a legacy session with no roleKey as owner (fail-open)', () => {
    setUser({ permissions: [] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('settings.manage')).toBe(true);
  });

  it('denies a non-owner with an empty permissions array (fail-closed)', () => {
    setUser({ roleKey: 'staff', permissions: [] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('invoices.view')).toBe(false);
  });

  it('honors the permissions list for a non-owner', () => {
    setUser({ roleKey: 'staff', permissions: ['invoices.view'] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('invoices.view')).toBe(true);
    expect(result.current.can('invoices.delete')).toBe(false);
  });
});
