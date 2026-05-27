import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, List, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { customersApi, invoicesApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { PhoneInput } from '@/components/PhoneInput';
import { Screen } from '@/components/Screen';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { Customer, DiscountType, InvoiceItem, Product } from '@/types';
import { calculateClientTotals, formatCurrency } from '@/utils/format';
import { customItemSchema, customerSchema } from '@/validation/schemas';

const customerDefaults = { name: '', phone: '', countryCode: '+91', email: '', address: '' };
const customDefaults = { name: '', price: '', quantity: '1' };
const VISIBLE_PRODUCT_ROWS = 5;
const VISIBLE_INVOICE_ITEM_ROWS = 5;
const PRODUCT_ROW_HEIGHT = 72;
const INVOICE_ITEM_ROW_HEIGHT = 112;

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
};

export function InvoiceBuilderScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const customers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => customersApi.list() });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list() });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPicker, setCustomerPicker] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [customModal, setCustomModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [taxRate, setTaxRate] = useState('0');
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [oversell, setOversell] = useState<{ items: any[]; payload: Record<string, unknown> } | null>(null);
  const customerForm = useForm<any>({ defaultValues: customerDefaults, resolver: zodResolver(customerSchema) });
  const customForm = useForm<any>({ defaultValues: customDefaults, resolver: zodResolver(customItemSchema) });
  const productById = useMemo(() => new Map((products.data || []).map((product) => [product._id, product])), [products.data]);
  const selectedCustomer = (customers.data || []).find((customer) => customer._id === selectedCustomerId);
  const filteredProducts = useMemo(() => {
    const queryText = productSearch.trim().toLowerCase();
    return (products.data || []).filter((product) => !queryText || [product.name, product.sku, product.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(queryText)));
  }, [productSearch, products.data]);
  const totals = calculateClientTotals({ items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0) });
  const addProduct = (product: Product) => setItems((current) => {
    const existing = current.find((item) => item.productId === product._id);
    if (existing) return current.map((item) => item.productId === product._id ? { ...item, quantity: item.quantity + 1 } : item);
    return [...current, { productId: product._id, name: product.name, price: product.price, quantity: 1 }];
  });
  const updateQuantity = (index: number, delta: number) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  const removeItem = (index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const addCustomer = useMutation({ mutationFn: customersApi.create, onSuccess: (customer) => { queryClient.invalidateQueries({ queryKey: ['customers'] }); setSelectedCustomerId(customer._id); setCustomerModal(false); customerForm.reset(customerDefaults); }, onError: (error) => showDialog({ title: 'Could not add customer', message: apiErrorMessage(error), tone: 'error' }) });
  const buildPayload = (allowOversell = false) => ({ customerId: selectedCustomerId, items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0), notes, allowOversell });
  const createInvoiceMutation = useMutation({ mutationFn: (payload: Record<string, unknown>) => invoicesApi.create(payload), onSuccess: (invoice) => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); queryClient.invalidateQueries({ queryKey: ['report'] }); navigation.replace('InvoiceDetail', { id: invoice._id }); }, onError: (error: any) => { const details = error?.response?.data?.details; if (details?.code === 'INSUFFICIENT_STOCK' && Array.isArray(details.items)) setOversell({ items: details.items, payload: buildPayload(true) }); else showDialog({ title: 'Could not create invoice', message: apiErrorMessage(error), tone: 'error' }); }});
  const findOversellItems = () => {
    const requested = new Map<string, number>();
    items.forEach((item) => { if (item.productId) requested.set(item.productId, (requested.get(item.productId) || 0) + Number(item.quantity || 0)); });
    return Array.from(requested.entries()).map(([productId, quantity]) => { const product = productById.get(productId); return product && quantity > product.stockQuantity ? { productId, name: product.name, requested: quantity, available: product.stockQuantity, shortage: quantity - product.stockQuantity } : null; }).filter(Boolean) as any[];
  };
  const createInvoice = () => {
    if (!selectedCustomerId) return showDialog({ title: 'Select or add a customer', message: 'Choose a saved customer or quick add a new one before generating the invoice.', tone: 'warning' });
    if (!items.length) return showDialog({ title: 'Add at least one item', message: 'Pick a product or add a custom item before generating the invoice.', tone: 'warning' });
    const shortages = findOversellItems();
    if (shortages.length) return setOversell({ items: shortages, payload: buildPayload(true) });
    createInvoiceMutation.mutate(buildPayload(false));
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);

  return (
    <Screen title="New Invoice">
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Customer</Text>
        </View>
        {selectedCustomer ? (
          <>
            <View style={[styles.customerSelected, { backgroundColor: subSurface, borderColor: cardBorder }]}>
              <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(selectedCustomer.name)}</Text>
              </View>
              <View style={styles.flexContent}>
                <Text style={[styles.customerName, { color: theme.colors.onSurface }]}>{selectedCustomer.name}</Text>
                <Text style={[styles.customerMeta, { color: theme.colors.onSurfaceVariant }]}>{selectedCustomer.countryCode || '+91'} {selectedCustomer.phone}</Text>
              </View>
            </View>
            <View style={styles.customerActions}>
              <Pressable onPress={() => setCustomerPicker(true)} style={({ pressed }) => [styles.secondaryPick, { backgroundColor: alpha(colors.primary, pressed ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.32 : 0.2) }]}>
                <Feather name="users" size={15} color={theme.colors.primary} />
                <Text style={[styles.secondaryPickLabel, { color: theme.colors.primary }]}>Change</Text>
              </Pressable>
              <Pressable onPress={() => setCustomerModal(true)} style={({ pressed }) => [styles.primaryPick, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
                <Feather name="plus" size={15} color="#FFFFFF" />
                <Text style={styles.primaryPickLabel}>Add new</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.customerActions}>
            <Pressable onPress={() => setCustomerPicker(true)} style={({ pressed }) => [styles.primaryPick, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
              <Feather name="users" size={15} color="#FFFFFF" />
              <Text style={styles.primaryPickLabel}>Choose customer</Text>
            </Pressable>
            <Pressable onPress={() => setCustomerModal(true)} style={({ pressed }) => [styles.secondaryPick, { backgroundColor: alpha(colors.primary, pressed ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.32 : 0.2) }]}>
              <Feather name="plus" size={15} color={theme.colors.primary} />
              <Text style={[styles.secondaryPickLabel, { color: theme.colors.primary }]}>Quick add</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Products</Text>
          {filteredProducts.length ? (
            <Text style={[styles.listHint, { color: theme.colors.onSurfaceVariant }]}>{filteredProducts.length} found</Text>
          ) : null}
        </View>
        <TextInput
          mode="outlined"
          placeholder="Search products"
          value={productSearch}
          onChangeText={setProductSearch}
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          outlineStyle={styles.inputOutline}
          style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
        />
        {filteredProducts.length ? (
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={filteredProducts.length > VISIBLE_PRODUCT_ROWS}
            scrollEnabled={filteredProducts.length > VISIBLE_PRODUCT_ROWS}
            style={styles.productList}
          >
            {filteredProducts.map((item) => (
              <List.Item
                key={item._id}
                title={item.name}
                titleStyle={[styles.productTitle, { color: theme.colors.onSurface }]}
                description={`${formatCurrency(item.price)} · Stock ${item.stockQuantity}`}
                descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                style={[styles.productRow, { backgroundColor: subSurface, borderColor: cardBorder }]}
                onPress={() => addProduct(item)}
                right={() => (
                  <Pressable onPress={() => addProduct(item)} style={({ pressed }) => [styles.addBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
                    <Feather name="plus" size={14} color="#FFFFFF" />
                    <Text style={styles.addBtnLabel}>Add</Text>
                  </Pressable>
                )}
              />
            ))}
          </ScrollView>
        ) : <Text style={[styles.emptyProductsText, { color: theme.colors.onSurfaceVariant }]}>No saved products found. Add a custom item below.</Text>}
        <Pressable onPress={() => setCustomModal(true)} style={({ pressed }) => [styles.dashedBtn, { borderColor: alpha(colors.primary, isDark ? 0.4 : 0.28), backgroundColor: alpha(colors.primary, pressed ? 0.12 : 0.04) }]}>
          <MaterialCommunityIcons name="plus-circle-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.dashedBtnLabel, { color: theme.colors.primary }]}>Add custom item</Text>
        </Pressable>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Invoice items</Text>
          {items.length ? (
            <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
              <Text style={[styles.countBadgeText, { color: theme.colors.primary }]}>{items.length}</Text>
            </View>
          ) : null}
        </View>
        {items.length ? (
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={items.length > VISIBLE_INVOICE_ITEM_ROWS}
            scrollEnabled={items.length > VISIBLE_INVOICE_ITEM_ROWS}
            style={styles.invoiceItemsList}
          >
            {items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={[styles.invoiceItem, { backgroundColor: subSurface, borderColor: cardBorder }]}>
                <View style={styles.itemHeader}>
                  <View style={styles.flexContent}>
                    <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                    <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>{item.quantity} × {formatCurrency(item.price)}</Text>
                  </View>
                  <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.quantity * item.price)}</Text>
                </View>
                <View style={styles.itemActions}>
                  <View style={[styles.stepper, { borderColor: cardBorder, backgroundColor: colors.card }]}>
                    <Pressable onPress={() => updateQuantity(index, -1)} style={styles.stepperBtn}>
                      <Feather name="minus" size={14} color={theme.colors.onSurface} />
                    </Pressable>
                    <Text style={[styles.stepperValue, { color: theme.colors.onSurface }]}>{item.quantity}</Text>
                    <Pressable onPress={() => updateQuantity(index, 1)} style={styles.stepperBtn}>
                      <Feather name="plus" size={14} color={theme.colors.onSurface} />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => removeItem(index)} style={({ pressed }) => [styles.removeBtn, { backgroundColor: alpha(colors.destructive, pressed ? 0.2 : isDark ? 0.16 : 0.1) }]}>
                    <Feather name="trash-2" size={14} color={colors.destructive} />
                    <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : <Text style={[styles.emptyItemsText, { color: theme.colors.onSurfaceVariant }]}>No items yet.</Text>}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Totals & extras</Text>
        <TextInput
          mode="outlined"
          label="Tax rate %"
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="decimal-pad"
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          outlineStyle={styles.inputOutline}
          style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
        />
        <SegmentedButtons value={discountType} onValueChange={(value) => setDiscountType(value as DiscountType)} buttons={[{ value: 'flat', label: 'Flat' }, { value: 'percentage', label: 'Percent %' }]} style={styles.segmented} />
        <TextInput
          mode="outlined"
          label="Discount"
          value={discountValue}
          onChangeText={setDiscountValue}
          keyboardType="decimal-pad"
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          outlineStyle={styles.inputOutline}
          style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
        />
        <TextInput
          mode="outlined"
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          outlineStyle={styles.inputOutline}
          style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF', marginTop: 10 }]}
        />
        <View style={[styles.totalsPanel, { backgroundColor: subSurface, borderColor: cardBorder }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Discount</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>-{formatCurrency(totals.discountAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Tax</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(totals.taxAmount)}</Text>
          </View>
          <View style={[styles.grandTotalRow, { borderColor: cardBorder }]}>
            <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>{formatCurrency(totals.total)}</Text>
          </View>
        </View>
      </View>

      <Button mode="contained" loading={createInvoiceMutation.isPending} onPress={createInvoice} style={styles.generateButton} contentStyle={styles.generateButtonContent} labelStyle={styles.generateButtonLabel}>
        Generate invoice
      </Button>

      <Portal>
        <Dialog visible={customerPicker} onDismiss={() => setCustomerPicker(false)}>
          <Dialog.Title>Select customer</Dialog.Title>
          <Dialog.ScrollArea>
            <FlatList
              data={customers.data || []}
              keyExtractor={(item) => item._id}
              renderItem={({ item }: { item: Customer }) => (
                <List.Item title={item.name} description={`${item.countryCode || '+91'} ${item.phone}`} onPress={() => { setSelectedCustomerId(item._id); setCustomerPicker(false); }} />
              )}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions><Button onPress={() => setCustomerPicker(false)}>Close</Button></Dialog.Actions>
        </Dialog>
        <Dialog visible={customerModal} onDismiss={() => setCustomerModal(false)}>
          <Dialog.Title>Quick add customer</Dialog.Title>
          <Dialog.Content>
            <FormTextInput control={customerForm.control} name="name" label="Name" />
            <PhoneInput control={customerForm.control} name="phone" />
            <FormTextInput control={customerForm.control} name="email" label="Email" />
            <FormTextInput control={customerForm.control} name="address" label="Address" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomerModal(false)}>Cancel</Button>
            <Button loading={addCustomer.isPending} onPress={customerForm.handleSubmit((values) => addCustomer.mutate(values))}>Save</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={customModal} onDismiss={() => setCustomModal(false)}>
          <Dialog.Title>Custom item</Dialog.Title>
          <Dialog.Content>
            <FormTextInput control={customForm.control} name="name" label="Name" />
            <FormTextInput control={customForm.control} name="price" label="Price" keyboardType="decimal-pad" />
            <FormTextInput control={customForm.control} name="quantity" label="Quantity" keyboardType="number-pad" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomModal(false)}>Cancel</Button>
            <Button onPress={customForm.handleSubmit((values) => { setItems((current) => [...current, { name: values.name, price: Number(values.price), quantity: Number(values.quantity || 1), isCustom: true }]); setCustomModal(false); customForm.reset(customDefaults); })}>Add</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={Boolean(oversell)} onDismiss={() => setOversell(null)}>
          <Dialog.Title>Stock warning</Dialog.Title>
          <Dialog.Content>
            {oversell?.items.map((item) => <Text key={item.productId}>{item.name}: app stock {item.available}, invoice quantity {item.requested}, shortage {item.shortage}</Text>)}
            <Text style={{ marginTop: 8 }}>Continue only if the item is physically available.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOversell(null)}>Cancel</Button>
            <Button onPress={() => oversell && createInvoiceMutation.mutate(oversell.payload)}>Continue</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { alignItems: 'center', alignSelf: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 12 },
  avatar: { alignItems: 'center', borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  avatarText: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.4 },
  countBadge: { alignItems: 'center', borderRadius: radii.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...fontStyles.bold, fontSize: 11 },
  customerActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  customerMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  customerName: { ...fontStyles.bold, fontSize: 14 },
  customerSelected: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 4, padding: 12 },
  dashedBtn: { alignItems: 'center', borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 8, paddingVertical: 12 },
  dashedBtnLabel: { ...fontStyles.bold, fontSize: 13 },
  emptyItemsText: { ...typeScale.caption, paddingVertical: 6 },
  emptyProductsText: { ...typeScale.caption, paddingVertical: 12, textAlign: 'center' },
  flexContent: { flex: 1, minWidth: 0 },
  generateButton: { borderRadius: radii.input, marginBottom: 18 },
  generateButtonContent: { paddingVertical: 6 },
  generateButtonLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 15 },
  grandTotalRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 10 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 20, letterSpacing: -0.4 },
  input: { fontSize: 14 },
  inputOutline: { borderRadius: radii.input },
  invoiceItem: { borderRadius: radii.md, borderWidth: 1, marginTop: 10, padding: spacing.cardPaddingCompact },
  invoiceItemsList: { maxHeight: INVOICE_ITEM_ROW_HEIGHT * VISIBLE_INVOICE_ITEM_ROWS },
  itemActions: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  itemHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  itemName: { ...fontStyles.semiBold, fontSize: 14 },
  itemTotal: { ...fontStyles.bold, fontSize: 14 },
  linkText: { ...fontStyles.bold, fontSize: 12 },
  listHint: { ...typeScale.caption, fontSize: 12 },
  primaryPick: { alignItems: 'center', borderRadius: radii.input, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 11 },
  primaryPickLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 13 },
  productList: { marginTop: 10, maxHeight: PRODUCT_ROW_HEIGHT * VISIBLE_PRODUCT_ROWS },
  productRow: { borderRadius: radii.md, borderWidth: 1, marginBottom: 8, paddingRight: 12 },
  productTitle: { ...fontStyles.semiBold, fontSize: 14 },
  removeBtn: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnLabel: { ...fontStyles.bold, fontSize: 12 },
  secondaryPick: { alignItems: 'center', borderRadius: radii.input, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 10 },
  secondaryPickLabel: { ...fontStyles.bold, fontSize: 13 },
  sectionCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 16 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16 },
  segmented: { marginVertical: 12 },
  stepper: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row' },
  stepperBtn: { alignItems: 'center', height: 32, justifyContent: 'center', width: 36 },
  stepperValue: { ...fontStyles.bold, fontSize: 14, minWidth: 24, textAlign: 'center' },
  totalLabel: { ...typeScale.bodyPrimary, fontSize: 14 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalsPanel: { borderRadius: radii.md, borderWidth: 1, gap: 8, marginTop: spacing.gridGap, padding: spacing.cardPadding },
  totalValue: { ...fontStyles.semiBold, fontSize: 14 }
});
