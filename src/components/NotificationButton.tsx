import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Appbar, Badge, Button, Dialog, List, Portal, Text, useTheme } from 'react-native-paper';
import { notificationsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { connectSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, radii } from '@/theme/theme';
import { NotificationItem } from '@/types';

const PAGE_SIZE = 10;
export function NotificationButton() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const token = useAuthStore((state) => state.token);
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({ queryKey: ['notifications'], enabled: Boolean(token), initialPageParam: 1, queryFn: ({ pageParam }) => notificationsApi.page({ page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });

  useEffect(() => {
    if (!token) return undefined;
    return connectSocket(token, (event) => {
      if (event.includes('notifications')) void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (event.includes('products')) void queryClient.invalidateQueries({ queryKey: ['products'] });
      if (event.includes('customers')) void queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (event.includes('invoices')) void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });
    });
  }, [queryClient, token]);

  const notifications = useMemo(() => query.data?.pages.flatMap((page) => page.notifications) ?? [], [query.data]);
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const markSeen = useMutation({ mutationFn: (ids: string[]) => notificationsApi.markSeen(ids), onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const openPanel = () => {
    setOpen(true);
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    if (unreadIds.length) markSeen.mutate(unreadIds);
  };
  const navigateToNotification = (notification: NotificationItem) => {
    setOpen(false);
    markSeen.mutate([notification.id]);
    if (notification.resourceType === 'invoice') navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: notification.resourceId } });
    else navigation.navigate('CatalogTab', { screen: 'Products', params: { highlight: notification.resourceId } });
  };
  return (
    <>
      <View style={[styles.actionWrap, { backgroundColor: theme.dark ? alpha(colors.primary, 0.14) : 'transparent', borderColor: theme.dark ? alpha(colors.primary, 0.24) : 'transparent' }]}>
        <Appbar.Action icon={({ size, color }) => <Feather name="bell" size={size} color={color} />} onPress={openPanel} color={theme.colors.primary} style={styles.action} />
        {unreadCount > 0 ? <Badge style={[styles.badge, { backgroundColor: colors.destructive }]}>{unreadCount > 9 ? '9+' : unreadCount}</Badge> : null}
      </View>
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={{ maxHeight: '82%' }}>
          <Dialog.Title>Notifications</Dialog.Title>
          <Dialog.Content>
            {query.error ? <Text>{apiErrorMessage(query.error, 'Could not load notifications')}</Text> : null}
            {!notifications.length && !query.isLoading ? <Text>No low stock, oversold stock, or invoice follow-ups right now.</Text> : null}
            <FlatList data={notifications} keyExtractor={(item) => item.id} onEndReached={() => query.hasNextPage && query.fetchNextPage()} renderItem={({ item }) => (
              <List.Item title={item.title} description={item.description} onPress={() => navigateToNotification(item)} left={(props) => <List.Icon {...props} icon={item.tone === 'danger' ? 'alert-circle' : item.tone === 'warning' ? 'alert' : 'information'} />} right={(props) => <List.Icon {...props} icon={item.read ? 'chevron-right' : 'circle-small'} />} />
            )} />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setOpen(false)}>Close</Button></Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

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
