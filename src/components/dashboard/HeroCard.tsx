import { memo, ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Plus } from 'lucide-react-native';
import Reanimated, { Extrapolation, SharedValue, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { PrimaryButton } from '@/components/dashboard/PrimaryButton';
import { HERO_RAIL_MIN_WIDTH, HeroStatRail } from '@/components/dashboard/HeroStatRail';
import { TicketPerforation } from '@/components/dashboard/LedgerDecor';
import { FittedAmount } from '@/components/dashboard/FittedAmount';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

/** Below this card width the stat rail moves under the receipt instead of beside it. */
const STACK_BREAKPOINT = 340;
/** Below this the full figure has shrunk past comfortable reading; swap to ₹1.2L form. */
const COMPACT_BELOW_FONT_SIZE = 26;
/** Horizontal padding inside the receipt once stacked; 18 wastes an SE's 320pt. */
const NARROW_PADDING = 14;

type Props = {
  collectionAmount: string;
  /** Short form (₹1.25L) used when the full figure will not fit legibly. */
  collectionAmountCompact?: string;
  todayInAmount: string;
  settled: boolean;
  canCreateInvoice: boolean;
  onCreateInvoice?: () => void;
  createInvoiceAnchor?: (children: ReactNode) => ReactNode;
  invoices: number;
  customers: number;
  products: number;
  pending: number;
  onInvoices?: () => void;
  onCustomers?: () => void;
  onProducts?: () => void;
  onPending?: () => void;
  scrollY?: SharedValue<number>;
};

export const HeroCard = memo(function HeroCard({
  collectionAmount,
  collectionAmountCompact,
  todayInAmount,
  settled,
  canCreateInvoice,
  onCreateInvoice,
  createInvoiceAnchor,
  invoices,
  customers,
  products,
  pending,
  onInvoices,
  onCustomers,
  onProducts,
  onPending,
  scrollY
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const { width } = useWindowDimensions();
  const paperColor = theme.dark ? colors.surfaceContainer : '#FDF0E7';
  const cardWidth = width - spacing.screenPadding * 2;

  // The stub is sized to its content rather than a flex ratio: at phone widths a
  // proportional split starves the labels, and on wide screens it tracks the
  // reference's ~31% instead of leaving a stranded column.
  const stacked = cardWidth < STACK_BREAKPOINT;
  const railStyle = useMemo(
    () =>
      stacked
        ? { width: '100%' as const }
        : { width: Math.round(Math.max(HERO_RAIL_MIN_WIDTH, Math.min(cardWidth * 0.31, 220))) },
    [cardWidth, stacked]
  );

  const innerPadding = stacked ? NARROW_PADDING * 2 : 36;
  const amountWidth = stacked
    ? cardWidth - innerPadding // rail sits below, so the receipt gets the full card
    : cardWidth - (railStyle.width as number) - 16 - innerPadding; // + perforation
  const amountMax = cardWidth >= 420 ? 44 : 38;

  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    return {
      opacity: interpolate(scrollY.value, [0, 190], [1, 0.94], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(scrollY.value, [0, 190], [0, 18], Extrapolation.CLAMP) },
        { scale: interpolate(scrollY.value, [0, 190], [1, 0.985], Extrapolation.CLAMP) }
      ]
    };
  });

  const cta = canCreateInvoice ? (
    <PrimaryButton
      label="Create Invoice"
      onPress={onCreateInvoice}
      style={styles.cta}
      icon={
        <View style={styles.ctaBadge}>
          <Plus size={16} color={colors.primaryStrong} strokeWidth={3} />
        </View>
      }
    />
  ) : null;

  return (
    <Reanimated.View style={[styles.card, shadows.card, parallaxStyle]}>
      <View style={stacked ? styles.column : styles.row}>
        <View style={[styles.main, stacked ? styles.mainStacked : null, { backgroundColor: paperColor }]}>
          <View style={[styles.mainInner, stacked ? styles.mainInnerNarrow : null]}>
            <Text style={[styles.eyebrow, { color: colors.primaryStrong }]}>Today&apos;s collection</Text>
            <FittedAmount
              full={collectionAmount}
              compact={collectionAmountCompact}
              available={amountWidth}
              maxFontSize={amountMax}
              compactBelow={COMPACT_BELOW_FONT_SIZE}
              style={styles.amount}
              color={theme.colors.onSurface}
            />
            <View style={styles.statusRow}>
              <View style={styles.statusChunk}>
                <View style={[styles.dot, { backgroundColor: settled ? colors.accent : colors.warning }]} />
                <Text style={[styles.statusStrong, { color: theme.colors.onSurface }]} numberOfLines={1}>
                  {settled ? 'All settled' : 'Follow up'}
                </Text>
              </View>
              <View style={styles.statusChunk}>
                <View style={[styles.pipe, { backgroundColor: alpha(colors.outline, 0.6) }]} />
                <Text style={[styles.statusMuted, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                  {todayInAmount} in today
                </Text>
              </View>
            </View>
            <View style={[styles.dash, { borderColor: alpha(colors.primaryStrong, 0.22) }]} />
            {createInvoiceAnchor ? createInvoiceAnchor(cta) : cta}
          </View>
        </View>

        {stacked ? (
          <View style={[styles.stackSeam, { backgroundColor: paperColor, borderColor: alpha(colors.outline, 0.5) }]} />
        ) : (
          <TicketPerforation left={paperColor} right={colors.card} background={colors.background} />
        )}

        <View style={railStyle}>
          <HeroStatRail
            invoices={invoices}
            customers={customers}
            products={products}
            pending={pending}
            onInvoices={onInvoices}
            onCustomers={onCustomers}
            onProducts={onProducts}
            onPending={onPending}
          />
        </View>
      </View>
    </Reanimated.View>
  );
});

const styles = StyleSheet.create({
  amount: { ...fontStyles.bold, letterSpacing: -1.4, marginTop: 6 },
  card: {
    borderRadius: radii.hero,
    marginBottom: spacing.section,
    overflow: 'hidden'
  },
  cta: { alignSelf: 'flex-start', marginTop: 2 },
  ctaBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26
  },
  dash: {
    borderStyle: 'dashed',
    borderTopWidth: 1,
    marginBottom: 18,
    marginTop: 16
  },
  column: { flexDirection: 'column' },
  dot: { borderRadius: 999, height: 8, width: 8 },
  eyebrow: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  main: { flex: 1, minWidth: 0, overflow: 'hidden' },
  mainStacked: { flex: 0, width: '100%' },
  mainInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 20 },
  mainInnerNarrow: { paddingHorizontal: NARROW_PADDING, paddingVertical: 16 },
  pipe: { height: 13, marginHorizontal: 2, width: 1 },
  row: { flexDirection: 'row', minHeight: 236 },
  stackSeam: { borderStyle: 'dashed', borderTopWidth: 1, width: '100%' },
  statusChunk: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  statusMuted: { ...fontStyles.medium, fontSize: 13 },
  // Wrap instead of shrink: a truncated "₹1,20,000 in to…" is worse than a second line.
  statusRow: { alignItems: 'center', columnGap: 7, flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 4 },
  statusStrong: { ...fontStyles.bold, fontSize: 13.5, letterSpacing: -0.2 }
});
