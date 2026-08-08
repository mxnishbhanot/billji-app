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

export const typography = {
  display: { ...fontStyles.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  heroNumber: { ...fontStyles.bold, fontSize: 48, lineHeight: 56, letterSpacing: -1 },
  headline: { ...fontStyles.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.48 },
  section: { ...fontStyles.semiBold, fontSize: 18, lineHeight: 24 },
  body: { ...fontStyles.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { ...fontStyles.medium, fontSize: 15, lineHeight: 22 },
  caption: { ...fontStyles.medium, fontSize: 12, lineHeight: 16 },
  captionSemiBold: { ...fontStyles.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  labelUpper: { ...fontStyles.semiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  badge: { ...fontStyles.semiBold, fontSize: 10, lineHeight: 13 }
} as const;
