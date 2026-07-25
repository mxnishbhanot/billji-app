import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Reanimated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { alpha, appColors, radii } from '@/theme/theme';

const billjiLogo = require('../../assets/main-logo-clean.png');

const TRACK_WIDTH = 132;
const THUMB_WIDTH = 44;
const SWEEP_MS = 1150;

/**
 * Boot screen shown while auth hydrates, fonts load and the dashboard prefetch
 * runs. Picks up where the native splash leaves off: the logo eases in, an
 * indeterminate sweep signals work, and the whole thing cross-fades out (see the
 * `exiting` prop on the root) so there is no hard cut into the first screen.
 */
export function AppSplash() {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const reduceMotion = useReducedMotion();

  const enter = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System
    });
    if (reduceMotion) return;
    sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [enter, sweep, reduceMotion]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.92 + enter.value * 0.08 }]
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-THUMB_WIDTH, TRACK_WIDTH]) }]
  }));

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Reanimated.Image source={billjiLogo} resizeMode="contain" style={[styles.logo, logoStyle]} />
      {reduceMotion ? null : (
        <View style={[styles.track, { backgroundColor: alpha(colors.primary, theme.dark ? 0.22 : 0.14) }]}>
          <Reanimated.View style={[styles.thumb, { backgroundColor: colors.primary }, thumbStyle]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { height: 104, width: 104 },
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  thumb: { borderRadius: radii.pill, height: '100%', width: THUMB_WIDTH },
  track: { borderRadius: radii.pill, height: 3, marginTop: 28, overflow: 'hidden', width: TRACK_WIDTH }
});
