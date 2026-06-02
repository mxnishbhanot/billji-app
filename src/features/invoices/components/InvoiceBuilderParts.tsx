import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { UseFormReturn } from 'react-hook-form';
import { Button, Dialog, List, Portal, SegmentedButtons, Text, TextInput, Tooltip, useTheme } from 'react-native-paper';
import { CustomerPickerSheet } from '@/components/CustomerPickerSheet';
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

// Quick syncs (<250ms) would make the spinner flash for a frame, so it only
// appears for slow syncs and then stays up long enough to read.
const SPINNER_DELAY_MS = 250;
const SPINNER_MIN_VISIBLE_MS = 700;

// Google-Docs-style sync state: a quiet cloud icon beside the screen title.
// Tap (or hover on web) for the full message via tooltip.
export function DraftSyncIndicator({
  isDirty,
  lastSavedAt,
  status
}: {
  isDirty: boolean;
  lastSavedAt: string | null;
  status: DraftStatus;
}) {
  const theme = useTheme();
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerShownAtRef = useRef(0);
  const lastStableStatusRef = useRef<DraftStatus>('idle');
  if (status !== 'syncing') lastStableStatusRef.current = status;

  useEffect(() => {
    if (status === 'syncing') {
      const timeout = setTimeout(() => {
        spinnerShownAtRef.current = Date.now();
        setShowSpinner(true);
      }, SPINNER_DELAY_MS);
      return () => clearTimeout(timeout);
    }

    if (!showSpinner) return undefined;
    const remaining = SPINNER_MIN_VISIBLE_MS - (Date.now() - spinnerShownAtRef.current);
    if (remaining <= 0) {
      setShowSpinner(false);
      return undefined;
    }
    const timeout = setTimeout(() => setShowSpinner(false), remaining);
    return () => clearTimeout(timeout);
  }, [status, showSpinner]);

  // While a fast sync is in flight, keep showing the last stable icon instead of flashing.
  const displayStatus = status === 'syncing' ? lastStableStatusRef.current : status;
  if (displayStatus === 'idle' && !showSpinner) return null;

  const savedTime = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const pendingSync = displayStatus === 'saved' || (displayStatus === 'synced' && isDirty);
  const icon = displayStatus === 'error' ? 'cloud-alert-outline' : pendingSync ? 'cloud-upload-outline' : 'cloud-check-outline';
  const label =
    showSpinner ? 'Saving…' :
    displayStatus === 'error' ? 'Saved on this device — will sync when online' :
    pendingSync ? 'Saved on this device' :
    savedTime ? `Saved at ${savedTime}` : 'Saved';
  const color = displayStatus === 'error' ? theme.colors.error : theme.colors.onSurfaceVariant;

  return (
    <Tooltip title={label}>
      <View accessibilityLabel={label} style={styles.draftSyncIndicator}>
        {showSpinner
          ? <ActivityIndicator size={14} color={color} />
          : <MaterialCommunityIcons name={icon} size={17} color={color} />}
      </View>
    </Tooltip>
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

function QuantityStepper({
  cardBorder,
  colors,
  index,
  onSetQuantity,
  onUpdateQuantity,
  quantity
}: {
  cardBorder: string;
  colors: ColorSet;
  index: number;
  onSetQuantity: (index: number, quantity: number) => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  quantity: number;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed !== quantity) onSetQuantity(index, parsed);
  };

  return (
    <View style={[styles.stepper, { borderColor: cardBorder, backgroundColor: colors.card }]}>
      <Pressable onPress={() => onUpdateQuantity(index, -1)} style={styles.stepperBtn}>
        <Feather name="minus" size={14} color={theme.colors.onSurface} />
      </Pressable>
      {editing ? (
        <RNTextInput
          autoFocus
          keyboardType="number-pad"
          maxLength={5}
          selectTextOnFocus
          value={draft}
          onChangeText={(value) => setDraft(value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onSubmitEditing={commit}
          style={[styles.stepperInput, { color: theme.colors.onSurface }]}
        />
      ) : (
        <Pressable onPress={() => { setDraft(String(quantity)); setEditing(true); }} hitSlop={8}>
          <Text style={[styles.stepperValue, { color: theme.colors.onSurface }]}>{quantity}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => onUpdateQuantity(index, 1)} style={styles.stepperBtn}>
        <Feather name="plus" size={14} color={theme.colors.onSurface} />
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
  onSetQuantity,
  onUpdateQuantity,
  subSurface
}: {
  cardBorder: string;
  colors: ColorSet;
  isDark: boolean;
  items: InvoiceItem[];
  onRemove: (index: number) => void;
  onSetQuantity: (index: number, quantity: number) => void;
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
                <QuantityStepper cardBorder={cardBorder} colors={colors} index={index} quantity={item.quantity} onSetQuantity={onSetQuantity} onUpdateQuantity={onUpdateQuantity} />
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
  loadingCustomers,
  loadingMoreCustomers,
  onAddCustomItem,
  onCloseCustomerModal,
  onCloseCustomerPicker,
  onCloseCustomModal,
  onCustomerSearchChange,
  onCustomerSubmit,
  onLoadMoreCustomers,
  onQuickAddCustomer,
  onSelectCustomer,
  onStockWarningClose,
  onStockWarningContinue,
  recoveryDraft,
  recoveryTitle = 'Recover invoice draft',
  onRecoveryDiscard,
  onRecoveryDuplicate,
  onRecoveryResume,
  selectedCustomerId,
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
  loadingCustomers: boolean;
  loadingMoreCustomers: boolean;
  onAddCustomItem: (item: InvoiceItem) => void;
  onCloseCustomerModal: () => void;
  onCloseCustomerPicker: () => void;
  onCloseCustomModal: () => void;
  onCustomerSearchChange: (value: string) => void;
  onCustomerSubmit: (values: CustomerFormValues) => void;
  onLoadMoreCustomers: () => void;
  onQuickAddCustomer: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onStockWarningClose: () => void;
  onStockWarningContinue: () => void;
  recoveryDraft: DraftDocument<InvoiceDraftPayload> | null;
  recoveryTitle?: string;
  onRecoveryDiscard: () => void;
  onRecoveryDuplicate: () => void;
  onRecoveryResume: () => void;
  selectedCustomerId?: string;
  stockWarning: { items: StockShortage[] } | null;
}) {
  const theme = useTheme();
  const recoveryTime = recoveryDraft?.lastEditedAt ? new Date(recoveryDraft.lastEditedAt).toLocaleString() : '';

  return (
    <>
    <CustomerPickerSheet
      visible={customerPicker}
      customers={customers}
      selectedCustomerId={selectedCustomerId}
      search={customerSearch}
      loading={loadingCustomers}
      loadingMore={loadingMoreCustomers}
      hasMore={hasMoreCustomers}
      onSearchChange={onCustomerSearchChange}
      onLoadMore={onLoadMoreCustomers}
      onSelect={onSelectCustomer}
      onQuickAdd={onQuickAddCustomer}
      onClose={onCloseCustomerPicker}
    />
    <Portal>
      <Dialog visible={Boolean(recoveryDraft)} onDismiss={onRecoveryResume}>
        <Dialog.Title>{recoveryTitle}</Dialog.Title>
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
    </>
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
  draftSyncIndicator: { alignItems: 'center', height: 20, justifyContent: 'center', width: 20 },
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
  stepperInput: { ...fontStyles.bold, fontSize: 14, minWidth: 44, paddingHorizontal: 4, paddingVertical: 0, textAlign: 'center' },
  stepperValue: { ...fontStyles.bold, fontSize: 14, minWidth: 24, textAlign: 'center' },
  totalLabel: { ...typeScale.bodyPrimary, fontSize: 14 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalsPanel: { borderRadius: radii.md, borderWidth: 1, gap: 8, marginTop: spacing.gridGap, padding: spacing.cardPadding },
  totalValue: { ...fontStyles.semiBold, fontSize: 14 }
});
