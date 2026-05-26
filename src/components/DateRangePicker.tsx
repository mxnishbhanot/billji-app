import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Dialog, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { useState } from 'react';
import { radii, spacing, typeScale } from '@/theme/theme';
import { formatDate } from '@/utils/format';

export type DateRange = { from: string; to: string };

type Field = keyof DateRange;
type Props = {
  label?: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
  helperText?: string;
  style?: ViewStyle;
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value?: string) => {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

export function DateRangePicker({ label = 'Date range', value, onChange, helperText, style }: Props) {
  const theme = useTheme();
  const [activeField, setActiveField] = useState<Field | null>(null);
  const pickerDate = parseIsoDate(activeField ? value[activeField] : undefined);

  const updateField = (field: Field, date: Date) => {
    const next = { ...value, [field]: toIsoDate(date) };
    if (next.from && next.to && parseIsoDate(next.from) > parseIsoDate(next.to)) {
      if (field === 'from') next.to = next.from;
      else next.from = next.to;
    }
    onChange(next);
  };

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setActiveField(null);
    if (event.type === 'dismissed' || !date || !activeField) return;
    updateField(activeField, date);
  };

  const field = (name: Field, fieldLabel: string) => (
    <Pressable style={styles.field} onPress={() => setActiveField(name)}>
      <TextInput
        mode="outlined"
        label={fieldLabel}
        value={value[name] ? formatDate(value[name]) : ''}
        placeholder="Pick date"
        editable={false}
        showSoftInputOnFocus={false}
        right={<TextInput.Icon icon={({ size, color }) => <Feather name="calendar" size={size} color={color} />} onPress={() => setActiveField(name)} />}
        outlineStyle={styles.inputOutline}
        style={{ backgroundColor: theme.colors.elevation.level1 }}
        pointerEvents="none"
      />
    </Pressable>
  );

  return (
    <View style={[styles.root, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="labelLarge" style={styles.label}>{label}</Text>
          {helperText ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{helperText}</Text> : null}
        </View>
        {value.from || value.to ? <Button compact onPress={() => onChange({ from: '', to: '' })}>Clear</Button> : null}
      </View>
      <View style={styles.row}>
        {field('from', 'From')}
        {field('to', 'To')}
      </View>
      {Platform.OS === 'ios' ? (
        <Portal>
          <Dialog visible={Boolean(activeField)} onDismiss={() => setActiveField(null)}>
            <Dialog.Title>{activeField === 'from' ? 'Choose start date' : 'Choose end date'}</Dialog.Title>
            <Dialog.Content>
              {activeField ? <DateTimePicker value={pickerDate} mode="date" display="inline" onChange={onPickerChange} /> : null}
            </Dialog.Content>
            <Dialog.Actions><Button onPress={() => setActiveField(null)}>Done</Button></Dialog.Actions>
          </Dialog>
        </Portal>
      ) : activeField ? (
        <DateTimePicker value={pickerDate} mode="date" display="default" onChange={onPickerChange} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  inputOutline: { borderRadius: radii.input },
  label: typeScale.bodyPrimaryMedium,
  root: { gap: 2 },
  row: { flexDirection: 'row', gap: spacing.gridGap }
});
