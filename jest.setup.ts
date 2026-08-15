jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined)
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn()
}));

/**
 * Reanimated ships untranspiled ESM and refuses to load without its native half, so anything
 * that reaches the theme (which reads easing constants from it) fails to import under Jest.
 * Nothing here tests animation, so a stub is enough — animated values pass straight through.
 */
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView } = require('react-native');
  const passthrough = (value: unknown) => value;
  const easing = () => 0;

  return {
    __esModule: true,
    default: { View, Text, ScrollView, createAnimatedComponent: passthrough },
    View,
    Text,
    ScrollView,
    Easing: { bezier: () => easing, in: passthrough, inOut: passthrough, out: passthrough, linear: easing, ease: easing, quad: easing, cubic: easing, sin: easing },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    FadeIn: {}, FadeInUp: {}, FadeOut: {}, FadeOutUp: {},
    interpolate: () => 0,
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: passthrough,
    withSpring: passthrough,
    withTiming: passthrough
  };
});
