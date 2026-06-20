import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { describeDevice, formatRelativeTime } from '@/utils/format';
import { UserSession } from '@/types';

type Props = {
  visible: boolean;
  sessions?: UserSession[];
  loading?: boolean;
  revokingId?: string | null;
  onRevoke: (id: string) => void;
  onClose: () => void;
};

export function SecuritySessionsSheet({ visible, sessions, loading, revokingId, onRevoke, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel(
      visible
        ? [
            Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
          ]
        : [
            Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
          ]
    ).start();
  }, [visible, translateY, backdropOpacity]);

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const rowBg = isDark ? colors.surface : alpha(colors.primaryStrong, 0.04);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 16 + insets.bottom, transform: [{ translateY }] }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Where you&apos;re signed in</Text>
              <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Tap sign out to remove a device you don&apos;t recognise.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primaryStrong, isDark ? 0.24 : 0.06) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}

            {sessions?.map((session) => {
              const device = describeDevice(session.userAgent, session.deviceName);
              const revoking = revokingId === session.id;
              return (
                <View key={session.id} style={[styles.row, { backgroundColor: rowBg, borderColor: cardBorder }]}>
                  <View style={[styles.deviceIcon, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.1) }]}>
                    <Feather name={device.icon} size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={[styles.deviceName, { color: theme.colors.onSurface }]}>{device.name}</Text>
                    <Text numberOfLines={1} style={[styles.deviceMeta, { color: theme.colors.onSurfaceVariant }]}>
                      {session.current ? 'This device' : `Last active ${formatRelativeTime(session.lastUsedAt)}`}
                      {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                    </Text>
                  </View>
                  {session.current ? (
                    <View style={[styles.currentPill, { backgroundColor: alpha(colors.accent, isDark ? 0.24 : 0.12) }]}>
                      <Text style={[styles.currentPillText, { color: colors.accent }]}>Now</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => onRevoke(session.id)}
                      disabled={revoking}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.revokeBtn,
                        {
                          backgroundColor: alpha(theme.colors.error, isDark ? (pressed ? 0.3 : 0.2) : pressed ? 0.14 : 0.08),
                          borderColor: alpha(theme.colors.error, isDark ? 0.45 : 0.28)
                        }
                      ]}
                    >
                      {revoking ? (
                        <ActivityIndicator size={14} color={theme.colors.error} />
                      ) : (
                        <Text style={[styles.revokeLabel, { color: theme.colors.error }]}>Sign out</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}

            {!loading && !sessions?.length ? (
              <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>No active devices found.</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  content: { paddingBottom: 8, paddingHorizontal: 18, paddingTop: 8 },
  currentPill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentPillText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.2 },
  deviceIcon: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  deviceMeta: { ...fontStyles.regular, fontSize: 12, marginTop: 2 },
  deviceName: { ...fontStyles.semiBold, fontSize: 14 },
  empty: { paddingVertical: 24, textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  headerText: { flex: 1, minWidth: 0 },
  loader: { paddingVertical: 24 },
  revokeBtn: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minWidth: 78, paddingHorizontal: 12, paddingVertical: 8 },
  revokeLabel: { ...fontStyles.semiBold, fontSize: 13 },
  row: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 12 },
  rowText: { flex: 1, minWidth: 0 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '85%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  subtitle: { ...fontStyles.regular, fontSize: 12, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
