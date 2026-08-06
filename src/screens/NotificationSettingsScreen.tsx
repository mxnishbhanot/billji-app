import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch, Text, useTheme } from 'react-native-paper';
import { notificationsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { Screen } from '@/components/Screen';
import {
  NOTIFICATION_MODULES,
  NotificationModule,
  isModuleEnabled,
  isTypeEnabled,
  setModuleEnabled,
  setTypeEnabled
} from '@/constants/notifications';
import { PushStatus, getPushStatus } from '@/services/push';
import { queryKeys } from '@/shared/query/queryKeys';
import { NotificationPreferences } from '@/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

const MODULE_COLOR_KEYS = ['primary', 'accent', 'warning', 'violet', 'primaryStrong'] as const;

// Push is granted through the OS, not a switch in here — this row reports what actually
// happened and sends the user to the one place that can change it.
const PUSH_STATUS_COPY: Record<PushStatus, { label: string; hint: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; colorKey: 'violet' | 'accent' | 'warning' | 'destructive' }> = {
  registered: { label: 'On', hint: 'This device gets alerts even when the app is closed', icon: 'cellphone-message', colorKey: 'accent' },
  denied: { label: 'Blocked', hint: 'Notifications are turned off for Billji — tap to open phone settings', icon: 'bell-off-outline', colorKey: 'warning' },
  failed: { label: 'Not connected', hint: 'Could not reach the notification service — tap to check phone settings', icon: 'bell-alert-outline', colorKey: 'destructive' },
  unsupported: { label: 'Unavailable', hint: 'Push needs the installed app — not available on web', icon: 'cellphone-off', colorKey: 'violet' },
  unknown: { label: 'Not set up', hint: 'Sign in again or tap to check phone settings', icon: 'bell-outline', colorKey: 'violet' }
};

function SectionCard({
  module,
  color,
  prefs,
  onToggleModule,
  onToggleType,
  cardBorder,
  isDark
}: {
  module: NotificationModule;
  color: string;
  prefs: NotificationPreferences;
  onToggleModule: (module: NotificationModule, value: boolean) => void;
  onToggleType: (type: string, value: boolean) => void;
  cardBorder: string;
  isDark: boolean;
}) {
  const theme = useTheme();
  const colors = appColors(isDark);
  const moduleOn = isModuleEnabled(prefs, module);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: alpha(color, isDark ? 0.22 : 0.12) }]}>
          <MaterialCommunityIcons name={module.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={color} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{module.label}</Text>
          <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            {moduleOn ? 'All alerts on' : 'Some alerts muted'}
          </Text>
        </View>
        <Switch value={moduleOn} onValueChange={(value) => onToggleModule(module, value)} color={theme.colors.primary} />
      </View>
      {module.types.map((entry) => (
        <View key={entry.type}>
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          <View style={[styles.row, styles.childRow]}>
            <View style={styles.rowText}>
              <Text style={[styles.childTitle, { color: theme.colors.onSurface }]}>{entry.label}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>{entry.description}</Text>
            </View>
            <Switch
              value={isTypeEnabled(prefs, entry.type)}
              onValueChange={(value) => onToggleType(entry.type, value)}
              color={theme.colors.primary}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();

  // Registration happens once per session in AppNavigator, so the status is settled by the
  // time this screen opens. Re-checked on focus because the user may have just come back
  // from granting the permission in the OS settings.
  const [pushStatus, setPushStatus] = useState<PushStatus>(getPushStatus);
  useFocusEffect(useCallback(() => setPushStatus(getPushStatus()), []));
  const push = PUSH_STATUS_COPY[pushStatus];

  const preferencesQuery = useQuery({
    queryKey: queryKeys.notifications.preferences,
    queryFn: notificationsApi.getPreferences
  });
  const prefs = preferencesQuery.data ?? {};

  const save = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onMutate: async (next: NotificationPreferences) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.preferences });
      const previous = queryClient.getQueryData<NotificationPreferences>(queryKeys.notifications.preferences);
      queryClient.setQueryData(queryKeys.notifications.preferences, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications.preferences, context.previous);
      showDialog({ title: 'Could not update notifications', message: apiErrorMessage(error), tone: 'error' });
    },
    onSettled: () => {
      // Invalidating the root notifications key refreshes the bell badge, sheet, and preferences.
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    }
  });

  const onToggleType = (type: string, value: boolean) => save.mutate(setTypeEnabled(prefs, type, value));
  const onToggleModule = (module: NotificationModule, value: boolean) => save.mutate(setModuleEnabled(prefs, module, value));

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Notifications" contentStyle={styles.screenContent}>
      <View
        style={[
          styles.banner,
          { backgroundColor: alpha(colors.primary, isDark ? 0.14 : 0.07), borderColor: alpha(colors.primary, isDark ? 0.3 : 0.16) }
        ]}
      >
        <View style={[styles.bannerIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.26 : 0.14) }]}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.bannerTitle, { color: theme.colors.primary }]}>In-app alerts</Text>
          <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Choose which alerts show up in your notification panel
          </Text>
        </View>
      </View>

      {NOTIFICATION_MODULES.map((module, index) => (
        <SectionCard
          key={module.key}
          module={module}
          color={colors[MODULE_COLOR_KEYS[index % MODULE_COLOR_KEYS.length]]}
          prefs={prefs}
          onToggleModule={onToggleModule}
          onToggleType={onToggleType}
          cardBorder={cardBorder}
          isDark={isDark}
        />
      ))}

      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PUSH NOTIFICATIONS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Pressable
          style={styles.row}
          disabled={pushStatus === 'registered'}
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel={`Push notifications: ${push.label}. ${push.hint}`}
        >
          <View style={[styles.icon, { backgroundColor: alpha(colors[push.colorKey], isDark ? 0.22 : 0.12) }]}>
            <MaterialCommunityIcons name={push.icon} size={18} color={colors[push.colorKey]} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>Push notifications</Text>
            <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>{push.hint}</Text>
          </View>
          {pushStatus === 'registered' ? (
            <MaterialCommunityIcons name="check-circle" size={20} color={colors.accent} />
          ) : (
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 18, padding: 14 },
  bannerIcon: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  bannerTitle: { ...fontStyles.bold, fontSize: 14 },
  card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 14 },
  childRow: { paddingLeft: 60 },
  childTitle: { ...fontStyles.semiBold, fontSize: 13 },
  icon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider: { height: 1, marginLeft: 60 },
  rowSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14 },
  screenContent: { paddingTop: 8 },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2, marginTop: 4 }
});
