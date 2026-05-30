import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { UseFormReturn } from 'react-hook-form';
import { Button, Dialog, List, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { FormTextInput } from '@/components/FormTextInput';
import { PhoneInput } from '@/components/PhoneInput';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { Customer, CustomerFormValues, CustomItemFormValues, DiscountType, DraftDocument, InvoiceDraftPayload, InvoiceItem, Product, StockShortage } from '@/types';
import { formatCurrency } from '@/utils/format';
import { customItemDefaults, customItemFromForm, initials } from '../services/invoiceBuilderService';
import { MoneyInput, QuantityInput } from './FormInputs';

const VISIBLE_PRODUCT_ROWS = 5;
const VISIBLE_INVOICE_ITEM_ROWS = 5;
const PRODUCT_ROW_HEIGHT = 72;
const INVOICE_ITEM_ROW_HEIGHT = 112;

type ColorSet = ReturnType<typeof appColors>;
type DraftStatus = 'idle' | 'saved' | 'syncing' | 'synced' | 'error';

export function DraftStatusBanner({
  cardBorder,
  colors,
  isDark,
  isDirty,
  lastSavedAt,
  status
}: {
  cardBorder: string;
  colors: ColorSet;
  isDark: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
  status: DraftStatus;
}) {
  const theme = useTheme();
  if (status === 'idle' || !lastSavedAt) return null;

  const savedTime = new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const message =
    status === 'syncing' ? 'Syncing draft...' :
    status === 'synced' && !isDirty ? `Draft synced at ${savedTime}` :
    status === 'error' ? `Draft saved locally at ${savedTime}. Will retry online.` :
    `Draft saved locally at ${savedTime}`;

  return (
    <View style={[styles.draftBanner, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: cardBorder }]}>
      <MaterialCommunityIcons name={status === 'error' ? 'cloud-alert-outline' : 'content-save-outline'} size={16} color={theme.colors.primary} />
      <Text style={[styles.draftBannerText, { color: theme.colors.onSurface }]}>{message}</Text>
    </View>
  );
}

export function CustomerSelectorCard({
  customer,
  cardBorder,
  colors,
  isDark,
  onAdd,
  onChange,
  subSurface
}: {
  customer: Customer | null;
  cardBorder: string;
  colors: ColorSet;
  isDark: boolean;
  onAdd: () => void;
  onChange: () => void;
  subSurface: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Customer</Text>
      </View>
      {customer ? (
        <>
          <View style={[styles.customerSelected, { backgroundColor: subSurface, borderColor: cardBorder }]}>
            <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(customer.name)}</Text>
            </View>
            <View style={styles.flexContent}>
              <Text style={[styles.customerName, { color: theme.colors.onSurface }]}>{customer.name}</Text>
              <Text style={[styles.customerMeta, { color: theme.colors.onSurfaceVariant }]}>{customer.countryCode || '+91'} {customer.phone}</Text>
            </View>
          </View>
          <View style={styles.customerActions}>
            <Pressable onPress={onChange} style={({ pressed }) => [styles.secondaryPick, { backgroundColor: alpha(colors.primary, pressed ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.32 : 0.2) }]}>
              <Feather name="users" size={15} color={theme.colors.primary} />
              <Text style={[styles.secondaryPickLabel, { color: theme.colors.primary }]}>Change</Text>
            </Pressable>
            <Pressable onPress={onAdd} style={({ pressed }) => [styles.primaryPick, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
              <Feather name="plus" size={15} color="#FFFFFF" />
              <Text style={styles.primaryPickLabel}>Add new</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.customerActions}>
          <Pressable onPress={onChange} style={({ pressed }) => [styles.primaryPick, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
            <Feather name="users" size={15} color="#FFFFFF" />
            <Text style={styles.primaryPickLabel}>Choose customer</Text>
          </Pressable>
          <Pressable onPress={onAdd} style={({ pressed }) => [styles.secondaryPick, { backgroundColor: alpha(colors.primary, pressed ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.32 : 0.2) }]}>
            <Feather name="plus" size={15} color={theme.colors.primary} />
            <Text style={[styles.secondaryPickLabel, { color: theme.colors.primary }]}>Quick add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ProductPickerList({
  cardBorder,
  colors,
  isDark,
  loadingMore,
  onAddProduct,
  onLoadMore,
  onOpenCustomItem,
  onSearchChange,
  products,
  search,
  subSurface
}: {
  cardBorder: string;
  colors: ColorSet;
  isDark: boolean;
  loadingMore: boolean;
  onAddProduct: (product: Product) => void;
  onLoadMore: () => void;
  onOpenCustomItem: () => void;
  onSearchChange: (value: string) => void;
  products: Product[];
  search: string;
  subSurface: string;
}) {
  const theme = useTheme();
  const inputBackground = isDark ? colors.surface : '#FFFFFF';

  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Products</Text>
        {products.length ? <Text style={[styles.listHint, { color: theme.colors.onSurfaceVariant }]}>{products.length} found</Text> : null}
      </View>
      <TextInput
        mode="outlined"
        placeholder="Search products"
        value={search}
        onChangeText={onSearchChange}
        outlineColor={cardBorder}
        activeOutlineColor={theme.colors.primary}
        outlineStyle={styles.inputOutline}
        style={[styles.input, { backgroundColor: inputBackground }]}
      />
      {products.length ? (
        <FlatList
          data={products}
          keyExtractor={(item) => item._id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={products.length > VISIBLE_PRODUCT_ROWS}
          style={styles.productList}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.primary} style={styles.inlineLoader} /> : null}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              titleStyle={[styles.productTitle, { color: theme.colors.onSurface }]}
              description={`${formatCurrency(item.price)} · Stock ${item.stockQuantity}`}
              descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
              style={[styles.productRow, { backgroundColor: subSurface, borderColor: cardBorder }]}
              onPress={() => onAddProduct(item)}
              right={() => (
                <Pressable onPress={() => onAddProduct(item)} style={({ pressed }) => [styles.addBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}>
                  <Feather name="plus" size={14} color="#FFFFFF" />
                  <Text style={styles.addBtnLabel}>Add</Text>
                </Pressable>
              )}
            />
          )}
        />
      ) : <Text style={[styles.emptyProductsText, { color: theme.colors.onSurfaceVariant }]}>No saved products found. Add a custom item below.</Text>}
      <Pressable onPress={onOpenCustomItem} style={({ pressed }) => [styles.dashedBtn, { borderColor: alpha(colors.primary, isDark ? 0.4 : 0.28), backgroundColor: alpha(colors.primary, pressed ? 0.12 : 0.04) }]}>
        <MaterialCommunityIcons name="plus-circle-outline" size={16} color={theme.colors.primary} />
        <Text style={[styles.dashedBtnLabel, { color: theme.colors.primary }]}>Add custom item</Text>
      </Pressable>
    </View>
  );
}

export function InvoiceItemsEditor({
  cardBorder,
  colors,
  isDark,
  items,
  onRemove,
  onUpdateQuantity,
  subSurface
}: {
  cardBorder: string;
  colors: ColorSet;
  isDark: boolean;
  items: InvoiceItem[];
  onRemove: (index: number) => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  subSurface: string;
}) {
  const theme = useTheme();

  return (
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
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={items.length > VISIBLE_INVOICE_ITEM_ROWS} scrollEnabled={items.length > VISIBLE_INVOICE_ITEM_ROWS} style={styles.invoiceItemsList}>
          {items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={[styles.invoiceItem, { backgroundColor: subSurface, borderColor: cardBorder }]}>
              <View style={styles.itemHeader}>
                <View style={styles.flexContent}>
                  <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                  <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>{item.quantity} x {formatCurrency(item.price)}</Text>
                </View>
                <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.quantity * item.price)}</Text>
              </View>
              <View style={styles.itemActions}>
                <View style={[styles.stepper, { borderColor: cardBorder, backgroundColor: colors.card }]}>
                  <Pressable onPress={() => onUpdateQuantity(index, -1)} style={styles.stepperBtn}>
                    <Feather name="minus" size={14} color={theme.colors.onSurface} />
                  </Pressable>
                  <Text style={[styles.stepperValue, { color: theme.colors.onSurface }]}>{item.quantity}</Text>
                  <Pressable onPress={() => onUpdateQuantity(index, 1)} style={styles.stepperBtn}>
                    <Feather name="plus" size={14} color={theme.colors.onSurface} />
                  </Pressable>
                </View>
                <Pressable onPress={() => onRemove(index)} style={({ pressed }) => [styles.removeBtn, { backgroundColor: alpha(colors.destructive, pressed ? 0.2 : isDark ? 0.16 : 0.1) }]}>
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : <Text style={[styles.emptyItemsText, { color: theme.colors.onSurfaceVariant }]}>No items yet.</Text>}
    </View>
  );
}

export function TotalsExtrasCard({
  cardBorder,
  colors,
  discountType,
  discountValue,
  inputBackground,
  notes,
  onDiscountTypeChange,
  onDiscountValueChange,
  onNotesChange,
  onTaxRateChange,
  subSurface,
  taxRate,
  totals
}: {
  cardBorder: string;
  colors: ColorSet;
  discountType: DiscountType;
  discountValue: string;
  inputBackground: string;
  notes: string;
  onDiscountTypeChange: (value: DiscountType) => void;
  onDiscountValueChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onTaxRateChange: (value: string) => void;
  subSurface: string;
  taxRate: string;
  totals: { subtotal: number; discountAmount: number; taxAmount: number; total: number };
}) {
  const theme = useTheme();

  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Totals & extras</Text>
      <MoneyInput cardBorder={cardBorder} inputBackground={inputBackground} label="Tax rate %" value={taxRate} onChangeText={onTaxRateChange} activeOutlineColor={theme.colors.primary} />
      <SegmentedButtons value={discountType} onValueChange={(value) => onDiscountTypeChange(value as DiscountType)} buttons={[{ value: 'flat', label: 'Flat' }, { value: 'percentage', label: 'Percent %' }]} style={styles.segmented} />
      <MoneyInput cardBorder={cardBorder} inputBackground={inputBackground} label="Discount" value={discountValue} onChangeText={onDiscountValueChange} activeOutlineColor={theme.colors.primary} />
      <TextInput
        mode="outlined"
        label="Notes"
        value={notes}
        onChangeText={onNotesChange}
        multiline
        outlineColor={cardBorder}
        activeOutlineColor={theme.colors.primary}
        outlineStyle={styles.inputOutline}
        style={[styles.input, { backgroundColor: inputBackground, marginTop: 10 }]}
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
  );
}

export function InvoiceBuilderDialogs({
  addCustomerLoading,
  customerForm,
  customerModal,
  customerPicker,
  customerSearch,
  customers,
  customForm,
  customModal,
  hasMoreCustomers,
  loadingMoreCustomers,
  onAddCustomItem,
  onCloseCustomerModal,
  onCloseCustomerPicker,
  onCloseCustomModal,
  onCustomerSearchChange,
  onCustomerSubmit,
  onLoadMoreCustomers,
  onSelectCustomer,
  onStockWarningClose,
  onStockWarningContinue,
  recoveryDraft,
  onRecoveryDiscard,
  onRecoveryDuplicate,
  onRecoveryResume,
  stockWarning
}: {
  addCustomerLoading: boolean;
  customerForm: UseFormReturn<CustomerFormValues>;
  customerModal: boolean;
  customerPicker: boolean;
  customerSearch: string;
  customers: Customer[];
  customForm: UseFormReturn<CustomItemFormValues>;
  customModal: boolean;
  hasMoreCustomers: boolean;
  loadingMoreCustomers: boolean;
  onAddCustomItem: (item: InvoiceItem) => void;
  onCloseCustomerModal: () => void;
  onCloseCustomerPicker: () => void;
  onCloseCustomModal: () => void;
  onCustomerSearchChange: (value: string) => void;
  onCustomerSubmit: (values: CustomerFormValues) => void;
  onLoadMoreCustomers: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onStockWarningClose: () => void;
  onStockWarningContinue: () => void;
  recoveryDraft: DraftDocument<InvoiceDraftPayload> | null;
  onRecoveryDiscard: () => void;
  onRecoveryDuplicate: () => void;
  onRecoveryResume: () => void;
  stockWarning: { items: StockShortage[] } | null;
}) {
  const theme = useTheme();
  const recoveryTime = recoveryDraft?.lastEditedAt ? new Date(recoveryDraft.lastEditedAt).toLocaleString() : '';

  return (
    <Portal>
      <Dialog visible={Boolean(recoveryDraft)} onDismiss={onRecoveryResume}>
        <Dialog.Title>Recover invoice draft</Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {recoveryTime ? `Saved ${recoveryTime}. ` : ''}Resume this draft, discard it, or duplicate it into a new draft.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button textColor={theme.colors.error} onPress={onRecoveryDiscard}>Discard</Button>
          <Button onPress={onRecoveryDuplicate}>Duplicate</Button>
          <Button onPress={onRecoveryResume}>Resume</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={customerPicker} onDismiss={onCloseCustomerPicker}>
        <Dialog.Title>Select customer</Dialog.Title>
        <Dialog.Content>
          <TextInput mode="outlined" placeholder="Search customers" value={customerSearch} onChangeText={onCustomerSearchChange} />
        </Dialog.Content>
        <Dialog.ScrollArea>
          <FlatList
            data={customers}
            keyExtractor={(item) => item._id}
            onEndReached={() => { if (hasMoreCustomers) onLoadMoreCustomers(); }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMoreCustomers ? <ActivityIndicator color={theme.colors.primary} style={styles.inlineLoader} /> : null}
            renderItem={({ item }) => (
              <List.Item title={item.name} description={`${item.countryCode || '+91'} ${item.phone}`} onPress={() => onSelectCustomer(item)} />
            )}
          />
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={onCloseCustomerPicker}>Close</Button></Dialog.Actions>
      </Dialog>

      <Dialog visible={customerModal} onDismiss={onCloseCustomerModal}>
        <Dialog.Title>Quick add customer</Dialog.Title>
        <Dialog.Content>
          <FormTextInput control={customerForm.control} name="name" label="Name" />
          <PhoneInput control={customerForm.control} name="phone" />
          <FormTextInput control={customerForm.control} name="email" label="Email" />
          <FormTextInput control={customerForm.control} name="address" label="Address" />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseCustomerModal}>Cancel</Button>
          <Button loading={addCustomerLoading} onPress={customerForm.handleSubmit(onCustomerSubmit)}>Save</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={customModal} onDismiss={onCloseCustomModal}>
        <Dialog.Title>Custom item</Dialog.Title>
        <Dialog.Content>
          <FormTextInput control={customForm.control} name="name" label="Name" />
          <MoneyInput cardBorder={theme.colors.outlineVariant} inputBackground={theme.colors.surface} label="Price" value={customForm.watch('price')} onChangeText={(value) => customForm.setValue('price', value)} activeOutlineColor={theme.colors.primary} />
          <QuantityInput cardBorder={theme.colors.outlineVariant} inputBackground={theme.colors.surface} label="Quantity" value={customForm.watch('quantity')} onChangeText={(value) => customForm.setValue('quantity', value)} activeOutlineColor={theme.colors.primary} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseCustomModal}>Cancel</Button>
          <Button onPress={customForm.handleSubmit((values) => { onAddCustomItem(customItemFromForm(values)); onCloseCustomModal(); customForm.reset(customItemDefaults); })}>Add</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={Boolean(stockWarning)} onDismiss={onStockWarningClose}>
        <Dialog.Title>Stock warning</Dialog.Title>
        <Dialog.Content>
          {stockWarning?.items.map((item) => <Text key={item.productId}>{item.name}: app stock {item.available}, invoice quantity {item.requested}, shortage {item.shortage}</Text>)}
          <Text style={{ marginTop: 8 }}>Continue only if the item is physically available.</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onStockWarningClose}>Cancel</Button>
          <Button onPress={onStockWarningContinue}>Continue</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
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
  draftBanner: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 16, paddingHorizontal: 12, paddingVertical: 10 },
  draftBannerText: { ...fontStyles.semiBold, flex: 1, fontSize: 12 },
  emptyItemsText: { ...typeScale.caption, paddingVertical: 6 },
  emptyProductsText: { ...typeScale.caption, paddingVertical: 12, textAlign: 'center' },
  flexContent: { flex: 1, minWidth: 0 },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 15 },
  grandTotalRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 10 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 20, letterSpacing: -0.4 },
  inlineLoader: { marginVertical: 8 },
  input: { fontSize: 14 },
  inputOutline: { borderRadius: radii.input },
  invoiceItem: { borderRadius: radii.md, borderWidth: 1, marginTop: 10, padding: spacing.cardPaddingCompact },
  invoiceItemsList: { maxHeight: INVOICE_ITEM_ROW_HEIGHT * VISIBLE_INVOICE_ITEM_ROWS },
  itemActions: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  itemHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  itemName: { ...fontStyles.semiBold, fontSize: 14 },
  itemTotal: { ...fontStyles.bold, fontSize: 14 },
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
