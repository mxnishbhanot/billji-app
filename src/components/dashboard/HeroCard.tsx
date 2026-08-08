import { memo, ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Plus } from 'lucide-react-native';
import Reanimated, { Extrapolation, SharedValue, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { PrimaryButton } from '@/components/dashboard/PrimaryButton';
import { HERO_RAIL_MIN_WIDTH, HeroStatRail } from '@/components/dashboard/HeroStatRail';
import { HeroPaperDecor, TicketPerforation } from '@/components/dashboard/LedgerDecor';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

type Props = {
  collectionAmount: string;
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
  const railStyle = useMemo(
    () => ({ width: Math.round(Math.max(HERO_RAIL_MIN_WIDTH, Math.min(cardWidth * 0.31, 220))) }),
    [cardWidth]
  );
  const amountStyle = useMemo(() => ({ fontSize: cardWidth >= 420 ? 44 : 38 }), [cardWidth]);

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
      <View style={styles.row}>
        <View style={styles.main}>
          <HeroPaperDecor cream={paperColor} lineColor={colors.outline} accent={colors.primaryStrong} />
          <View style={styles.mainInner}>
            <Text style={[styles.eyebrow, { color: colors.primaryStrong }]}>Today&apos;s collection</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={[styles.amount, amountStyle, { color: theme.colors.onSurface }]}
            >
              {collectionAmount}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: settled ? colors.accent : colors.warning }]} />
              <Text style={[styles.statusStrong, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {settled ? 'All settled' : 'Follow up'}
              </Text>
              <View style={[styles.pipe, { backgroundColor: alpha(colors.outline, 0.6) }]} />
              <Text style={[styles.statusMuted, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                {todayInAmount} in today
              </Text>
            </View>
            <View style={[styles.dash, { borderColor: alpha(colors.primaryStrong, 0.22) }]} />
            {createInvoiceAnchor ? createInvoiceAnchor(cta) : cta}
          </View>
        </View>

        <TicketPerforation left={paperColor} right={colors.card} background={colors.background} />

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
  amount: { ...fontStyles.bold, letterSpacing: -1.4, lineHeight: 50, marginTop: 6 },
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
  dot: { borderRadius: 999, height: 8, width: 8 },
  eyebrow: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  main: { flex: 1, minWidth: 0, overflow: 'hidden' },
  mainInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 20 },
  pipe: { height: 13, marginHorizontal: 2, width: 1 },
  row: { flexDirection: 'row', minHeight: 236 },
  statusMuted: { ...fontStyles.medium, flexShrink: 1, fontSize: 13 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 12 },
  statusStrong: { ...fontStyles.bold, fontSize: 13.5, letterSpacing: -0.2 }
});
