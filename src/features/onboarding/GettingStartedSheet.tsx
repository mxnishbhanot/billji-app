import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import Reanimated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppNavigation } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { ProgressRing } from './ProgressPill';
import { useOnboardingOptional } from './OnboardingProvider';
import type { ChecklistTaskDef } from './types';

function navigateToTask(navigation: AppNavigation, task: ChecklistTaskDef) {
  if (!task.navigate) return;
  const { tab, screen, params } = task.navigate;
  if (tab) {
    // Nested tab navigation — cast is intentional for deep links across tab stacks.
    (navigation as any).navigate(tab, { screen, params });
  } else {
    (navigation as any).navigate(screen, params);
  }
}

export function GettingStartedSheet() {
  const onboarding = useOnboardingOptional();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigation>();

  const visible = Boolean(onboarding?.checklistSheetOpen);
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(620)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : 620,
        duration: visible ? 300 : 220,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 180, useNativeDriver: true })
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, translateY, backdropOpacity]);

  if (!onboarding || !mounted) return null;

  const { progress, checklistTasks, completeTask, dismissChecklist, setChecklistSheetOpen } = onboarding;
  if (!progress) return null;

  const close = () => setChecklistSheetOpen(false);
  const doneCount = checklistTasks.filter((t) => {
    const s = progress.checklist.items[t.key]?.status;
    return s === 'completed' || s === 'skipped';
  }).length;
  const total = checklistTasks.length;
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close checklist" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>

          <View style={styles.header}>
            <View style={[styles.headerRing, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.06) }]}>
              <ProgressRing
                fraction={total ? doneCount / total : 0}
                size={40}
                stroke={4}
                trackColor={alpha(colors.primary, isDark ? 0.25 : 0.14)}
                fillColor={colors.primary}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Set up BillJi your way</Text>
              <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                {doneCount === total ? 'All done — nice work!' : `You're ${doneCount} of ${total} there`}
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {checklistTasks.map((task) => {
              const status = progress.checklist.items[task.key]?.status;
              const done = status === 'completed' || status === 'skipped';
              return (
                <Pressable
                  key={task.key}
                  disabled={done}
                  onPress={() => {
                    if (task.key === 'viewer_tip') {
                      completeTask('viewer_tip', 'action');
                      return;
                    }
                    close();
                    navigateToTask(navigation, task);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: done ? alpha(colors.accent, isDark ? 0.1 : 0.06) : isDark ? colors.surface : '#FFFFFF',
                      borderColor: done ? alpha(colors.accent, 0.3) : cardBorder,
                      opacity: pressed ? 0.85 : 1
                    }
                  ]}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: done ? alpha(colors.accent, 0.16) : alpha(colors.primary, isDark ? 0.18 : 0.08) }
                    ]}
                  >
                    {done ? (
                      <Reanimated.View entering={ZoomIn.springify().damping(14)}>
                        <Feather name="check" size={17} color={colors.accent} />
                      </Reanimated.View>
                    ) : (
                      <MaterialCommunityIcons name={task.icon} size={17} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowTitle,
                        { color: theme.colors.onSurface, opacity: done ? 0.6 : 1, textDecorationLine: done ? 'line-through' : 'none' }
                      ]}
                    >
                      {task.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: theme.colors.onSurfaceVariant, opacity: done ? 0.7 : 1 }]}>
                      {task.subtitle}
                    </Text>
                  </View>
                  {!done && task.optional ? (
                    <Pressable onPress={() => completeTask(task.key, 'skipped')} hitSlop={8} style={styles.skipBtn}>
                      <Text style={[styles.skipText, { color: theme.colors.onSurfaceVariant }]}>Skip</Text>
                    </Pressable>
                  ) : null}
                  {!done && task.navigate ? (
                    <Feather name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable onPress={dismissChecklist} style={styles.hideRow} hitSlop={4}>
              <Text style={[styles.hideText, { color: theme.colors.onSurfaceVariant }]}>
                Hide checklist — reopen anytime from Settings → Help
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 10 },
  headerRing: { alignItems: 'center', borderRadius: radii.pill, height: 52, justifyContent: 'center', width: 52 },
  headerText: { flex: 1, minWidth: 0 },
  hideRow: { alignItems: 'center', marginTop: 4, paddingVertical: 12 },
  hideText: { ...typeScale.caption, fontSize: 12.5 },
  row: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 13 },
  rowIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  rowSub: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.semiBold, fontSize: 14 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '78%',
    paddingTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  skipBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  skipText: { ...fontStyles.medium, fontSize: 12 },
  subtitle: { ...typeScale.caption, fontSize: 13, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 17, letterSpacing: -0.3 }
});
