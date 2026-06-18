import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, TextInput, useTheme } from 'react-native-paper';
import { UNIT_PRESETS, isPresetUnit } from '@/constants/units';
import { fontStyles, radii } from '@/theme/theme';

// Unit-of-measure picker: preset chips for the common cases (kg, ft, l…) plus a
// "Custom" chip that reveals a free-text field for anything else. Value is a plain
// string so it drops straight into react-hook-form or a watch/setValue dialog.
export function UnitInput({
  value,
  onChange,
  cardBorder,
  inputBackground,
  label = 'Unit'
}: {
  value: string;
  onChange: (value: string) => void;
  cardBorder: string;
  inputBackground: string;
  label?: string;
}) {
  const theme = useTheme();
  const [customMode, setCustomMode] = useState(false);
  // Show the text field when the user picked Custom, or when an existing value
  // isn't one of the presets (e.g. editing a product saved with "dozen").
  const showCustom = customMode || (!!value && !isPresetUnit(value));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.chips}>
        {UNIT_PRESETS.map((unit) => (
          <Chip
            key={unit.value}
            compact
            showSelectedOverlay
            selected={!showCustom && value === unit.value}
            onPress={() => { setCustomMode(false); onChange(unit.value); }}
            style={styles.chip}
          >
            {unit.value}
          </Chip>
        ))}
        <Chip
          compact
          icon="pencil"
          selected={showCustom}
          onPress={() => { setCustomMode(true); onChange(''); }}
          style={styles.chip}
        >
          Custom
        </Chip>
      </View>
      {showCustom ? (
        <TextInput
          mode="outlined"
          placeholder="e.g. dozen, roll, set"
          value={value}
          onChangeText={onChange}
          maxLength={24}
          autoCapitalize="none"
          outlineColor={cardBorder}
          outlineStyle={{ borderRadius: radii.input }}
          style={[styles.customInput, { backgroundColor: inputBackground }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { ...fontStyles.medium, fontSize: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  customInput: { fontSize: 14, marginTop: 8 }
});
