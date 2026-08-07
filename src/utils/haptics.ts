import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Light haptic confirmation for intentional taps. Fire-and-forget: haptics are a garnish, so a
 * failure must never surface to the user or block the action that triggered it.
 *
 * No-ops on web (no API) and swallows the "unsupported device" rejection everywhere else.
 */
const fire = (run: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  void run().catch(() => {});
};

/** Primary actions: create invoice, send reminders. */
export const tapMedium = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Navigation-ish taps: quick actions, activity rows, view-all. */
export const tapLight = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Discrete value changes: chart range segments, filters. */
export const tapSelection = () => fire(() => Haptics.selectionAsync());
