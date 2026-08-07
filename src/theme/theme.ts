import type { TextStyle } from 'react-native';
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
  gutter: 16,
  /** Gap that separates one dashboard section from the next — the widest gap on the screen. */
  sectionGapLg: 28,
  /** Gap between a section heading and the content it labels. */
  headingGap: 12
};

/**
 * One circle scale for the whole product, so capsules, avatars and tiles read as a family instead of
 * three unrelated sizes. sm = KPI capsule, md = avatar, lg = feature tile, xl = hero CTA glyph.
 */
export const circleSizes = {
  sm: 36,
  md: 42,
  lg: 52,
  xl: 34
} as const;

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

/** Icon sizes, so a 17 and an 18 never sit side by side again. */
export const iconSizes = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 26
} as const;

/**
 * Animation durations (ms) and the two spring presets everything uses. Kept as plain numbers so this
 * module stays dependency-free, and kept to *two* springs on purpose: one hand across the whole app.
 */
export const motion = {
  fast: 140,
  base: 220,
  slow: 340,
  /** Per-item stagger for list/section reveals. */
  stagger: 45,
  /** Pressed-state scale for tappable cards and tiles. */
  pressScale: 0.975
} as const;

/** Press-in is fast and linear-ish; release is a spring, because release is what the finger feels. */
export const springs = {
  /** Press release, indicator slides, active-tab pill. */
  snap: { damping: 17, stiffness: 210, mass: 0.9 },
  /** Larger surfaces that should settle rather than snap (hero CTA, modals). */
  settle: { damping: 22, stiffness: 160, mass: 1 }
} as const;

/**
 * Semantic accents. Purple stays the brand; these exist so money reads as money and risk reads as
 * risk. Used only for icon capsules, sparklines and micro-rules — never as a surface fill, which is
 * what would turn the dashboard into a rainbow.
 */
export const semanticPalette = {
  light: {
    revenue: '#059669',
    pending: '#D97706',
    reports: '#4338CA',
    inventory: '#0891B2',
    expenses: '#EA580C'
  },
  dark: {
    revenue: '#34D399',
    pending: '#FBBF24',
    reports: '#A5A0FA',
    inventory: '#22D3EE',
    expenses: '#FB923C'
  }
};

export type SemanticAccent = keyof typeof semanticPalette.light;

export const semantic = (isDark: boolean) => semanticPalette[isDark ? 'dark' : 'light'];

type ShadowLevel = 'none' | 'xs' | 'sm' | 'md' | 'lg';

const SHADOW_GEOMETRY: Record<ShadowLevel, { offsetY: number; radius: number; light: number; dark: number; elevation: number }> = {
  none: { offsetY: 0, radius: 0, light: 0, dark: 0, elevation: 0 },
  // Light-mode opacities run deeper than a typical material shadow on purpose: clay reads as moulded
  // only when the drop shadow is soft AND actually visible against a warm ground.
  xs: { offsetY: 1, radius: 5, light: 0.06, dark: 0.18, elevation: 1 },
  sm: { offsetY: 4, radius: 12, light: 0.1, dark: 0.24, elevation: 2 },
  md: { offsetY: 9, radius: 22, light: 0.13, dark: 0.32, elevation: 5 },
  lg: { offsetY: 16, radius: 34, light: 0.17, dark: 0.42, elevation: 10 }
};

/**
 * Soft-depth shadow tokens. One place to tune elevation instead of five inline props per card.
 * Dark mode tints from black (a brand-coloured glow reads as a bug on a dark surface); light mode
 * tints from a warm brown, which is the shadow a warm sand surface actually casts — an indigo shadow
 * under a cream card is the tell that a palette was recoloured but its depth was not.
 */
const WARM_SHADOW = '#7A5A3C';

export const shadow = (isDark: boolean, level: ShadowLevel = 'sm') => {
  const geometry = SHADOW_GEOMETRY[level];
  return {
    shadowColor: isDark ? '#000000' : WARM_SHADOW,
    shadowOffset: { width: 0, height: geometry.offsetY },
    shadowOpacity: isDark ? geometry.dark : geometry.light,
    shadowRadius: geometry.radius,
    elevation: geometry.elevation
  };
};

/**
 * Hero surface palette. The hero is a deliberately dark, branded surface in both themes, so its
 * foreground colours are fixed rather than theme-inverted — but the gradient itself now has a
 * dark-mode variant that sits correctly against a #0F1117 background.
 */
export const heroPalette = {
  light: {
    // Warm plum rather than cold indigo: the page around it is now warm sand, and a cold hero on a
    // warm page reads as two different products stapled together.
    gradient: ['#33205E', '#452A6E', '#5B3577'] as const,
    stroke: '#FFFFFF',
    glow: '#EEC9A8',
    /**
     * Hero CTA fill. Amber, not white: the hero is a lit plane carrying a white specular arc and two
     * light pools, so *any* white object competes with them instead of separating. Amber is warm, it
     * is nowhere else on this surface, and it is the highest-contrast hue against deep plum.
     */
    cta: ['#FBBF24', '#F59E0B'] as const
  },
  dark: {
    gradient: ['#1B1230', '#281A45', '#372156'] as const,
    stroke: '#E7D8FF',
    glow: '#C9A87C',
    cta: ['#FCD34D', '#F59E0B'] as const
  }
};

/** Foreground colours on the hero surface — identical in both themes by design. */
export const heroForeground = {
  primary: '#FFFFFF',
  secondary: 'rgba(255, 255, 255, 0.76)',
  muted: 'rgba(255, 255, 255, 0.58)',
  eyebrow: '#F3D9BC',
  /** Ink on the amber CTA — dark warm brown, which is what keeps the label legible on yellow. */
  onCta: '#3A2408'
} as const;

export const hero = (isDark: boolean) => ({ ...heroPalette[isDark ? 'dark' : 'light'], foreground: heroForeground });

/**
 * Surface gradients. A premium card is never one flat fill: it is a very slightly lit plane, so each
 * of these is a two-stop gradient with only a few percent of separation. Anything stronger reads as
 * a Dribbble concept rather than a product.
 */
export const surfaceGradient = (isDark: boolean) => ({
  card: isDark ? (['#20242F', '#171A22'] as const) : (['#FFFDF9', '#F6EFE6'] as const),
  raised: isDark ? (['#272C39', '#1B1F28'] as const) : (['#FFFCF7', '#F3EBE0'] as const),
  sunken: isDark ? (['#14171E', '#0F1117'] as const) : (['#F5EFE7', '#EDE5DA'] as const)
});

/**
 * Glass/lighting helpers: a hairline highlight along a surface's top edge and the tint used for
 * frosted overlays. The highlight is what separates an elevated card from a coloured rectangle.
 */
export const glass = (isDark: boolean) => ({
  highlight: isDark ? alpha('#FFFFFF', 0.08) : alpha('#FFFFFF', 0.92),
  rim: isDark ? alpha('#FFFFFF', 0.06) : alpha('#7A5A3C', 0.1),
  veil: isDark ? alpha('#0B0D12', 0.72) : alpha('#FFFDFA', 0.74)
});

/** Numeric styling for money and counts — figures must not jitter between renders. */
export const numeric: { fontVariant: TextStyle['fontVariant'] } = {
  fontVariant: ['tabular-nums']
};

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
    // Warm neutral ramp (sand/cream, not blue-grey). Clay surfaces need a warm ground: a soft body
    // colour with a warm shadow is what makes them read as moulded rather than as flat white boxes,
    // and it is markedly easier on the eyes over a long session than #F8F9FD.
    background: '#FAF6F0',
    card: '#FFFCF8',
    surface: '#F5F0E9',
    surfaceDim: '#DED6CB',
    surfaceBright: '#FDFAF5',
    surfaceContainerLowest: '#FFFDFA',
    surfaceContainerLow: '#F7F2EB',
    surfaceContainer: '#F1EAE1',
    surfaceContainerHigh: '#EAE2D7',
    surfaceContainerHighest: '#E3DACE',
    foreground: '#221D19',
    mutedForeground: '#5A5049',
    border: '#DBD1C4',
    outline: '#8A7F73',
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
