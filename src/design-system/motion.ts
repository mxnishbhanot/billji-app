import { Easing } from 'react-native-reanimated';

export const motion = {
  tap: 120,
  elevation: 180,
  navigation: 240,
  chart: 600,
  easing: {
    out: Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.cubic)
  }
} as const;
