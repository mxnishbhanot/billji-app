import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, spacing } from '@/theme/theme';
import { SalesDocumentKind } from '@/types';
import { DOCUMENT_COPY } from '../documentCopy';

/**
 * What a document detail screen shows before it has a document: the loading card, or the
 * "not found" state once the fetch came back empty. Identical on every document, so the
 * wording comes from the copy table rather than being written out per screen.
 */
export function DocumentDetailFallback({
  kind,
  loading,
  onBack
}: {
  kind: SalesDocumentKind;
  loading: boolean;
  onBack: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { title, noun } = DOCUMENT_COPY[kind];
  const Noun = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;

  if (loading) {
    return (
      <Screen title={title}>
        <View
          style={[
            styles.card,
            isDark ? null : shadows.card,
            { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }
          ]}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>Loading {noun}…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={title}>
      <EmptyState title={`${Noun} not found`} message={`This ${noun} may have been removed.`} actionLabel="Back" onAction={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: 20, borderWidth: 1, gap: 12, padding: spacing.cardPadding, paddingVertical: 32 },
  stateText: { ...fontStyles.medium, fontSize: 13 }
});
