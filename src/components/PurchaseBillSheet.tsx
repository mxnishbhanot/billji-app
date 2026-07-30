import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { productsApi, purchasesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Product, Vendor } from '@/types';
import { formatCurrency } from '@/utils/format';

type DraftLine = { key: string; product: Product | null; name: string; quantity: string; price: string; taxRate: string };

const money = (value: string) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Record a supplier bill. Deliberately its own sheet rather than the invoice builder:
 * a purchase has no customer, no share link and no preview, and the price entered is what
 * we paid rather than what we charge.
 */
export function PurchaseBillSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  return visible ? <PurchaseBillSheetBody onClose={onClose} onSaved={onSaved} /> : null;
}

function PurchaseBillSheetBody({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [vendorBillNumber, setVendorBillNumber] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  // Stable React keys for draft rows; the same product can be added twice.
  const lineSeq = useRef(0);

  const vendorsQuery = useQuery({ queryKey: queryKeys.purchases.vendors(vendorSearch), queryFn: () => purchasesApi.vendors(vendorSearch) });
  const productsQuery = useQuery({ queryKey: queryKeys.products.picker({ search: productSearch }), queryFn: () => productsApi.list({ search: productSearch }) });

  const addVendor = useMutation({
    mutationFn: (name: string) => purchasesApi.createVendor({ name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchases.all });
      setVendor(created);
      setNewVendorName('');
    },
    onError: (error) => showDialog({ title: 'Could not add supplier', message: apiErrorMessage(error), tone: 'error' })
  });

  const save = useMutation({
    mutationFn: () =>
      purchasesApi.create({
        vendorId: vendor!._id,
        vendorBillNumber: vendorBillNumber.trim(),
        items: lines.map((line) => ({
          productId: line.product?._id,
          name: line.product?.name || line.name,
          quantity: Number(line.quantity) || 1,
          price: money(line.price),
          taxRate: line.taxRate === '' ? undefined : Number(line.taxRate),
          hsn: line.product?.hsn
        }))
      }),
    onSuccess: onSaved,
    onError: (error) => showDialog({ title: 'Could not save purchase', message: apiErrorMessage(error), tone: 'error' })
  });

  const addProduct = (product: Product) => {
    lineSeq.current += 1;
    setLines((current) => [
      ...current,
      {
        key: `line-${lineSeq.current}`,
        product,
        name: product.name,
        quantity: '1',
        // Default to the cost we last paid, not the selling price.
        price: String(product.purchasePrice || ''),
        taxRate: product.taxRate ? String(product.taxRate) : ''
      }
    ]);
    setProductSearch('');
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const gross = (Number(line.quantity) || 0) * money(line.price);
        return sum + gross + gross * ((Number(line.taxRate) || 0) / 100);
      }, 0),
    [lines]
  );

  const canSave = Boolean(vendor) && lines.length > 0 && lines.every((line) => money(line.price) >= 0 && Number(line.quantity) > 0);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const inputProps = {
    mode: 'outlined' as const,
    dense: true,
    outlineColor: theme.colors.outlineVariant,
    activeOutlineColor: theme.colors.primary,
    outlineStyle: styles.inputOutline,
    style: [styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>New purchase bill</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SUPPLIER</Text>
            {vendor ? (
              <Pressable onPress={() => setVendor(null)} style={[styles.selected, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: alpha(colors.primary, 0.3) }]}>
                <Text style={[styles.selectedName, { color: theme.colors.onSurface }]}>{vendor.name}</Text>
                <Feather name="x" size={15} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            ) : (
              <>
                <TextInput {...inputProps} label="Search suppliers" value={vendorSearch} onChangeText={setVendorSearch} />
                {vendorsQuery.data?.slice(0, 4).map((row) => (
                  <Pressable key={row._id} onPress={() => setVendor(row)} style={[styles.pickRow, { borderColor: cardBorder }]}>
                    <Text style={[styles.pickName, { color: theme.colors.onSurface }]}>{row.name}</Text>
                    {row.outstandingPayable ? (
                      <Text style={[styles.pickMeta, { color: colors.warning }]}>Owe {formatCurrency(row.outstandingPayable)}</Text>
                    ) : null}
                  </Pressable>
                ))}
                <View style={styles.addVendorRow}>
                  <View style={styles.flex1}>
                    <TextInput {...inputProps} label="Or add a new supplier" value={newVendorName} onChangeText={setNewVendorName} />
                  </View>
                  <Pressable
                    onPress={() => newVendorName.trim() && addVendor.mutate(newVendorName.trim())}
                    disabled={!newVendorName.trim() || addVendor.isPending}
                    style={[styles.addBtn, { backgroundColor: newVendorName.trim() ? theme.colors.primary : colors.border }]}
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" strokeWidth={3} />
                  </Pressable>
                </View>
              </>
            )}

            <TextInput {...inputProps} label="Supplier's bill number (optional)" value={vendorBillNumber} onChangeText={setVendorBillNumber} />

            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>ITEMS RECEIVED</Text>
            {lines.map((line) => (
              <View key={line.key} style={[styles.lineCard, { borderColor: cardBorder }]}>
                <View style={styles.lineHead}>
                  <Text numberOfLines={1} style={[styles.lineName, { color: theme.colors.onSurface }]}>{line.name}</Text>
                  <Pressable onPress={() => removeLine(line.key)} hitSlop={8}>
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                  </Pressable>
                </View>
                <View style={styles.lineInputs}>
                  <View style={styles.flex1}>
                    <TextInput {...inputProps} label="Qty" value={line.quantity} onChangeText={(value) => updateLine(line.key, { quantity: value })} keyboardType="number-pad" />
                  </View>
                  <View style={styles.flex1}>
                    <TextInput {...inputProps} label="Cost price" value={line.price} onChangeText={(value) => updateLine(line.key, { price: value })} keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.flex1}>
                    <TextInput {...inputProps} label="GST %" value={line.taxRate} onChangeText={(value) => updateLine(line.key, { taxRate: value })} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>
            ))}

            <TextInput {...inputProps} label="Add product" value={productSearch} onChangeText={setProductSearch} />
            {productSearch
              ? productsQuery.data?.slice(0, 4).map((product) => (
                  <Pressable key={product._id} onPress={() => addProduct(product)} style={[styles.pickRow, { borderColor: cardBorder }]}>
                    <Text style={[styles.pickName, { color: theme.colors.onSurface }]}>{product.name}</Text>
                    <Text style={[styles.pickMeta, { color: theme.colors.onSurfaceVariant }]}>Stock {product.stockQuantity}</Text>
                  </Pressable>
                ))
              : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: cardBorder }]}>
            <View>
              <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>BILL TOTAL</Text>
              <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(total)}</Text>
            </View>
            <Pressable
              onPress={() => save.mutate()}
              disabled={!canSave || save.isPending}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: canSave ? (pressed ? colors.primaryStrong : theme.colors.primary) : colors.border }
              ]}
            >
              {save.isPending ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
              <Text style={styles.saveLabel}>Receive stock</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addBtn: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  addVendorRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  backdrop: { backgroundColor: 'rgba(8, 9, 18, 0.55)', flex: 1 },
  closeBtn: { alignItems: 'center', borderRadius: radii.md, height: 30, justifyContent: 'center', width: 30 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  flex1: { flex: 1 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, paddingHorizontal: 18, paddingTop: 14 },
  input: { marginBottom: 10 },
  inputOutline: { borderRadius: radii.input },
  lineCard: { borderRadius: radii.md, borderWidth: 1, marginBottom: 10, padding: 10 },
  lineHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  lineInputs: { flexDirection: 'row', gap: 8 },
  lineName: { ...fontStyles.semiBold, flex: 1, fontSize: 14 },
  pickMeta: { ...typeScale.caption, fontSize: 12 },
  pickName: { ...fontStyles.semiBold, fontSize: 14 },
  pickRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  saveBtn: { alignItems: 'center', borderRadius: radii.input, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 13 },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14 },
  scrollContent: { paddingHorizontal: 18 },
  sectionLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1, marginBottom: 8, marginTop: 6 },
  selected: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, padding: 12 },
  selectedName: { ...fontStyles.bold, fontSize: 14 },
  sheet: { borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, borderWidth: 1, maxHeight: '92%' },
  title: { ...fontStyles.bold, fontSize: 17 },
  totalLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1 },
  totalValue: { ...fontStyles.bold, fontSize: 20, marginTop: 2 }
});
