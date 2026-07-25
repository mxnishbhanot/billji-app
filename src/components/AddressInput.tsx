import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FieldValues, Path, PathValue, UseFormReturn, useWatch } from 'react-hook-form';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { FormTextInput } from '@/components/FormTextInput';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

// Address field with type-ahead suggestions from Photon (komoot's OpenStreetMap
// geocoder): free, no API key, no attribution UI required. Suggestions are a
// convenience only — the field stays free text, so offline / failed lookups just
// mean no dropdown.
const PHOTON_URL = 'https://photon.komoot.io/api/';
const DEBOUNCE_MS = 400;
const MIN_QUERY = 3;

type PhotonFeature = { properties?: Record<string, string> };

const formatFeature = (feature: PhotonFeature) => {
  const p = feature.properties ?? {};
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  return [p.name, street, p.district, p.city ?? p.county, p.state, p.postcode, p.country]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(', ');
};

type Props<T extends FieldValues> = {
  form: UseFormReturn<T>;
  name: Path<T>;
  label?: string;
};

export function AddressInput<T extends FieldValues>({ form, name, label = 'Address' }: Props<T>) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const value = String(useWatch({ control: form.control, name }) ?? '');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Value we wrote ourselves (or loaded for edit) — don't re-query it.
  const ignored = useRef(value);

  useEffect(() => {
    if (value === ignored.current || value.trim().length < MIN_QUERY) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${PHOTON_URL}?limit=5&q=${encodeURIComponent(value.trim())}`, { signal: controller.signal });
        const json = (await res.json()) as { features?: PhotonFeature[] };
        setResults((json.features ?? []).map(formatFeature).filter(Boolean));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (suggestion: string) => {
    ignored.current = suggestion;
    form.setValue(name, suggestion as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });
    setResults([]);
  };

  return (
    <View>
      <FormTextInput control={form.control} name={name} label={label} multiline autoCorrect={false} />
      {loading && !results.length ? (
        <View style={styles.searching}>
          <ActivityIndicator size={12} color={theme.colors.primary} />
          <Text style={[styles.rowText, { color: theme.colors.onSurfaceVariant }]}>Looking up addresses...</Text>
        </View>
      ) : null}
      {results.length ? (
        <View style={[styles.list, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]}>
          {results.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => pick(suggestion)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.14 : 0.06) : 'transparent' }]}
            >
              <Text numberOfLines={2} style={[styles.rowText, { color: theme.colors.onSurface }]}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radii.md, borderWidth: 1, marginBottom: 8, marginTop: -4, overflow: 'hidden' },
  row: { paddingHorizontal: 12, paddingVertical: 10 },
  rowText: { ...fontStyles.semiBold, fontSize: 12 },
  searching: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8, marginTop: -4, paddingHorizontal: 4 }
});
