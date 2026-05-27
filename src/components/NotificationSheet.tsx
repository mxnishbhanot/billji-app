import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { NotificationItem } from '@/types';
import { formatDate } from '@/utils/format';

type Props = {
  visible: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  loading?: boolean;
  errorMessage?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onDismiss: (notification: NotificationItem) => void;
  onLoadMore: () => void;
  onPressNotification: (notification: NotificationItem) => void;
};

const toneMeta = (notification: NotificationItem, colors: ReturnType<typeof appColors>) => {
  if (notification.type.includes('stock')) {
    return { icon: 'package' as const, color: notification.tone === 'danger' ? colors.destructive : colors.warning, label: 'Stock' };
  }
  if (notification.type.includes('invoice')) {
    return { icon: 'file-text' as const, color: notification.tone === 'danger' ? colors.destructive : colors.primary, label: 'Invoice' };
  }
  if (notification.type.includes('tip')) {
    return { icon: 'zap' as const, color: colors.accent, label: 'Tip' };
  }
  return { icon: 'bell' as const, color: notification.tone === 'warning' ? colors.warning : colors.primary, label: 'Alert' };
};

export function NotificationSheet({
  visible,
  notifications,
  unreadCount,
  loading = false,
  errorMessage,
  hasMore = false,
  loadingMore = false,
  onClose,
  onMarkAllRead,
  onDismiss,
  onLoadMore,
  onPressNotification
}: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const newNotifications = useMemo(() => notifications.filter((notification) => !notification.read), [notifications]);
  const earlierNotifications = useMemo(() => notifications.filter((notification) => notification.read), [notifications]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 700, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const renderNotification = (notification: NotificationItem) => {
    const meta = toneMeta(notification, colors);
    const unread = !notification.read;

    return (
      <Pressable
        key={notification.id}
        onPress={() => onPressNotification(notification)}
        style={({ pressed }) => [
          styles.notificationCard,
          {
            backgroundColor: pressed ? alpha(meta.color, isDark ? 0.16 : 0.08) : isDark ? alpha(colors.surface, 0.78) : colors.card,
            borderColor: unread ? alpha(meta.color, isDark ? 0.48 : 0.28) : isDark ? colors.border : alpha(colors.primaryStrong, 0.1)
          }
        ]}
      >
        <View style={[styles.iconBubble, { backgroundColor: alpha(meta.color, isDark ? 0.22 : 0.12) }]}>
          <Feather name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={styles.notificationBody}>
          <View style={styles.notificationTitleRow}>
            <Text numberOfLines={1} style={[styles.notificationTitle, { color: theme.colors.onSurface }]}>{notification.title}</Text>
            {unread ? <View style={[styles.unreadDot, { backgroundColor: meta.color }]} /> : null}
          </View>
          <Text numberOfLines={2} style={[styles.notificationDescription, { color: theme.colors.onSurfaceVariant }]}>{notification.description}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: meta.color }]}>{meta.label}</Text>
            {notification.sortDate ? <Text style={[styles.metaDate, { color: theme.colors.onSurfaceVariant }]}>{formatDate(notification.sortDate)}</Text> : null}
          </View>
        </View>
        <Pressable onPress={() => onDismiss(notification)} hitSlop={8} style={[styles.dismissBtn, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.05) }]}>
          <Feather name="x" size={14} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </Pressable>
    );
  };

  const renderSection = (title: string, items: NotificationItem[]) => {
    if (!items.length) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
        <View style={styles.notificationStack}>{items.map(renderNotification)}</View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.6)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1),
              paddingBottom: 14 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Notifications</Text>
              <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                {unreadCount ? `${unreadCount} new update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
              </Text>
            </View>
            {unreadCount ? (
              <Pressable onPress={onMarkAllRead} style={[styles.markAllBtn, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.12) }]}>
                <Feather name="check-circle" size={14} color={theme.colors.primary} />
                <Text style={[styles.markAllText, { color: theme.colors.primary }]}>Mark all read</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.06) }]}>
              <Feather name="x" size={18} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {errorMessage ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMessage}</Text> : null}
              {!notifications.length && !errorMessage ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIcon, { backgroundColor: alpha(colors.accent, isDark ? 0.2 : 0.1) }]}>
                    <Feather name="check-circle" size={28} color={colors.accent} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>You are all caught up</Text>
                  <Text style={[styles.emptyMessage, { color: theme.colors.onSurfaceVariant }]}>We will notify you about low stock, invoice follow-ups, and useful business tips.</Text>
                </View>
              ) : null}
              {renderSection('New', newNotifications)}
              {renderSection('Earlier', earlierNotifications)}
              {hasMore ? (
                <Pressable onPress={onLoadMore} disabled={loadingMore} style={[styles.loadMoreBtn, { borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.14) }]}>
                  {loadingMore ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text style={[styles.loadMoreText, { color: theme.colors.primary }]}>Load older notifications</Text>}
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  dismissBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  emptyIcon: { alignItems: 'center', borderRadius: radii.pill, height: 62, justifyContent: 'center', marginBottom: 14, width: 62 },
  emptyMessage: { ...typeScale.caption, maxWidth: 260, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 34 },
  emptyTitle: { ...fontStyles.bold, fontSize: 16, marginBottom: 6 },
  errorText: { ...typeScale.caption, marginBottom: 12, textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingBottom: 12, paddingTop: 10 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 36 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 12, paddingHorizontal: 18 },
  headerTitleBlock: { flex: 1, minWidth: 0 },
  iconBubble: { alignItems: 'center', borderRadius: radii.md, height: 38, justifyContent: 'center', width: 38 },
  loader: { marginVertical: 36 },
  loadMoreBtn: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', marginTop: 6, minHeight: 42 },
  loadMoreText: { ...fontStyles.bold, fontSize: 13 },
  markAllBtn: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  markAllText: { ...fontStyles.bold, fontSize: 11 },
  metaDate: { ...typeScale.caption, fontSize: 11 },
  metaLabel: { ...fontStyles.bold, fontSize: 11 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  notificationBody: { flex: 1, minWidth: 0 },
  notificationCard: { alignItems: 'flex-start', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  notificationDescription: { ...typeScale.caption, fontSize: 12, marginTop: 3 },
  notificationStack: { gap: 10 },
  notificationTitle: { ...fontStyles.bold, flex: 1, fontSize: 13 },
  notificationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scrollContent: { paddingBottom: 8, paddingHorizontal: 18 },
  section: { marginBottom: 16 },
  sectionLabel: { ...typeScale.eyebrow, marginBottom: 9 },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: 1, maxHeight: '84%', paddingTop: 2 },
  subtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  unreadDot: { borderRadius: radii.pill, height: 8, width: 8 }
});
