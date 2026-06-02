import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Appbar, Badge, useTheme } from 'react-native-paper';
import { notificationsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { NotificationSheet } from '@/components/NotificationSheet';
import { AppNavigation } from '@/navigation/types';
import { connectSocket } from '@/services/socket';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, radii } from '@/theme/theme';
import { NotificationItem } from '@/types';

const PAGE_SIZE = 10;
// Memoized: header parents re-render on every draft/keystroke state change and the
// inline icon render-prop would otherwise redraw (visibly blink) the bell each time.
export const NotificationButton = memo(function NotificationButton() {
  const navigation = useNavigation<AppNavigation>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const token = useAuthStore((state) => state.token);
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({ queryKey: queryKeys.notifications.all, enabled: Boolean(token), initialPageParam: 1, queryFn: ({ pageParam }) => notificationsApi.page({ page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });

  useEffect(() => {
    if (!token) return undefined;
    return connectSocket(token, (event) => {
      if (event.includes('notifications')) void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      if (event.includes('products')) void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (event.includes('customers')) void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      if (event.includes('invoices')) void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
    });
  }, [queryClient, token]);

  const notifications = useMemo(() => query.data?.pages.flatMap((page) => page.notifications) ?? [], [query.data]);
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const markSeen = useMutation({ mutationFn: ({ ids, all = false }: { ids: string[]; all?: boolean }) => notificationsApi.markSeen(ids, all), onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }) });
  const dismiss = useMutation({ mutationFn: (ids: string[]) => notificationsApi.dismiss(ids), onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }) });
  const openPanel = () => setOpen(true);
  const markAllRead = () => markSeen.mutate({ ids: [], all: true });
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };
  const navigateToNotification = (notification: NotificationItem) => {
    setOpen(false);
    markSeen.mutate({ ids: [notification.id] });
    if (notification.resourceType === 'invoice') navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: notification.resourceId } });
    else if (notification.resourceType === 'product') navigation.navigate('CatalogTab', { screen: 'Products', params: { highlight: notification.resourceId } });
    else if (notification.resourceType === 'customer') navigation.navigate('CustomersTab', { screen: 'Customers' });
  };
  return (
    <>
      <View style={[styles.actionWrap, { backgroundColor: theme.dark ? alpha(colors.primary, 0.14) : 'transparent', borderColor: theme.dark ? alpha(colors.primary, 0.24) : 'transparent' }]}>
        <Appbar.Action icon={({ size, color }) => <Feather name="bell" size={size} color={color} />} onPress={openPanel} color={theme.colors.primary} style={styles.action} />
        {unreadCount > 0 ? <Badge style={[styles.badge, { backgroundColor: colors.destructive }]}>{unreadCount > 9 ? '9+' : unreadCount}</Badge> : null}
      </View>
      <NotificationSheet
        visible={open}
        notifications={notifications}
        unreadCount={unreadCount}
        loading={query.isLoading}
        errorMessage={query.error ? apiErrorMessage(query.error, 'Could not load notifications') : undefined}
        hasMore={Boolean(query.hasNextPage)}
        loadingMore={query.isFetchingNextPage}
        onClose={() => setOpen(false)}
        onMarkAllRead={markAllRead}
        onDismiss={(notification) => dismiss.mutate([notification.id])}
        onLoadMore={loadMore}
        onPressNotification={navigateToNotification}
      />
    </>
  );
});

const styles = StyleSheet.create({
  action: { margin: 0 },
  actionWrap: {
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginLeft: 8,
    width: 44
  },
  badge: { position: 'absolute', right: -2, top: -4 }
});
