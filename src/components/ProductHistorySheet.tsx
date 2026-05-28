import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Product, ProductStockHistory, StockMovement } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

type Props = {
  visible: boolean;
  product: Product | null;
  history?: ProductStockHistory;
  loading?: boolean;
  onClose: () => void;
};

const compactCurrency = (value?: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100000) return `${formatCurrency(amount / 100000).replace(/\.00$/, '')}L`;
  if (Math.abs(amount) >= 1000) return `${formatCurrency(amount / 1000).replace(/\.00$/, '')}K`;
  return formatCurrency(amount).replace(/\.00$/, '');
};

const movementTone = (type: string, colors: ReturnType<typeof appColors>, isDark: boolean) => {
  if (type === 'sale') return { icon: 'shopping-cart' as const, color: colors.primary, background: alpha(colors.primary, isDark ? 0.2 : 0.12) };
  if (type === 'oversell') return { icon: 'alert-circle' as const, color: colors.warning, background: alpha(colors.warning, isDark ? 0.22 : 0.12) };
  if (type === 'sale_cancelled' || type === 'invoice_deleted' || type === 'return') return { icon: 'rotate-ccw' as const, color: colors.destructive, background: alpha(colors.destructive, isDark ? 0.2 : 0.1) };
  if (type === 'manual_adjustment') return { icon: 'tag' as const, color: colors.warning, background: alpha(colors.warning, isDark ? 0.22 : 0.12) };
  if (type === 'stock_correction') return { icon: 'tool' as const, color: colors.warning, background: alpha(colors.warning, isDark ? 0.22 : 0.12) };
  return { icon: 'package' as const, color: colors.accent, background: alpha(colors.accent, isDark ? 0.2 : 0.1) };
};

const movementTitle = (movement: StockMovement) => {
  const quantity = Math.abs(Number(movement.quantityChange || 0));
  if (movement.type === 'sale') return `Sold ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  if (movement.type === 'oversell') return `Oversold ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  if (movement.type === 'sale_cancelled' || movement.type === 'invoice_deleted') return `Returned ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  if (movement.type === 'return') return `Return ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  if (movement.type === 'manual_adjustment') return 'Stock updated';
  if (movement.type === 'stock_correction') return 'Stock corrected';
  if (movement.type === 'opening_stock' || movement.type === 'initial_stock') return 'Opening stock added';
  if (movement.type === 'purchase') return `Purchased ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  return movement.type.replace(/_/g, ' ');
};

const movementSubtitle = (movement: StockMovement) => {
  const invoiceText = [movement.documentNumber || movement.invoiceNumber, movement.customerName].filter(Boolean).join(' · ');
  if (invoiceText) return invoiceText;
  return movement.note || `Stock ${movement.stockBefore} to ${movement.stockAfter}`;
};

export function ProductHistorySheet({ visible, product, history, loading = false, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const sheetProduct = history?.product ?? product;
  const summary = history?.summary ?? { quantitySold: product?.quantitySold ?? 0, revenue: product?.totalSales ?? 0, orderCount: 0 };
  const movements = history?.movements ?? [];

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

  const renderMovement = (movement: StockMovement, index: number) => {
    const tone = movementTone(movement.type, colors, isDark);
    const amount = Number(movement.invoiceTotalForProduct || 0);

    return (
      <View key={movement._id} style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineIcon, { backgroundColor: tone.background, borderColor: alpha(tone.color, 0.42) }]}>
            <Feather name={tone.icon} size={13} color={tone.color} />
          </View>
          {index < movements.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.16) }]} /> : null}
        </View>
        <View style={[styles.movementCard, { backgroundColor: isDark ? alpha(colors.surface, 0.74) : alpha(colors.primaryStrong, 0.04), borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]}>
          <View style={styles.movementHeader}>
            <View style={styles.movementTextBlock}>
              <Text numberOfLines={1} style={[styles.movementTitle, { color: theme.colors.onSurface }]}>{movementTitle(movement)}</Text>
              <Text numberOfLines={1} style={[styles.movementSubtitle, { color: theme.colors.onSurfaceVariant }]}>{movementSubtitle(movement)}</Text>
            </View>
            {amount ? (
              <View style={[styles.amountPill, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.12) }]}>
                <Text style={[styles.amountPillText, { color: theme.colors.primary }]}>{compactCurrency(amount)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.movementMetaRow}>
            <Feather name="clock" size={12} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.movementDate, { color: theme.colors.onSurfaceVariant }]}>{formatDate(movement.createdAt)}</Text>
            <Text style={[styles.stockDelta, { color: theme.colors.onSurfaceVariant }]}>Stock {movement.stockBefore} to {movement.stockAfter}</Text>
          </View>
        </View>
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
            <View style={[styles.productIcon, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.24 : 0.12) }]}>
              <MaterialCommunityIcons name="briefcase-outline" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.titleBlock}>
              <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>{sheetProduct?.name || 'Product history'}</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                {formatCurrency(sheetProduct?.price)} · {sheetProduct?.stockQuantity ?? 0} in stock
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.06) }]}>
              <Feather name="x" size={18} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <View style={[styles.statsCard, { borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>{summary.quantitySold}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Total sold</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{compactCurrency(summary.revenue)}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Revenue</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{summary.orderCount}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Orders</Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>Activity history</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.timelineContent}>
              {movements.length ? movements.map(renderMovement) : (
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No stock movements yet</Text>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amountPill: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  amountPillText: { ...fontStyles.bold, fontSize: 11 },
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  emptyText: { ...typeScale.caption, marginVertical: 28, textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingBottom: 12, paddingTop: 10 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 36 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16, paddingHorizontal: 18 },
  loader: { marginVertical: 32 },
  movementCard: { borderRadius: radii.md, borderWidth: 1, flex: 1, padding: 12 },
  movementDate: { ...typeScale.caption, fontSize: 11 },
  movementHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  movementMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 8 },
  movementSubtitle: { ...fontStyles.medium, fontSize: 12, marginTop: 2 },
  movementTextBlock: { flex: 1, minWidth: 0 },
  movementTitle: { ...fontStyles.bold, fontSize: 13 },
  productIcon: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  sectionLabel: { ...typeScale.eyebrow, marginBottom: 12, marginHorizontal: 18 },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: 1, maxHeight: '84%', paddingTop: 2 },
  statDivider: { alignSelf: 'stretch', width: 1 },
  statItem: { alignItems: 'center', flex: 1, paddingVertical: 12 },
  statLabel: { ...typeScale.caption, fontSize: 11, marginTop: 3 },
  statsCard: { borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', marginBottom: 18, marginHorizontal: 18, overflow: 'hidden' },
  statValue: { ...fontStyles.bold, fontSize: 19, letterSpacing: -0.3 },
  stockDelta: { ...typeScale.caption, fontSize: 11, marginLeft: 'auto' },
  subtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  timelineContent: { paddingBottom: 8, paddingHorizontal: 18 },
  timelineIcon: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  timelineLine: { flex: 1, marginVertical: 4, width: 1 },
  timelineRail: { alignItems: 'center', width: 30 },
  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 10, minHeight: 86 },
  title: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.2 },
  titleBlock: { flex: 1, minWidth: 0 }
});
