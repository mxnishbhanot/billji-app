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

  // Permissions decide what is SEEN, ownership decides what is SPENT, and neither may be read from
  // the other. An admin holds every billing permission and still must not see a purchase control.
  describe('billing', () => {
    it('separates seeing billing from spending on it', () => {
      setUser({
        roleKey: 'admin',
        permissions: ['billing.view', 'billing.invoices', 'billing.manage'],
        subscription: { canManageBilling: false }
      });
      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('billing.manage')).toBe(true);
      expect(result.current.canManageBilling).toBe(false);
    });

    it('does not let the owner fail-open reach a money decision', () => {
      // A legacy session with no roleKey is treated as an owner for permissions — deliberately —
      // but that fallback must never authorise a charge.
      setUser({ permissions: [] });
      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('billing.manage')).toBe(true);
      expect(result.current.canManageBilling).toBe(false);
    });

    it('gives the owner both', () => {
      setUser({ roleKey: 'owner', permissions: [], subscription: { canManageBilling: true } });
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canManageBilling).toBe(true);
    });

    it('shows a viewer the plan but not the invoices', () => {
      setUser({ roleKey: 'viewer', permissions: ['billing.view'], subscription: { canManageBilling: false } });
      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('billing.view')).toBe(true);
      expect(result.current.can('billing.invoices')).toBe(false);
      expect(result.current.canManageBilling).toBe(false);
    });
  });
});
