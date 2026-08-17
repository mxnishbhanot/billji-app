import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, FileText, List } from 'lucide-react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, spacing } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';
import { Invoice } from '@/types';

const activityTime = (value?: string | Date | null) => {
  if (!value) return 'Just now';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return formatDate(value);
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${time} · ${day}`;
};

type EmptyProps = {
  canCreateInvoice?: boolean;
  onCreateInvoice?: () => void;
};

export const ActivityEmptyState = memo(function ActivityEmptyState({ canCreateInvoice, onCreateInvoice }: EmptyProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);

  return (
    <View style={[styles.emptyCard, shadows.card, { backgroundColor: colors.card, borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06) }]}>
      <Svg width={116} height={112} viewBox="0 0 116 112">
        <G transform="rotate(-8 40 56)">
          <Rect
            x={14}
            y={22}
            width={50}
            height={64}
            rx={10}
            fill={alpha(colors.primary, 0.12)}
            stroke={alpha(colors.primary, 0.24)}
            strokeWidth={1.5}
          />
        </G>
        <G transform="rotate(5 70 56)">
          <Rect
            x={40}
            y={14}
            width={56}
            height={70}
            rx={12}
            fill={colors.card}
            stroke={alpha(colors.primary, 0.3)}
            strokeWidth={1.5}
          />
          <Rect x={52} y={28} width={26} height={6} rx={3} fill={alpha(colors.primary, 0.35)} />
          <Path
            d="M52 46 H84 M52 56 H78 M52 66 H70"
            stroke={alpha(colors.outline, 0.55)}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </G>
        <Circle cx={86} cy={84} r={17} fill={colors.card} />
        <Circle cx={86} cy={84} r={14} fill={colors.accent} />
        <Path
          d="M80 84 L84.5 88.5 L93 79"
          stroke="#FFFFFF"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No recent activity</Text>
      <Text style={[styles.emptyMessage, { color: theme.colors.onSurfaceVariant }]}>
        Create your first invoice to see activity here.
      </Text>
      {canCreateInvoice ? (
        <Pressable accessibilityRole="button" onPress={onCreateInvoice} style={styles.emptyCta}>
          <Text style={[styles.emptyCtaText, { color: colors.primary }]}>Create Invoice</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

type Props = {
  invoices: Invoice[];
  onViewAll: () => void;
  onPressInvoice: (id: string) => void;
  canCreateInvoice?: boolean;
  onCreateInvoice?: () => void;
};

export const RecentActivity = memo(function RecentActivity({
  invoices,
  onViewAll,
  onPressInvoice,
  canCreateInvoice,
  onCreateInvoice
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: alpha(colors.primaryStrong, theme.dark ? 0.22 : 0.12) }]}>
            <List size={17} color={colors.primaryStrong} strokeWidth={2.2} />
          </View>
          <View>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Recent activity</Text>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Latest invoices and payments</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={onViewAll} hitSlop={8} style={styles.viewAll}>
          <Text style={[styles.viewAllText, { color: colors.primaryStrong }]}>View all</Text>
          <ArrowUpRight size={14} color={colors.primaryStrong} strokeWidth={2.4} />
        </Pressable>
      </View>

      {invoices.length ? (
        invoices.slice(0, 5).map((invoice) => {
          const isPaid = invoice.status === 'paid' || invoice.paymentStatus === 'paid';
          const tileColor = isPaid ? alpha(colors.accent, theme.dark ? 0.2 : 0.12) : alpha(colors.primary, theme.dark ? 0.2 : 0.1);
          const iconColor = isPaid ? colors.accent : colors.primary;
          return (
            <Pressable
              key={invoice._id}
              accessibilityRole="button"
              onPress={() => onPressInvoice(invoice._id)}
              style={[
                styles.row,
                shadows.card,
                {
                  backgroundColor: colors.card,
                  borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06)
                }
              ]}
            >
              <View style={[styles.icon, { backgroundColor: tileColor }]}>
                <FileText size={16} color={iconColor} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>
                  {isPaid ? 'Payment received' : 'Invoice'} for {invoice.customerSnapshot.name} ({formatCurrency(invoice.total)})
                </Text>
                <Text style={[styles.rowTime, { color: theme.colors.onSurfaceVariant }]}>
                  {activityTime(invoice.createdAt || invoice.date)}
                </Text>
              </View>
            </Pressable>
          );
        })
      ) : (
        <ActivityEmptyState canCreateInvoice={canCreateInvoice} onCreateInvoice={onCreateInvoice} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  emptyCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 30
  },
  emptyCta: { justifyContent: 'center', marginTop: 10, minHeight: 44 },
  emptyCtaText: { ...fontStyles.bold, fontSize: 14 },
  emptyMessage: { ...fontStyles.medium, fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  emptyTitle: { ...fontStyles.bold, fontSize: 15.5, letterSpacing: -0.3, marginTop: 14 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  headerLeft: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  icon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  row: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTime: { ...fontStyles.medium, fontSize: 11, marginTop: 2 },
  rowTitle: { ...fontStyles.bold, fontSize: 13, letterSpacing: -0.2 },
  section: { marginBottom: spacing.section },
  subtitle: { ...fontStyles.medium, fontSize: 11.5, marginTop: 1 },
  title: { ...fontStyles.bold, fontSize: 17, letterSpacing: -0.4 },
  viewAll: { alignItems: 'center', flexDirection: 'row', gap: 2, minHeight: 44, paddingLeft: 8 },
  viewAllText: { ...fontStyles.bold, fontSize: 12.5 }
});
