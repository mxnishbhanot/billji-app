import { ViewStyle } from 'react-native';

const warmShadow = 'rgba(31, 27, 24, 0.04)';
const warmShadowStrong = 'rgba(31, 27, 24, 0.08)';
const ctaShadow = 'rgba(217, 95, 24, 0.22)';

export const shadows = {
  card: {
    shadowColor: warmShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2
  } satisfies ViewStyle,
  action: {
    shadowColor: warmShadowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3
  } satisfies ViewStyle,
  cta: {
    shadowColor: ctaShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4
  } satisfies ViewStyle,
  tabBar: {
    shadowColor: warmShadowStrong,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8
  } satisfies ViewStyle
} as const;
