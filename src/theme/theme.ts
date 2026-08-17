import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import {
  warmLedgerLight,
  warmLedgerDark,
  spacing as dsSpacing,
  radius as dsRadius,
  plusJakartaFontFamilies as dsFonts,
  fontStyles as dsFontStyles,
  typography as dsTypography
} from '@/design-system';

export const plusJakartaFontFamilies = dsFonts;

export const fontStyles = dsFontStyles;

export const typeScale = {
  displayLg: dsTypography.display,
  headlineMd: dsTypography.headline,
  headlineMdMobile: { ...dsFontStyles.bold, fontSize: 20, lineHeight: 28 },
  metricXl: dsTypography.heroNumber,
  labelSm: { ...dsFontStyles.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  bodyMd: { ...dsFontStyles.regular, fontSize: 16, lineHeight: 24 },
  screenTitle: dsTypography.headline,
  heroHeadline: dsTypography.headline,
  sectionTitle: dsTypography.section,
  cardValue: { ...dsFontStyles.bold, fontSize: 28, lineHeight: 34 },
  bodyPrimary: { ...dsFontStyles.regular, fontSize: 16, lineHeight: 24 },
  bodyPrimaryMedium: { ...dsFontStyles.medium, fontSize: 16, lineHeight: 24 },
  caption: dsTypography.caption,
  smallCaption: { ...dsFontStyles.regular, fontSize: 11, lineHeight: 14 },
  badgeLabel: dsTypography.badge,
  eyebrow: { ...dsFontStyles.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  heroNumber: dsTypography.heroNumber,
  body: dsTypography.body,
  bodyMedium: dsTypography.bodyMedium
};

export const spacing = {
  ...dsSpacing
};

export const radii = {
  sm: dsRadius.sm,
  default: dsRadius.default,
  md: dsRadius.md,
  lg: dsRadius.lg,
  xl: dsRadius.xl,
  full: dsRadius.full,
  card: dsRadius.card,
  input: dsRadius.input,
  pill: dsRadius.pill,
  badge: dsRadius.badge,
  fab: dsRadius.fab,
  hero: dsRadius.hero,
  button: dsRadius.button,
  tabBar: dsRadius.tabBar
};

export const layout = {
  statGridCardWidth: (screenWidth: number) => (screenWidth - 48) / 2
};

export const iconography = {
  library: 'Lucide'
} as const;

const baseFonts = MD3LightTheme.fonts;
const appTypeScale = {
  ...baseFonts,
  default: { ...baseFonts.default, ...fontStyles.regular },
  bodyLarge: { ...baseFonts.bodyLarge, ...typeScale.bodyPrimary },
  bodyMedium: { ...baseFonts.bodyMedium, ...typeScale.bodyPrimary },
  bodySmall: { ...baseFonts.bodySmall, ...typeScale.caption },
  labelLarge: { ...baseFonts.labelLarge, ...typeScale.bodyPrimaryMedium },
  labelMedium: { ...baseFonts.labelMedium, ...typeScale.caption, ...fontStyles.medium },
  labelSmall: { ...baseFonts.labelSmall, ...typeScale.badgeLabel },
  titleLarge: { ...baseFonts.titleLarge, ...typeScale.screenTitle },
  titleMedium: { ...baseFonts.titleMedium, ...typeScale.sectionTitle },
  titleSmall: { ...baseFonts.titleSmall, ...typeScale.sectionTitle },
  headlineLarge: { ...baseFonts.headlineLarge, ...typeScale.screenTitle },
  headlineMedium: { ...baseFonts.headlineMedium, ...typeScale.heroHeadline },
  headlineSmall: { ...baseFonts.headlineSmall, ...typeScale.cardValue },
  displayLarge: { ...baseFonts.displayLarge, ...typeScale.screenTitle },
  displayMedium: { ...baseFonts.displayMedium, ...typeScale.screenTitle },
  displaySmall: { ...baseFonts.displaySmall, ...typeScale.screenTitle }
};

export const billjiPalette = {
  light: {
    primary: warmLedgerLight.primary,
    primaryStrong: warmLedgerLight.primaryStrong,
    primarySoft: warmLedgerLight.primarySoft,
    primaryFixed: warmLedgerLight.primaryFixed,
    primaryFixedDim: warmLedgerLight.primaryFixedDim,
    secondary: warmLedgerLight.secondary,
    secondarySoft: warmLedgerLight.secondarySoft,
    secondaryContainer: warmLedgerLight.secondaryContainer,
    tertiary: warmLedgerLight.tertiary,
    tertiarySoft: warmLedgerLight.tertiarySoft,
    accent: warmLedgerLight.accent,
    accentSoft: warmLedgerLight.accentSoft,
    warning: warmLedgerLight.warning,
    warningSoft: warmLedgerLight.warningSoft,
    pending: warmLedgerLight.pending,
    pendingSoft: warmLedgerLight.pendingSoft,
    destructive: warmLedgerLight.destructive,
    destructiveSoft: warmLedgerLight.destructiveSoft,
    background: warmLedgerLight.background,
    card: warmLedgerLight.card,
    surface: warmLedgerLight.surface,
    surfaceDim: warmLedgerLight.surfaceDim,
    surfaceBright: warmLedgerLight.surfaceBright,
    surfaceContainerLowest: warmLedgerLight.surfaceContainerLowest,
    surfaceContainerLow: warmLedgerLight.surfaceContainerLow,
    surfaceContainer: warmLedgerLight.surfaceContainer,
    surfaceContainerHigh: warmLedgerLight.surfaceContainerHigh,
    surfaceContainerHighest: warmLedgerLight.surfaceContainerHighest,
    foreground: warmLedgerLight.foreground,
    mutedForeground: warmLedgerLight.mutedForeground,
    border: warmLedgerLight.border,
    outline: warmLedgerLight.outline,
    violet: warmLedgerLight.violet,
    purple: warmLedgerLight.purple,
    ctaStart: warmLedgerLight.ctaStart,
    ctaEnd: warmLedgerLight.ctaEnd,
    categoryGreen: warmLedgerLight.categoryGreen,
    categoryPurple: warmLedgerLight.categoryPurple,
    categoryOrange: warmLedgerLight.categoryOrange,
    categoryBlue: warmLedgerLight.categoryBlue
  },
  dark: {
    primary: warmLedgerDark.primary,
    primaryStrong: warmLedgerDark.primaryStrong,
    primarySoft: warmLedgerDark.primarySoft,
    primaryFixed: warmLedgerDark.primaryFixed,
    primaryFixedDim: warmLedgerDark.primaryFixedDim,
    secondary: warmLedgerDark.secondary,
    secondarySoft: warmLedgerDark.secondarySoft,
    secondaryContainer: warmLedgerDark.secondaryContainer,
    tertiary: warmLedgerDark.tertiary,
    tertiarySoft: warmLedgerDark.tertiarySoft,
    accent: warmLedgerDark.accent,
    accentSoft: warmLedgerDark.accentSoft,
    warning: warmLedgerDark.warning,
    warningSoft: warmLedgerDark.warningSoft,
    pending: warmLedgerDark.pending,
    pendingSoft: warmLedgerDark.pendingSoft,
    destructive: warmLedgerDark.destructive,
    destructiveSoft: warmLedgerDark.destructiveSoft,
    background: warmLedgerDark.background,
    card: warmLedgerDark.card,
    surface: warmLedgerDark.surface,
    surfaceDim: warmLedgerDark.surfaceDim,
    surfaceBright: warmLedgerDark.surfaceBright,
    surfaceContainerLowest: warmLedgerDark.surfaceContainerLowest,
    surfaceContainerLow: warmLedgerDark.surfaceContainerLow,
    surfaceContainer: warmLedgerDark.surfaceContainer,
    surfaceContainerHigh: warmLedgerDark.surfaceContainerHigh,
    surfaceContainerHighest: warmLedgerDark.surfaceContainerHighest,
    foreground: warmLedgerDark.foreground,
    mutedForeground: warmLedgerDark.mutedForeground,
    border: warmLedgerDark.border,
    outline: warmLedgerDark.outline,
    violet: warmLedgerDark.violet,
    purple: warmLedgerDark.purple,
    ctaStart: warmLedgerDark.ctaStart,
    ctaEnd: warmLedgerDark.ctaEnd,
    categoryGreen: warmLedgerDark.categoryGreen,
    categoryPurple: warmLedgerDark.categoryPurple,
    categoryOrange: warmLedgerDark.categoryOrange,
    categoryBlue: warmLedgerDark.categoryBlue
  }
};

export const alpha = (hex: string, opacity: number) => {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
};

export const appColors = (isDark: boolean) => billjiPalette[isDark ? 'dark' : 'light'];

export const statusTone = (status?: string, isDark = false) => {
  const colors = appColors(isDark);
  const normalized = status?.toLowerCase();

  if (normalized === 'paid' || normalized === 'success') {
    return { background: colors.accentSoft, foreground: colors.accent, border: alpha(colors.accent, isDark ? 0.28 : 0.32) };
  }

  if (normalized === 'cancelled' || normalized === 'overdue' || normalized === 'error') {
    return { background: colors.destructiveSoft, foreground: colors.destructive, border: alpha(colors.destructive, isDark ? 0.3 : 0.34) };
  }

  if (normalized === 'pending' || normalized === 'warning') {
    return { background: colors.warningSoft, foreground: colors.warning, border: alpha(colors.warning, isDark ? 0.3 : 0.34) };
  }

  return { background: colors.primarySoft, foreground: colors.primary, border: alpha(colors.primary, isDark ? 0.26 : 0.28) };
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 4,
  fonts: appTypeScale,
  colors: {
    ...MD3LightTheme.colors,
    primary: billjiPalette.light.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: billjiPalette.light.primaryStrong,
    onPrimaryContainer: '#FFFBFF',
    secondary: billjiPalette.light.secondary,
    onSecondary: '#FFFFFF',
    secondaryContainer: billjiPalette.light.secondaryContainer,
    onSecondaryContainer: '#68645D',
    tertiary: billjiPalette.light.tertiary,
    onTertiary: '#FFFFFF',
    tertiaryContainer: billjiPalette.light.purple,
    onTertiaryContainer: '#FFFBFF',
    background: billjiPalette.light.background,
    onBackground: billjiPalette.light.foreground,
    surface: billjiPalette.light.card,
    onSurface: billjiPalette.light.foreground,
    surfaceVariant: billjiPalette.light.surfaceContainerHighest,
    onSurfaceVariant: billjiPalette.light.mutedForeground,
    surfaceDisabled: billjiPalette.light.surfaceContainerHigh,
    outline: billjiPalette.light.outline,
    outlineVariant: billjiPalette.light.border,
    inverseSurface: '#342F2C',
    inverseOnSurface: '#F9EFE9',
    inversePrimary: '#FFB692',
    error: billjiPalette.light.destructive,
    onError: '#FFFFFF',
    errorContainer: billjiPalette.light.destructiveSoft,
    onErrorContainer: '#93000A',
    elevation: {
      level0: 'transparent',
      level1: billjiPalette.light.card,
      level2: billjiPalette.light.surfaceContainerLow,
      level3: billjiPalette.light.surfaceContainer,
      level4: billjiPalette.light.surfaceContainerHigh,
      level5: billjiPalette.light.surfaceContainerHighest
    }
  }
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 4,
  fonts: appTypeScale,
  colors: {
    ...MD3DarkTheme.colors,
    primary: billjiPalette.dark.primary,
    onPrimary: '#341100',
    primaryContainer: billjiPalette.dark.primaryFixed,
    onPrimaryContainer: '#FFDBCB',
    secondary: billjiPalette.dark.secondary,
    onSecondary: '#1E1B16',
    secondaryContainer: billjiPalette.dark.secondaryContainer,
    onSecondaryContainer: '#E8E2D9',
    tertiary: billjiPalette.dark.tertiary,
    onTertiary: '#1C0062',
    tertiaryContainer: billjiPalette.dark.tertiarySoft,
    onTertiaryContainer: '#E6DEFF',
    background: billjiPalette.dark.background,
    onBackground: billjiPalette.dark.foreground,
    surface: billjiPalette.dark.card,
    onSurface: billjiPalette.dark.foreground,
    surfaceVariant: billjiPalette.dark.surfaceContainerHigh,
    onSurfaceVariant: billjiPalette.dark.mutedForeground,
    surfaceDisabled: billjiPalette.dark.surfaceContainer,
    outline: billjiPalette.dark.outline,
    outlineVariant: billjiPalette.dark.border,
    inverseSurface: '#F9EFE9',
    inverseOnSurface: '#342F2C',
    inversePrimary: billjiPalette.dark.primaryFixedDim,
    error: billjiPalette.dark.destructive,
    onError: '#690005',
    errorContainer: billjiPalette.dark.destructiveSoft,
    onErrorContainer: '#FFDAD6',
    elevation: {
      level0: 'transparent',
      level1: billjiPalette.dark.surfaceContainerLow,
      level2: billjiPalette.dark.surfaceContainer,
      level3: billjiPalette.dark.surfaceContainerHigh,
      level4: billjiPalette.dark.surfaceContainerHighest,
      level5: billjiPalette.dark.surfaceBright
    }
  }
};
