import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { NavigationAction } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Feather } from '@expo/vector-icons';
import { Button, Text, useTheme } from 'react-native-paper';
import {
  CustomerSelectorCard,
  DraftSyncIndicator,
  InvoiceBuilderDialogs,
  InvoiceItemsEditor,
  ProductPickerList,
  TotalsExtrasCard
} from '@/features/invoices/components/InvoiceBuilderParts';
import { useInvoiceBuilder } from '@/features/invoices/hooks/useInvoiceBuilder';
import { customerDefaults, customItemDefaults } from '@/features/invoices/services/invoiceBuilderService';
import { invoicesApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { BarcodeScannerSheet } from '@/components/BarcodeScannerSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { LIMIT } from '@/constants/entitlements';
import { useEntitlements } from '@/shared/hooks/useEntitlements';
import { InvoiceBuilderScreenProps } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { CustomerFormValues, CustomItemFormValues, documentNumberOf } from '@/types';
import { customItemSchema, customerSchema } from '@/validation/schemas';

const TITLES: Record<string, string> = { quotation: 'New Quotation', delivery_challan: 'New Challan', credit_note: 'New Credit Note' };
const NOUNS: Record<string, string> = { quotation: 'quotation', delivery_challan: 'challan', credit_note: 'credit note' };

export function InvoiceBuilderScreen({ navigation, route }: InvoiceBuilderScreenProps) {
  // Same builder for every sales document; the type only changes the title and the endpoint.
  const documentType = route.params?.documentType;
  const prefillFromInvoiceId = route.params?.prefillFromInvoiceId;
  const noun = (documentType && NOUNS[documentType]) || 'invoice';
  const prefillApplied = useRef(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const [leavePromptVisible, setLeavePromptVisible] = useState(false);
  const pendingLeaveAction = useRef<NavigationAction | null>(null);
  const allowLeave = useRef(false);
  const customerForm = useForm<CustomerFormValues>({ defaultValues: customerDefaults, resolver: zodResolver(customerSchema) });
  const customForm = useForm<CustomItemFormValues>({ defaultValues: customItemDefaults, resolver: zodResolver(customItemSchema) });
  const builder = useInvoiceBuilder({
    // Quotations and challans live under /documents — the invoice detail screen cannot load
    // them, so land on the Documents list for that kind instead.
    onCreated: (document) => {
      if (documentType) {
        showToast(`${TITLES[documentType].replace('New ', '')} ${documentNumberOf(document)} created`, 'success');
        navigation.replace('Documents', { documentType });
        return;
      }
      navigation.replace('InvoiceDetail', { id: document._id });
    },
    showDialog,
    documentType,
    documentNoun: noun
  });
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);
  const entitlements = useEntitlements();
  const documentQuota = entitlements.usage(LIMIT.documentsPerMonth);
  const quotaTone = documentQuota && documentQuota.remaining === 0 ? colors.destructive : colors.warning;
  const inputBackground = isDark ? colors.surface : '#FFFFFF';

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      // Blur-triggered popToTop (tab switch) must not be blocked — the draft is already saved
      // locally and is offered for recovery on the next visit.
      if (!navigation.isFocused()) return;
      if (allowLeave.current || !builder.hasDraftContent || !builder.isDraftDirty || builder.createInvoiceMutation.isPending) return;
      event.preventDefault();
      pendingLeaveAction.current = event.data.action;
      setLeavePromptVisible(true);
    });

    return unsubscribe;
  }, [builder.createInvoiceMutation.isPending, builder.hasDraftContent, builder.isDraftDirty, navigation]);

  // "Duplicate & correct": load the source invoice and seed the form once. The recovery
  // prompt is dismissed alongside it — the user asked for this invoice specifically, so an
  // unrelated saved draft must not overwrite it or compete for the same screen.
  const prefillQuery = useQuery({
    queryKey: queryKeys.invoices.detail(prefillFromInvoiceId ?? ''),
    queryFn: () => invoicesApi.get(prefillFromInvoiceId as string),
    enabled: Boolean(prefillFromInvoiceId)
  });

  useEffect(() => {
    if (prefillApplied.current || !prefillFromInvoiceId || !prefillQuery.data) return;
    prefillApplied.current = true;
    builder.applyPrefillInvoice(prefillQuery.data);
  }, [builder, prefillFromInvoiceId, prefillQuery.data]);

  // Draft hydration and the invoice fetch race each other, so dismiss on whichever order they
  // land in — otherwise a late recovery prompt could offer to overwrite the invoice being corrected.
  useEffect(() => {
    if (prefillFromInvoiceId && builder.recoveryDraft) builder.dismissRecoveryDraft();
  }, [builder, prefillFromInvoiceId]);

  const loadMoreProducts = () => {
    if (builder.productsQuery.hasNextPage && !builder.productsQuery.isFetchingNextPage) void builder.productsQuery.fetchNextPage();
  };
  const loadMoreCustomers = () => {
    if (builder.customersQuery.hasNextPage && !builder.customersQuery.isFetchingNextPage) void builder.customersQuery.fetchNextPage();
  };
  // Dismissing a sheet keeps what was typed — a stray backdrop tap above the keyboard used to
  // wipe a half-entered customer. Both forms are reset on successful submit instead, so
  // reopening during the same invoice resumes where the user left off.
  const closeCustomerModal = () => builder.setCustomerModal(false);
  const closeCustomModal = () => builder.setCustomModal(false);
  const openPreview = () => {
    if (!builder.activeCustomer) {
      showDialog({ title: 'Select or add a customer', message: `Choose a saved customer or quick add a new one before previewing the ${noun}.`, tone: 'warning' });
      return;
    }
    if (!builder.items.length) {
      showDialog({ title: 'Add at least one item', message: `Pick a product or add a custom item before previewing the ${noun}.`, tone: 'warning' });
      return;
    }
    navigation.navigate('InvoicePreview', { payload: { ...builder.buildPayload(false), ...(documentType ? { documentType } : {}) } });
  };

  return (
    <Screen
      title={documentType ? TITLES[documentType] : 'New Invoice'}
      titleAccessory={
        <DraftSyncIndicator isDirty={builder.isDraftDirty} lastSavedAt={builder.lastDraftSavedAt} status={builder.draftStatus} />
      }
    >
      {/* Only once the month is nearly spent. A quota line on every bill would be noise, and the
          number is the same one the settings row and the dashboard meter read. */}
      {documentQuota && !documentQuota.unlimited && documentQuota.percentUsed >= 80 ? (
        <View style={[styles.quotaHint, { backgroundColor: alpha(quotaTone, isDark ? 0.18 : 0.09), borderColor: alpha(quotaTone, 0.28) }]}>
          <Feather name="alert-circle" size={14} color={quotaTone} />
          <Text style={[styles.quotaHintText, { color: quotaTone }]}>
            {documentQuota.remaining !== null && documentQuota.remaining > 0
              ? `${documentQuota.remaining} of ${documentQuota.limit} documents left this month`
              : `You have used all ${documentQuota.limit} documents on your plan`}
          </Text>
        </View>
      ) : null}
      <CustomerSelectorCard
        customer={builder.activeCustomer}
        cardBorder={cardBorder}
        customerOptional
        colors={colors}
        isDark={isDark}
        onAdd={() => builder.setCustomerModal(true)}
        onChange={() => builder.setCustomerPicker(true)}
        subSurface={subSurface}
      />
      {/* Scan straight onto the bill — the fastest path at a shop counter. Typing and
          searching stay right below it, so a missing barcode is never a dead end. */}
      <Pressable
        onPress={() => setScannerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Scan barcode to add item"
        style={({ pressed }) => [
          styles.scanRow,
          { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: alpha(colors.primary, isDark ? 0.3 : 0.18), opacity: pressed ? 0.9 : 1 }
        ]}
      >
        <Feather name="maximize" size={16} color={theme.colors.primary} />
        <Text style={[styles.scanRowLabel, { color: theme.colors.primary }]}>Scan barcode</Text>
      </Pressable>
      <ProductPickerList
        cardBorder={cardBorder}
        colors={colors}
        hasMore={Boolean(builder.productsQuery.hasNextPage)}
        isDark={isDark}
        loadingMore={builder.productsQuery.isFetchingNextPage}
        onAddProduct={builder.addProduct}
        onLoadMore={loadMoreProducts}
        onOpenCustomItem={() => builder.setCustomModal(true)}
        onSearchChange={builder.setProductSearch}
        products={builder.products}
        search={builder.productSearch}
        subSurface={subSurface}
      />
      <InvoiceItemsEditor
        cardBorder={cardBorder}
        colors={colors}
        isDark={isDark}
        items={builder.items}
        onRemove={builder.removeItem}
        onSetPrice={builder.setPrice}
        onSetQuantity={builder.setQuantity}
        onUpdateQuantity={builder.updateQuantity}
        subSurface={subSurface}
      />
      <TotalsExtrasCard
        cardBorder={cardBorder}
        colors={colors}
        discountType={builder.discountType}
        discountValue={builder.discountValue}
        inputBackground={inputBackground}
        notes={builder.notes}
        onDiscountTypeChange={builder.setDiscountType}
        onDiscountValueChange={builder.setDiscountValue}
        onNotesChange={builder.setNotes}
        onTaxRateChange={builder.setTaxRate}
        subSurface={subSurface}
        taxRate={builder.taxRate}
        totals={builder.totals}
      />
      <View style={styles.actionRow}>
        <Button mode="outlined" onPress={openPreview} style={styles.previewButton} contentStyle={styles.generateButtonContent} labelStyle={styles.generateButtonLabel}>
          Preview
        </Button>
        <Button
          mode="contained"
          loading={builder.isGenerating}
          disabled={builder.isGenerating}
          onPress={builder.createInvoice}
          style={styles.generateButton}
          contentStyle={styles.generateButtonContent}
          labelStyle={styles.generateButtonLabel}
        >
          Generate {noun}
        </Button>
      </View>
      <InvoiceBuilderDialogs
        addCustomerLoading={builder.addCustomer.isPending}
        customerForm={customerForm}
        customerModal={builder.customerModal}
        customerPicker={builder.customerPicker}
        customerSearch={builder.customerSearch}
        customers={builder.customers}
        customForm={customForm}
        customModal={builder.customModal}
        hasMoreCustomers={Boolean(builder.customersQuery.hasNextPage)}
        loadingCustomers={builder.customersQuery.isLoading || (builder.customersQuery.isFetching && !builder.customersQuery.isFetchingNextPage)}
        loadingMoreCustomers={builder.customersQuery.isFetchingNextPage}
        onAddCustomItem={builder.addCustomItem}
        onCloseCustomerModal={closeCustomerModal}
        onCloseCustomerPicker={() => builder.setCustomerPicker(false)}
        onCloseCustomModal={closeCustomModal}
        onCustomerSearchChange={builder.setCustomerSearch}
        onCustomerSubmit={(values) => builder.addCustomer.mutate(values, { onSuccess: () => customerForm.reset(customerDefaults) })}
        onLoadMoreCustomers={loadMoreCustomers}
        onQuickAddCustomer={() => {
          builder.setCustomerPicker(false);
          builder.setCustomerModal(true);
        }}
        onRecoveryDiscard={builder.discardRecoveryDraft}
        onRecoveryDuplicate={builder.duplicateDraft}
        onRecoveryResume={builder.resumeDraft}
        onRecoveryDismiss={builder.dismissRecoveryDraft}
        onSelectCustomer={builder.selectCustomer}
        onStockWarningClose={() => builder.setStockWarning(null)}
        onStockWarningContinue={builder.continueWithOversell}
        recoveryDraft={builder.recoveryDraft}
        selectedCustomerId={builder.activeCustomer?._id}
        stockWarning={builder.stockWarning}
      />
      <UpgradeSheet
        visible={Boolean(builder.paywall)}
        metric={builder.paywall?.metric}
        limit={builder.paywall?.limit}
        currentPlan={builder.paywall?.currentPlan}
        requiredPlans={builder.paywall?.requiredPlans}
        message={builder.paywall?.message}
        onClose={builder.dismissPaywall}
      />
      <ConfirmDialog
        visible={leavePromptVisible}
        title={`Leave ${noun} builder?`}
        message="Your draft is saved and can be resumed later."
        confirmLabel="Leave"
        onCancel={() => {
          pendingLeaveAction.current = null;
          setLeavePromptVisible(false);
        }}
        onConfirm={() => {
          const action = pendingLeaveAction.current;
          pendingLeaveAction.current = null;
          setLeavePromptVisible(false);
          allowLeave.current = true;
          if (action) navigation.dispatch(action);
        }}
      />
      <BarcodeScannerSheet
        visible={scannerOpen}
        title="Scan to add item"
        hint="Scan a product label to add it to the bill"
        onClose={() => setScannerOpen(false)}
        onScanned={(code) => void builder.addScannedProduct(code)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quotaHint: { alignItems: 'center', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10 },
  quotaHintText: { ...fontStyles.medium, flex: 1, fontSize: 12 },
  scanRow: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 10, paddingVertical: 12 },
  scanRowLabel: { ...fontStyles.semiBold, fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  generateButton: { borderRadius: radii.input, flex: 1 },
  generateButtonContent: { paddingVertical: 6 },
  generateButtonLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 },
  previewButton: { borderRadius: radii.input, flex: 1 }
});
