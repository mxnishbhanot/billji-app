import { NOTIFICATION_MODULES, isModuleEnabled, isTypeEnabled, setModuleEnabled, setTypeEnabled } from '@/constants/notifications';
import { NotificationPreferences } from '@/types';

describe('notification preference helpers', () => {
  const stockModule = NOTIFICATION_MODULES.find((module) => module.key === 'stock')!;

  it('treats absent types and channels as enabled', () => {
    expect(isTypeEnabled(undefined, 'low-stock')).toBe(true);
    expect(isTypeEnabled({}, 'low-stock')).toBe(true);
    expect(isTypeEnabled({ 'low-stock': {} }, 'low-stock')).toBe(true);
    expect(isTypeEnabled({ 'low-stock': { push: false } }, 'low-stock')).toBe(true);
  });

  it('disables a type only when inApp is explicitly false', () => {
    expect(isTypeEnabled({ 'low-stock': { inApp: false } }, 'low-stock')).toBe(false);
    expect(isTypeEnabled({ 'low-stock': { inApp: true } }, 'low-stock')).toBe(true);
  });

  it('reports a module enabled only when every child type is enabled', () => {
    expect(isModuleEnabled({}, stockModule)).toBe(true);
    expect(isModuleEnabled({ 'low-stock': { inApp: false } }, stockModule)).toBe(false);
  });

  it('setTypeEnabled preserves other channels', () => {
    const prefs: NotificationPreferences = { 'low-stock': { push: false } };
    expect(setTypeEnabled(prefs, 'low-stock', false)).toEqual({ 'low-stock': { push: false, inApp: false } });
  });

  it('setModuleEnabled bulk-sets every child type', () => {
    const next = setModuleEnabled({}, stockModule, false);
    expect(next).toEqual({ 'low-stock': { inApp: false }, 'negative-stock': { inApp: false } });
    expect(isModuleEnabled(setModuleEnabled(next, stockModule, true), stockModule)).toBe(true);
  });
});
