import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { UNIT_PRESETS, UnitPreset, isPresetUnit } from '@/constants/units';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

// Unit-of-measure picker. Presets are grouped by measurement type into tabs
// (Count, Weight, Volume…) so each unit can show a readable label next to its
// short code — tapping a single-letter chip like "g" or "l" was easy to misread,
// the tabbed cards spell out "Gram" / "Litre". A "Custom" tab reveals a free-text
// field for anything not in the presets. Value is a plain string for
// react-hook-form / watch+setValue.
type UnitCategory = UnitPreset['category'];
type TabKey = UnitCategory | 'custom';

const CATEGORY_TABS: { key: UnitCategory; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'count', label: 'Count', icon: 'hash' },
  { key: 'weight', label: 'Weight', icon: 'feather' },
  { key: 'volume', label: 'Volume', icon: 'droplet' },
  { key: 'length', label: 'Length', icon: 'maximize-2' },
  { key: 'area', label: 'Area', icon: 'square' },
  { key: 'time', label: 'Time', icon: 'clock' }
];

const presetCategory = (value: string): UnitCategory | null =>
  UNIT_PRESETS.find((u) => u.value === value)?.category ?? null;

export function UnitInput({
  value,
  onChange,
  cardBorder,
  inputBackground,
  label = 'Unit of measure'
}: {
  value: string;
  onChange: (value: string) => void;
  cardBorder: string;
  inputBackground: string;
  label?: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const isCustomValue = !!value && !isPresetUnit(value);
  // Default the open tab to the group of the current value (or Count for a fresh
  // form / Custom when editing a saved custom unit).
  const [tab, setTab] = useState<TabKey>(() => (isCustomValue ? 'custom' : presetCategory(value) ?? 'count'));

  const unitsByCategory = useMemo(() => {
    const map = {} as Record<UnitCategory, UnitPreset[]>;
    for (const unit of UNIT_PRESETS) (map[unit.category] ||= []).push(unit);
    return map;
  }, []);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    ...CATEGORY_TABS,
    { key: 'custom', label: 'Custom', icon: 'edit-3' }
  ];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.26 : 0.14) : 'transparent',
                  borderColor: active ? alpha(theme.colors.primary, isDark ? 0.55 : 0.4) : isDark ? colors.border : alpha(colors.primaryStrong, 0.16)
                }
              ]}
            >
              <Feather name={item.icon} size={13} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
              <Text style={[styles.tabLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'custom' ? (
        <TextInput
          mode="outlined"
          placeholder="e.g. dozen, roll, set, pair"
          value={isCustomValue ? value : ''}
          onChangeText={onChange}
          maxLength={24}
          autoCapitalize="none"
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          textColor={theme.colors.onSurface}
          outlineStyle={{ borderRadius: radii.input }}
          style={[styles.customInput, { backgroundColor: inputBackground }]}
        />
      ) : (
        <View style={styles.optionGrid}>
          {(unitsByCategory[tab as UnitCategory] ?? []).map((unit) => {
            const active = value === unit.value;
            return (
              <Pressable
                key={unit.value}
                onPress={() => onChange(unit.value)}
                style={[
                  styles.option,
                  {
                    backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.24 : 0.12) : isDark ? colors.surface : alpha(colors.primary, 0.04),
                    borderColor: active ? alpha(theme.colors.primary, isDark ? 0.6 : 0.45) : isDark ? colors.border : alpha(colors.primaryStrong, 0.14)
                  }
                ]}
              >
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{unit.label}</Text>
                  <Text style={[styles.optionCode, { color: theme.colors.onSurfaceVariant }]}>{unit.value}</Text>
                </View>
                {active ? <Feather name="check-circle" size={16} color={theme.colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: { ...fontStyles.medium, fontSize: 12, marginBottom: 10 },
  tabRow: { gap: 8, paddingRight: 4 },
  tab: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  tabLabel: { ...fontStyles.semiBold, fontSize: 12.5 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  option: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: '47%',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { ...fontStyles.semiBold, fontSize: 14 },
  optionCode: { ...fontStyles.medium, fontSize: 11, marginTop: 1 },
  customInput: { fontSize: 14, marginTop: 12 }
});
