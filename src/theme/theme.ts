import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export const plusJakartaFontFamilies = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold'
} as const;

export const fontStyles = {
  regular: { fontFamily: plusJakartaFontFamilies.regular, fontWeight: '400' as const },
  medium: { fontFamily: plusJakartaFontFamilies.medium, fontWeight: '500' as const },
  semiBold: { fontFamily: plusJakartaFontFamilies.semiBold, fontWeight: '600' as const },
  bold: { fontFamily: plusJakartaFontFamilies.bold, fontWeight: '700' as const }
};

export const typeScale = {
  displayLg: { ...fontStyles.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  headlineMd: { ...fontStyles.bold, fontSize: 24, lineHeight: 32 },
  headlineMdMobile: { ...fontStyles.bold, fontSize: 20, lineHeight: 28 },
  metricXl: { ...fontStyles.bold, fontSize: 28, lineHeight: 34 },
  labelSm: { ...fontStyles.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  bodyMd: { ...fontStyles.regular, fontSize: 16, lineHeight: 24 },
  screenTitle: { ...fontStyles.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.48 },
  heroHeadline: { ...fontStyles.bold, fontSize: 24, lineHeight: 32 },
  sectionTitle: { ...fontStyles.semiBold, fontSize: 16, lineHeight: 22 },
  cardValue: { ...fontStyles.bold, fontSize: 28, lineHeight: 34 },
  bodyPrimary: { ...fontStyles.regular, fontSize: 16, lineHeight: 24 },
  bodyPrimaryMedium: { ...fontStyles.medium, fontSize: 16, lineHeight: 24 },
  caption: { ...fontStyles.regular, fontSize: 12, lineHeight: 16 },
  smallCaption: { ...fontStyles.regular, fontSize: 11, lineHeight: 14 },
  badgeLabel: { ...fontStyles.semiBold, fontSize: 10, lineHeight: 13 },
  eyebrow: { ...fontStyles.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const }
};

export const spacing = {
  base: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  screenPadding: 20,
  gridGap: 16,
  cardPadding: 16,
  cardPaddingCompact: 12,
  sectionGap: 24,
  marginMobile: 20,
  marginDesktop: 48,
  gutter: 16
};

export const radii = {
  sm: 4,
  default: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
  card: 16,
  input: 12,
  pill: 9999,
  badge: 9999,
  fab: 27
};

export const layout = {
  statGridCardWidth: (screenWidth: number) => (screenWidth - 48) / 2
};

export const iconography = {
  library: 'Feather'
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
    primary: '#2A14B4',
    primaryStrong: '#4338CA',
    primarySoft: '#E3DFFF',
    primaryFixed: '#E3DFFF',
    primaryFixedDim: '#C3C0FF',
    secondary: '#4953BC',
    secondarySoft: '#E0E0FF',
    secondaryContainer: '#8792FE',
    tertiary: '#2E395C',
    tertiarySoft: '#DBE1FF',
    accent: '#10B981',
    accentSoft: '#D1FAE5',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    destructive: '#BA1A1A',
    destructiveSoft: '#FFDAD6',
    background: '#F8F9FD',
    card: '#FFFFFF',
    surface: '#F2F3F7',
    surfaceDim: '#D9DADE',
    surfaceBright: '#F8F9FD',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F2F3F7',
    surfaceContainer: '#EDEEF2',
    surfaceContainerHigh: '#E7E8EC',
    surfaceContainerHighest: '#E1E2E6',
    foreground: '#191C1F',
    mutedForeground: '#464554',
    border: '#C7C4D7',
    outline: '#777586',
    violet: '#8792FE',
    purple: '#5148D7'
  },
  dark: {
    primary: '#C3C0FF',
    primaryStrong: '#A5A0FA',
    primarySoft: '#2A2674',
    primaryFixed: '#372ABF',
    primaryFixedDim: '#5148D7',
    secondary: '#BDC2FF',
    secondarySoft: '#2F3AA3',
    secondaryContainer: '#3B47B0',
    tertiary: '#B8C3EE',
    tertiarySoft: '#3A456A',
    accent: '#34D399',
    accentSoft: '#0F4F3D',
    warning: '#FBBF24',
    warningSoft: '#5C3A06',
    destructive: '#FFB4AB',
    destructiveSoft: '#5C1414',
    background: '#0F1117',
    card: '#181B23',
    surface: '#1F232D',
    surfaceDim: '#0F1117',
    surfaceBright: '#262A35',
    surfaceContainerLowest: '#0B0D12',
    surfaceContainerLow: '#181B23',
    surfaceContainer: '#1F232D',
    surfaceContainerHigh: '#262A35',
    surfaceContainerHighest: '#2F3441',
    foreground: '#EFF1F5',
    mutedForeground: '#A8AAB7',
    border: '#2F3441',
    outline: '#5A5B68',
    violet: '#8792FE',
    purple: '#5148D7'
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
    onPrimaryContainer: '#C1BEFF',
    secondary: billjiPalette.light.secondary,
    onSecondary: '#FFFFFF',
    secondaryContainer: billjiPalette.light.secondaryContainer,
    onSecondaryContainer: '#17228F',
    tertiary: billjiPalette.light.tertiary,
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#455075',
    onTertiaryContainer: '#B8C3EE',
    background: billjiPalette.light.background,
    onBackground: billjiPalette.light.foreground,
    surface: billjiPalette.light.card,
    onSurface: billjiPalette.light.foreground,
    surfaceVariant: billjiPalette.light.surfaceContainerHighest,
    onSurfaceVariant: billjiPalette.light.mutedForeground,
    surfaceDisabled: billjiPalette.light.surfaceContainerHigh,
    outline: billjiPalette.light.outline,
    outlineVariant: billjiPalette.light.border,
    inverseSurface: '#2E3134',
    inverseOnSurface: '#EFF1F5',
    inversePrimary: '#C3C0FF',
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
    onPrimary: '#0E0967',
    primaryContainer: billjiPalette.dark.primaryFixed,
    onPrimaryContainer: '#E3DFFF',
    secondary: billjiPalette.dark.secondary,
    onSecondary: '#1A1F66',
    secondaryContainer: billjiPalette.dark.secondaryContainer,
    onSecondaryContainer: '#E0E0FF',
    tertiary: billjiPalette.dark.tertiary,
    onTertiary: '#1F2A4C',
    tertiaryContainer: billjiPalette.dark.tertiarySoft,
    onTertiaryContainer: '#DBE1FF',
    background: billjiPalette.dark.background,
    onBackground: billjiPalette.dark.foreground,
    surface: billjiPalette.dark.card,
    onSurface: billjiPalette.dark.foreground,
    surfaceVariant: billjiPalette.dark.surfaceContainerHigh,
    onSurfaceVariant: billjiPalette.dark.mutedForeground,
    surfaceDisabled: billjiPalette.dark.surfaceContainer,
    outline: billjiPalette.dark.outline,
    outlineVariant: billjiPalette.dark.border,
    inverseSurface: '#EFF1F5',
    inverseOnSurface: '#2E3134',
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
