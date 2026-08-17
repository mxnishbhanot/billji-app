import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, ChevronDown, Search } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import { IconButton } from '@/components/dashboard/IconButton';
import { NotificationButton } from '@/components/NotificationButton';
import { QuickActionsSheet } from '@/components/QuickActionsSheet';
import { AppNavigation } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

const greetingForHour = (hour: number) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatDateChip = (date: Date) => {
  const day = date.getDate();
  const month = date.toLocaleString('en-IN', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
};

type Props = {
  headline?: string;
};

export const DashboardHeader = memo(function DashboardHeader({
  headline = "Here's your business today"
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const navigation = useNavigation<AppNavigation>();
  const user = useAuthStore((state) => state.user);
  const businessProfile = user?.businessProfile;
  const [quickOpen, setQuickOpen] = useState(false);

  const firstName = useMemo(() => {
    const raw = user?.name?.trim() || businessProfile?.businessName?.trim() || 'there';
    return raw.split(/\s+/)[0];
  }, [businessProfile?.businessName, user?.name]);

  const greeting = useMemo(() => `${greetingForHour(new Date().getHours())}, ${firstName} 👋`, [firstName]);
  const dateLabel = useMemo(() => formatDateChip(new Date()), []);

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <View style={styles.greetingBlock}>
          <Text style={[styles.greeting, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {greeting}
          </Text>
        </View>
        <View style={styles.actions}>
          <IconButton
            icon={Search}
            accessibilityLabel="Search or create"
            onPress={() => setQuickOpen(true)}
          />
          <View style={styles.notifWrap}>
            <NotificationButton />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile settings"
            hitSlop={8}
            onPress={() => navigation.navigate('SettingsTab', { screen: 'SettingsHome' })}
            style={({ pressed }) => [
              styles.avatar,
              shadows.card,
              {
                borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.07),
                opacity: pressed ? 0.85 : 1,
                backgroundColor: alpha(colors.primary, theme.dark ? 0.2 : 0.1)
              }
            ]}
          >
            {businessProfile?.logoUrl ? (
              <Image source={{ uri: businessProfile.logoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                {(firstName[0] || 'B').toUpperCase()}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.headlineRow}>
        <Text style={[styles.headline, { color: theme.colors.onSurface }]}>{headline}</Text>
        <View
          style={[
            styles.dateChip,
            {
              backgroundColor: colors.card,
              borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.08)
            }
          ]}
        >
          <Calendar size={13} color={colors.primaryStrong} strokeWidth={2.2} />
          <Text style={[styles.dateText, { color: theme.colors.onSurface }]}>{dateLabel}</Text>
          <ChevronDown size={13} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
        </View>
      </View>

      <QuickActionsSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </View>
  );
});

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  avatar: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42
  },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { ...fontStyles.bold, fontSize: 16 },
  dateChip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  dateText: { ...fontStyles.semiBold, fontSize: 11.5, letterSpacing: -0.1 },
  greeting: { ...fontStyles.medium, fontSize: 14, letterSpacing: -0.1 },
  greetingBlock: { flex: 1, minWidth: 0, paddingRight: 8 },
  headline: {
    ...fontStyles.bold,
    flex: 1,
    fontSize: 27,
    letterSpacing: -0.8,
    lineHeight: 33,
    minWidth: 0,
    paddingRight: 12
  },
  headlineRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  notifWrap: { marginLeft: 0 },
  root: { marginBottom: 18, paddingTop: 2 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }
});
