import { useState } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

// Category field with type-ahead suggestions sourced from the business's existing
// distinct categories (GET /products/categories). Typing "Cen" surfaces "Centring"
// so users reuse a category verbatim instead of risking a typo/duplicate. Still a
// free-text field — they can type a brand-new category too.
const MAX_SUGGESTIONS = 50;
// Roughly four 42px rows tall; the list scrolls when more matches are available.
const SUGGESTIONS_MAX_HEIGHT = 176;

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  categories: string[];
  label?: string;
};

export function CategoryAutocomplete<T extends FieldValues>({ control, name, categories, label = 'Category' }: Props<T>) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
        const text = value == null ? '' : String(value);
        const query = text.trim().toLowerCase();
        // Suggest categories that contain the query (prefix-first), excluding an
        // exact match (nothing to pick when it's already typed in full).
        const matches = categories
          .filter((category) => {
            const lower = category.toLowerCase();
            return lower !== query && (!query || lower.includes(query));
          })
          .sort((a, b) => {
            if (!query) return 0;
            const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
            const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
            return aStarts - bStarts;
          })
          .slice(0, MAX_SUGGESTIONS);
        const showSuggestions = focused && matches.length > 0;

        return (
          <>
            <TextInput
              mode="outlined"
              label={label}
              value={text}
              // Editing always re-opens the list — tapping back into a field that
              // already holds a picked value keeps native focus, so onFocus may not
              // fire again; flipping focused here makes deleting a character (or
              // typing) surface the suggestions once more.
              onChangeText={(next) => { onChange(next); setFocused(true); }}
              onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); onBlur(); }}
              error={Boolean(error)}
              autoCapitalize="words"
              maxLength={80}
              left={<TextInput.Icon icon="folder-outline" color={theme.colors.onSurfaceVariant} />}
              style={[styles.input, { backgroundColor: isDark ? colors.surface : colors.card }]}
              outlineStyle={styles.outline}
              outlineColor={theme.colors.outlineVariant}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              placeholderTextColor={theme.colors.onSurfaceVariant}
            />
            {showSuggestions ? (
              <View style={[styles.suggestions, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.14) }]}>
                <ScrollView
                  style={{ maxHeight: SUGGESTIONS_MAX_HEIGHT }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {matches.map((category) => (
                    <Pressable
                      key={category}
                      // onPressIn (touch-down) fires before the input's onBlur, which
                      // would otherwise unmount this list before a plain onPress lands.
                      onPressIn={() => { onChange(category); setFocused(false); }}
                      style={({ pressed }) => [
                        styles.suggestion,
                        { backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.18 : 0.08) : 'transparent' }
                      ]}
                    >
                      <Feather name="corner-down-left" size={13} color={theme.colors.onSurfaceVariant} />
                      <Text numberOfLines={1} style={[styles.suggestionText, { color: theme.colors.onSurface }]}>{category}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
          </>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: spacing.gridGap },
  outline: { borderRadius: radii.input },
  suggestions: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.gridGap,
    marginTop: -4,
    overflow: 'hidden'
  },
  suggestion: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  suggestionText: { ...fontStyles.semiBold, flex: 1, fontSize: 13.5 }
});
