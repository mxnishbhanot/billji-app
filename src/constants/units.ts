// Single source of truth for unit-of-measure presets shown across the app
// (product form, custom-item dialog). Add a row here and it appears everywhere.
// `unit` is stored as a free string (backend caps it at 24 chars), so custom
// units typed by the user are always allowed — presets are UX convenience only.
export type UnitPreset = { value: string; label: string; category: 'count' | 'weight' | 'length' | 'volume' | 'area' | 'time' };

export const UNIT_PRESETS: readonly UnitPreset[] = [
  { value: 'pcs', label: 'Pieces', category: 'count' },
  { value: 'box', label: 'Box', category: 'count' },
  { value: 'kg', label: 'Kilogram', category: 'weight' },
  { value: 'g', label: 'Gram', category: 'weight' },
  { value: 'l', label: 'Litre', category: 'volume' },
  { value: 'ml', label: 'Millilitre', category: 'volume' },
  { value: 'm', label: 'Metre', category: 'length' },
  { value: 'cm', label: 'Centimetre', category: 'length' },
  { value: 'ft', label: 'Feet', category: 'length' },
  { value: 'sqft', label: 'Sq. feet', category: 'area' },
  { value: 'hr', label: 'Hour', category: 'time' },
  { value: 'day', label: 'Day', category: 'time' }
] as const;

export const DEFAULT_UNIT = 'pcs';

export const isPresetUnit = (value: string) => UNIT_PRESETS.some((u) => u.value === value);
