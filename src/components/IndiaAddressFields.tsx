import { useEffect, useRef, useState } from 'react';
import { Control, Controller, FieldValues, Path, PathValue, UseFormSetValue, useWatch } from 'react-hook-form';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';
import {
  INDIAN_STATES,
  lookupPin,
  suggestedCitiesForState
} from '@/utils/indiaAddress';

const SUGGESTIONS_MAX_HEIGHT = 176;
const MAX_SUGGESTIONS = 40;

type Props<T extends FieldValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  stateName?: Path<T>;
  pinName?: Path<T>;
  cityName?: Path<T>;
  inputStyle?: object;
};

function filterSuggestions(options: readonly string[], query: string) {
  const q = query.trim().toLowerCase();
  return options
    .filter((option) => {
      const lower = option.toLowerCase();
      return lower !== q && (!q || lower.includes(q));
    })
    .sort((a, b) => {
      if (!q) return 0;
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, MAX_SUGGESTIONS);
}

function SuggestionList({
  items,
  onPick
}: {
  items: string[];
  onPick: (value: string) => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  if (!items.length) return null;

  return (
    <View style={[styles.suggestions, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.14) }]}>
      <ScrollView style={{ maxHeight: SUGGESTIONS_MAX_HEIGHT }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {items.map((item) => (
          <Pressable
            key={item}
            onPressIn={() => onPick(item)}
            style={({ pressed }) => [
              styles.suggestion,
              { backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.18 : 0.08) : 'transparent' }
            ]}
          >
            <Feather name="corner-down-left" size={13} color={theme.colors.onSurfaceVariant} />
            <Text numberOfLines={1} style={[styles.suggestionText, { color: theme.colors.onSurface }]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Address block ordered State → PIN → City.
 * PIN (6 digits) auto-fills state + city via free India Post API.
 * State shows a full state list; city shows major cities for that state (+ PIN hits).
 */
export function IndiaAddressFields<T extends FieldValues>({
  control,
  setValue,
  stateName = 'state' as Path<T>,
  pinName = 'pinCode' as Path<T>,
  cityName = 'city' as Path<T>,
  inputStyle
}: Props<T>) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const bg = isDark ? colors.surface : colors.card;

  const pinCode = String(useWatch({ control, name: pinName }) || '');
  const state = String(useWatch({ control, name: stateName }) || '');

  const [stateFocused, setStateFocused] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);
  const [pinCities, setPinCities] = useState<string[]>([]);
  const [pinStatus, setPinStatus] = useState<'idle' | 'loading' | 'ok' | 'miss'>('idle');
  const lookupSeq = useRef(0);
  // null until first watch — avoids overwriting a saved profile on open.
  const prevPin = useRef<string | null>(null);

  useEffect(() => {
    const pin = pinCode.trim();
    if (prevPin.current === null) {
      prevPin.current = pin;
      return;
    }
    if (pin === prevPin.current) return;
    prevPin.current = pin;

    if (!/^\d{6}$/.test(pin)) {
      setPinStatus('idle');
      setPinCities([]);
      return;
    }

    const seq = ++lookupSeq.current;
    setPinStatus('loading');
    let cancelled = false;

    lookupPin(pin).then((result) => {
      if (cancelled || seq !== lookupSeq.current) return;
      if (!result) {
        setPinStatus('miss');
        setPinCities([]);
        return;
      }
      setPinStatus('ok');
      setPinCities(result.cities);
      if (result.state) setValue(stateName, result.state as PathValue<T, Path<T>>, { shouldDirty: true, shouldValidate: true });
      if (result.city) setValue(cityName, result.city as PathValue<T, Path<T>>, { shouldDirty: true, shouldValidate: true });
    });

    return () => {
      cancelled = true;
    };
  }, [pinCode, setValue, stateName, cityName]);

  const cityOptions = suggestedCitiesForState(state, pinCities);
  const inputBase = [styles.input, { backgroundColor: bg }, inputStyle];

  return (
    <View>
      <Controller
        control={control}
        name={stateName}
        render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
          const text = value == null ? '' : String(value);
          const matches = filterSuggestions(INDIAN_STATES, text);
          const show = stateFocused && matches.length > 0;
          return (
            <>
              <TextInput
                mode="outlined"
                label="State"
                value={text}
                onChangeText={(next) => { onChange(next); setStateFocused(true); }}
                onFocus={() => setStateFocused(true)}
                onBlur={() => { setStateFocused(false); onBlur(); }}
                error={Boolean(error)}
                autoCapitalize="words"
                right={<TextInput.Icon icon="chevron-down" />}
                style={inputBase}
                outlineStyle={styles.outline}
                outlineColor={theme.colors.outlineVariant}
                activeOutlineColor={theme.colors.primary}
                textColor={theme.colors.onSurface}
                placeholderTextColor={theme.colors.onSurfaceVariant}
              />
              {show ? (
                <SuggestionList
                  items={matches}
                  onPick={(picked) => {
                    onChange(picked);
                    setStateFocused(false);
                    setPinCities([]);
                  }}
                />
              ) : null}
              {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
            </>
          );
        }}
      />

      <Controller
        control={control}
        name={pinName}
        render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
          <>
            <TextInput
              mode="outlined"
              label="PIN code"
              value={value == null ? '' : String(value)}
              onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, 6))}
              onBlur={onBlur}
              error={Boolean(error)}
              keyboardType="number-pad"
              maxLength={6}
              right={
                pinStatus === 'loading' ? (
                  <TextInput.Icon icon={() => <ActivityIndicator size={16} color={theme.colors.primary} />} />
                ) : pinStatus === 'ok' ? (
                  <TextInput.Icon icon="check-circle-outline" color={colors.accent} />
                ) : undefined
              }
              style={inputBase}
              outlineStyle={styles.outline}
              outlineColor={theme.colors.outlineVariant}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              placeholderTextColor={theme.colors.onSurfaceVariant}
            />
            {pinStatus === 'miss' ? (
              <HelperText type="info" visible>PIN not found — enter city manually</HelperText>
            ) : null}
            {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
          </>
        )}
      />

      <Controller
        control={control}
        name={cityName}
        render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
          const text = value == null ? '' : String(value);
          const matches = filterSuggestions(cityOptions, text);
          const show = cityFocused && matches.length > 0;
          return (
            <>
              <TextInput
                mode="outlined"
                label="City"
                value={text}
                onChangeText={(next) => { onChange(next); setCityFocused(true); }}
                onFocus={() => setCityFocused(true)}
                onBlur={() => { setCityFocused(false); onBlur(); }}
                error={Boolean(error)}
                autoCapitalize="words"
                style={inputBase}
                outlineStyle={styles.outline}
                outlineColor={theme.colors.outlineVariant}
                activeOutlineColor={theme.colors.primary}
                textColor={theme.colors.onSurface}
                placeholderTextColor={theme.colors.onSurfaceVariant}
              />
              {show ? (
                <SuggestionList items={matches} onPick={(picked) => { onChange(picked); setCityFocused(false); }} />
              ) : null}
              {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
            </>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: spacing.gridGap },
  outline: { borderRadius: radii.input },
  suggestion: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  suggestions: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.gridGap,
    marginTop: -4,
    overflow: 'hidden'
  },
  suggestionText: { ...fontStyles.semiBold, flex: 1, fontSize: 13.5 }
});
