import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueries, useQuery } from '@tanstack/react-query';
import { customersApi, documentsApi, invoicesApi, productsApi } from '@/api/endpoints';
import { navigateToTarget } from '@/navigation/navigationRef';
import { CatalogStackParamList, CustomersStackParamList, DashboardStackParamList, InvoiceStackParamList } from '@/navigation/types';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { documentNumberOf, SalesDocumentKind } from '@/types';
import { formatCurrency } from '@/utils/format';

const MIN_QUERY = 2;
const PER_GROUP = 5;
const DOCUMENT_GROUPS: { kind: SalesDocumentKind; icon: keyof typeof Feather.glyphMap; screen: keyof InvoiceStackParamList; fallback: string }[] = [
  { kind: 'quotation', icon: 'file', screen: 'QuotationDetail', fallback: 'Quotation' },
  { kind: 'delivery_challan', icon: 'truck', screen: 'ChallanDetail', fallback: 'Challan' },
  { kind: 'credit_note', icon: 'corner-up-left', screen: 'CreditNoteDetail', fallback: 'Credit note' }
];

type Row = { key: string; icon: keyof typeof Feather.glyphMap; title: string; meta: string; go: () => void };
// navigateToTarget takes loose strings (cross-tab deep links aren't expressible in the
// typed navigator API), so constrain the pairs here — a renamed route breaks the build
// instead of silently no-opping at runtime.
type QuickTarget =
  | { tab: 'InvoicesTab'; screen: keyof InvoiceStackParamList; params?: Record<string, unknown> }
  | { tab: 'CustomersTab'; screen: keyof CustomersStackParamList; params?: Record<string, unknown> }
  | { tab: 'CatalogTab'; screen: keyof CatalogStackParamList; params?: Record<string, unknown> }
  | { tab: 'DashboardTab'; screen: keyof DashboardStackParamList; params?: Record<string, unknown> };

/**
 * Search-anything + create-anything, reachable from every Screen header. The search
 * fans out to the existing per-entity list endpoints rather than adding a cross-entity
 * search API — a handful of small parallel reads beat a new backend surface.
 */
export function QuickActionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const enabled = visible && debounced.length >= MIN_QUERY;
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const params = { search: debounced, limit: PER_GROUP };
  const invoices = useQuery({
    queryKey: queryKeys.invoices.list({ ...params, quick: true }),
    queryFn: () => invoicesApi.list(params),
    enabled: enabled && can(PERMISSION.invoicesView)
  });
  const customers = useQuery({
    queryKey: queryKeys.customers.list({ ...params, quick: true }),
    queryFn: () => customersApi.list(params),
    enabled: enabled && can(PERMISSION.customersView)
  });
  const products = useQuery({
    queryKey: queryKeys.products.list({ ...params, quick: true }),
    queryFn: () => productsApi.list(params),
    enabled: enabled && can(PERMISSION.productsView)
  });
  // Quotations, challans and credit notes ride the same documents endpoint — one read each,
  // gated on the invoice permission the Documents screen itself uses.
  const documents = useQueries({
    queries: DOCUMENT_GROUPS.map((group) => ({
      queryKey: [...queryKeys.documents.list(group.kind), { search: debounced, quick: true }],
      queryFn: () => documentsApi.list(group.kind, { search: debounced }),
      enabled: enabled && can(PERMISSION.invoicesView)
    })),
    // One stable value per render keeps the row memo from recomputing on every query tick.
    combine: (results) => ({ data: results.map((result) => result.data), isFetching: results.some((result) => result.isFetching) })
  });
  const documentData = documents.data;

  // Clear the box on close so the next open starts on the create shortcuts.
  const close = () => {
    setSearch('');
    onClose();
  };
  const goTo = (target: QuickTarget) => {
    close();
    navigateToTarget(target);
  };

  const rows: Row[] = useMemo(() => {
    if (!enabled) return [];
    const invoiceRows: Row[] = (invoices.data ?? []).slice(0, PER_GROUP).map((invoice) => ({
      key: `invoice-${invoice._id}`,
      icon: 'file-text',
      title: invoice.invoiceNumber || 'Invoice',
      meta: `${invoice.customerSnapshot?.name || 'Walk-in'} · ${formatCurrency(invoice.total)}`,
      go: () => goTo({ tab: 'InvoicesTab', screen: 'InvoiceDetail', params: { id: invoice._id } })
    }));
    const customerRows: Row[] = (customers.data ?? []).slice(0, PER_GROUP).map((customer) => ({
      key: `customer-${customer._id}`,
      icon: 'user',
      title: customer.name,
      meta: `${customer.countryCode || '+91'} ${customer.phone}`,
      go: () => goTo({ tab: 'CustomersTab', screen: 'CustomerDetail', params: { customer } })
    }));
    const productRows: Row[] = (products.data ?? []).slice(0, PER_GROUP).map((product) => ({
      key: `product-${product._id}`,
      icon: 'box',
      title: product.name,
      meta: `${formatCurrency(product.price)} · ${product.stockQuantity} in stock`,
      go: () => goTo({ tab: 'CatalogTab', screen: 'Products', params: { highlight: product._id } })
    }));
    const documentRows: Row[] = DOCUMENT_GROUPS.flatMap((group, index) =>
      (documentData[index] ?? []).slice(0, PER_GROUP).map((document) => ({
        key: `${group.kind}-${document._id}`,
        icon: group.icon,
        title: documentNumberOf(document) || group.fallback,
        meta: `${document.customerSnapshot?.name || 'Walk-in'} · ${formatCurrency(document.total)}`,
        go: () => goTo({ tab: 'InvoicesTab', screen: group.screen, params: { id: document._id } })
      }))
    );
    return [...invoiceRows, ...customerRows, ...documentRows, ...productRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, invoices.data, customers.data, products.data, documentData]);

  const createActions: { key: string; icon: keyof typeof Feather.glyphMap; label: string; target: QuickTarget; allowed: boolean }[] = [
    { key: 'invoice', icon: 'file-plus', label: 'Invoice', target: { tab: 'InvoicesTab', screen: 'InvoiceCreate' }, allowed: can(PERMISSION.invoicesCreate) },
    { key: 'order', icon: 'clipboard', label: 'Order', target: { tab: 'InvoicesTab', screen: 'OrderCreate' }, allowed: can(PERMISSION.ordersCreate) },
    // Credit notes have no builder — they are raised from an invoice — so no chip for them.
    { key: 'quotation', icon: 'file', label: 'Quotation', target: { tab: 'InvoicesTab', screen: 'InvoiceCreate', params: { documentType: 'quotation' } }, allowed: can(PERMISSION.invoicesCreate) },
    { key: 'challan', icon: 'truck', label: 'Challan', target: { tab: 'InvoicesTab', screen: 'InvoiceCreate', params: { documentType: 'delivery_challan' } }, allowed: can(PERMISSION.invoicesCreate) },
    { key: 'customer', icon: 'user-plus', label: 'Customer', target: { tab: 'CustomersTab', screen: 'Customers', params: { openCreate: true } }, allowed: can(PERMISSION.customersManage) },
    { key: 'product', icon: 'package', label: 'Product', target: { tab: 'CatalogTab', screen: 'Products', params: { openCreate: true } }, allowed: can(PERMISSION.productsManage) },
    { key: 'expense', icon: 'trending-down', label: 'Expense', target: { tab: 'DashboardTab', screen: 'Expenses', params: { openCreate: true } }, allowed: can(PERMISSION.expensesManage) }
  ];

  const loading = enabled && (invoices.isFetching || customers.isFetching || products.isFetching || documents.isFetching);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Search & create</Text>
            <Pressable onPress={close} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <TextInput
            mode="outlined"
            autoFocus
            placeholder="Document number, customer, product"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            left={<TextInput.Icon icon="magnify" color={theme.colors.onSurfaceVariant} />}
            right={search ? <TextInput.Icon icon="close-circle" color={theme.colors.onSurfaceVariant} onPress={() => setSearch('')} /> : null}
            outlineColor={cardBorder}
            activeOutlineColor={theme.colors.primary}
            outlineStyle={styles.inputOutline}
            style={[styles.searchInput, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
          />

          {enabled ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {loading && !rows.length ? (
                <View style={styles.stateWrap}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : rows.length ? (
                rows.map((row) => (
                  <Pressable
                    key={row.key}
                    onPress={row.go}
                    style={({ pressed }) => [styles.row, { backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.14 : 0.06) : subSurface, borderColor: cardBorder }]}
                  >
                    <View style={[styles.iconTile, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12) }]}>
                      <Feather name={row.icon} size={15} color={colors.primary} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text numberOfLines={1} style={[styles.rowName, { color: theme.colors.onSurface }]}>{row.title}</Text>
                      <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{row.meta}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.stateWrap}>
                  <MaterialCommunityIcons name="text-search" size={32} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>{`Nothing matches "${debounced}"`}</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.createWrap}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>CREATE NEW</Text>
              <View style={styles.chipRow}>
                {createActions.filter((action) => action.allowed).map((action) => (
                  <Pressable
                    key={action.key}
                    onPress={() => goTo(action.target)}
                    style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? alpha(colors.primary, 0.14) : subSurface, borderColor: cardBorder }]}
                  >
                    <Feather name={action.icon} size={16} color={colors.primary} />
                    <Text style={[styles.chipLabel, { color: theme.colors.onSurface }]}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>Type at least {MIN_QUERY} characters to search invoices, quotations, challans, credit notes, customers and products.</Text>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  chipLabel: { ...fontStyles.bold, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  createWrap: { gap: 10, paddingHorizontal: 18, paddingTop: 18 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  hint: { ...fontStyles.semiBold, fontSize: 12, marginTop: 4 },
  iconTile: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  inputOutline: { borderRadius: radii.input },
  list: { flexGrow: 0, marginTop: 12 },
  listContent: { gap: 8, paddingBottom: 4, paddingHorizontal: 18 },
  row: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { ...fontStyles.semiBold, fontSize: 12, marginTop: 2 },
  rowName: { ...fontStyles.bold, fontSize: 14 },
  searchInput: { fontSize: 14, marginHorizontal: 18, marginTop: 12 },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '80%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  stateText: { ...fontStyles.semiBold, fontSize: 13, textAlign: 'center' },
  stateWrap: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
