import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { NavigationAction } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { Button, useTheme } from 'react-native-paper';
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
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { InvoiceBuilderScreenProps } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { CustomerFormValues, CustomItemFormValues } from '@/types';
import { customItemSchema, customerSchema } from '@/validation/schemas';

export function InvoiceBuilderScreen({ navigation }: InvoiceBuilderScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const [leavePromptVisible, setLeavePromptVisible] = useState(false);
  const pendingLeaveAction = useRef<NavigationAction | null>(null);
  const allowLeave = useRef(false);
  const customerForm = useForm<CustomerFormValues>({ defaultValues: customerDefaults, resolver: zodResolver(customerSchema) });
  const customForm = useForm<CustomItemFormValues>({ defaultValues: customItemDefaults, resolver: zodResolver(customItemSchema) });
  const builder = useInvoiceBuilder({
    onCreated: (invoiceId) => navigation.replace('InvoiceDetail', { id: invoiceId }),
    showDialog
  });
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);
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

  const loadMoreProducts = () => {
    if (builder.productsQuery.hasNextPage && !builder.productsQuery.isFetchingNextPage) void builder.productsQuery.fetchNextPage();
  };
  const loadMoreCustomers = () => {
    if (builder.customersQuery.hasNextPage && !builder.customersQuery.isFetchingNextPage) void builder.customersQuery.fetchNextPage();
  };
  const closeCustomerModal = () => {
    builder.setCustomerModal(false);
    customerForm.reset(customerDefaults);
  };
  const closeCustomModal = () => {
    builder.setCustomModal(false);
    customForm.reset(customItemDefaults);
  };

  return (
    <Screen
      title="New Invoice"
      titleAccessory={
        <DraftSyncIndicator isDirty={builder.isDraftDirty} lastSavedAt={builder.lastDraftSavedAt} status={builder.draftStatus} />
      }
    >
      <CustomerSelectorCard
        customer={builder.activeCustomer}
        cardBorder={cardBorder}
        colors={colors}
        isDark={isDark}
        onAdd={() => builder.setCustomerModal(true)}
        onChange={() => builder.setCustomerPicker(true)}
        subSurface={subSurface}
      />
      <ProductPickerList
        cardBorder={cardBorder}
        colors={colors}
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
      <Button
        mode="contained"
        loading={builder.createInvoiceMutation.isPending}
        onPress={builder.createInvoice}
        style={styles.generateButton}
        contentStyle={styles.generateButtonContent}
        labelStyle={styles.generateButtonLabel}
      >
        Generate invoice
      </Button>
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
        onSelectCustomer={builder.selectCustomer}
        onStockWarningClose={() => builder.setStockWarning(null)}
        onStockWarningContinue={builder.continueWithOversell}
        recoveryDraft={builder.recoveryDraft}
        selectedCustomerId={builder.activeCustomer?._id}
        stockWarning={builder.stockWarning}
      />
      <ConfirmDialog
        visible={leavePromptVisible}
        title="Leave invoice builder?"
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  generateButton: { borderRadius: radii.input, marginBottom: 18 },
  generateButtonContent: { paddingVertical: 6 },
  generateButtonLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 }
});
