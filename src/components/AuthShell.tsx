import { ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from 'react-native-paper';
import { AppCard } from '@/components/AppCard';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';

const billjiLogo = require('../../assets/main-logo-clean.png');

// Every auth screen is one card on a warm background, and it has to fit the viewport
// without scrolling: a sign-in form the user has to scroll reads as broken. The layout
// is centred and sized off the window height, so a short device gets a smaller mark and
// no tagline rather than a scrollbar. The scroll view stays only so the keyboard can
// push the focused field into view — nothing scrolls while the keyboard is closed.
export const useAuthCompact = () => useWindowDimensions().height < 760;

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
  const logoSize = compact ? 48 : 64;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Two soft brand washes instead of the old animated SVG hero: same warmth, no
          render cost, and they never push the form off screen. */}
      <View pointerEvents="none" style={[styles.glowTop, { backgroundColor: alpha(colors.primary, theme.dark ? 0.1 : 0.14) }]} />
      <View pointerEvents="none" style={[styles.glowBottom, { backgroundColor: alpha(colors.primaryStrong, theme.dark ? 0.08 : 0.07) }]} />

      <KeyboardAwareScrollView
        bottomOffset={16}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingVertical: compact ? spacing.sm : spacing.lg }]}
      >
        <View style={[styles.brand, { marginBottom: compact ? spacing.sm : spacing.md }]}>
          <Image source={billjiLogo} resizeMode="contain" style={{ height: logoSize, width: logoSize }} />
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmark, { color: colors.foreground, fontSize: compact ? 26 : 30 }]}>Bill</Text>
            <Text style={[styles.wordmark, { color: colors.primary, fontSize: compact ? 26 : 30 }]}>Ji</Text>
          </View>
          {compact ? null : (
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Hisaab Apka, Growth Apki</Text>
          )}
        </View>

        <AppCard style={[styles.card, { borderColor: alpha(colors.primary, theme.dark ? 0.18 : 0.1) }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, marginBottom: compact ? spacing.sm : spacing.md }]}>{subtitle}</Text>
          {children}
        </AppCard>

        {footer}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding
  },
  glowTop: {
    borderRadius: radii.full,
    height: 300,
    position: 'absolute',
    right: -110,
    top: -130,
    width: 300
  },
  glowBottom: {
    borderRadius: radii.full,
    bottom: -140,
    height: 280,
    left: -120,
    position: 'absolute',
    width: 280
  },
  brand: { alignItems: 'center' },
  wordmarkRow: { flexDirection: 'row', marginTop: spacing.xs },
  wordmark: { ...fontStyles.bold, letterSpacing: -1.2 },
  tagline: { ...typeScale.caption, marginTop: 2 },
  card: { borderRadius: radii.xl, marginBottom: 0 },
  title: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.5 },
  subtitle: { ...typeScale.caption, marginTop: 2 }
});
