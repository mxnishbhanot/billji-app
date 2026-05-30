import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { auditApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { AuditLogEntry } from '@/types';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

const humanizeAction = (action: string) => action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const actorName = (user: AuditLogEntry['user']) => (user && typeof user === 'object' ? user.name || user.email || null : null);
const datetime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return `${formatDate(value)} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export function ActivityLogScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const query = useInfiniteQuery({
    queryKey: queryKeys.audit.list({}),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => auditApi.page({ page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });
  const logs = useMemo(() => query.data?.pages.flatMap((page) => page.auditLogs) ?? [], [query.data]);
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage();
  };

  const renderRow = ({ item }: { item: AuditLogEntry }) => {
    const meta = [actorName(item.user), item.resourceType, datetime(item.createdAt)].filter(Boolean).join('  ·  ');
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
        <View style={[styles.iconTile, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
          <Feather name="activity" size={15} color={theme.colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>{humanizeAction(item.action)}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{meta}</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen title="Activity log" scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !logs.length && styles.emptyListContent]}
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => query.refetch()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        ListEmptyComponent={query.isLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No activity yet" message="Account and financial actions are recorded here as they happen." />}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} /> : null}
        renderItem={renderRow}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  emptyListContent: { flexGrow: 1 },
  emptyLoader: { marginTop: 40 },
  flex1: { flex: 1, minWidth: 0 },
  footerLoader: { marginVertical: 16 },
  iconTile: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  screenContent: { flex: 1 },
  title: { ...fontStyles.semiBold, fontSize: 14 }
});
