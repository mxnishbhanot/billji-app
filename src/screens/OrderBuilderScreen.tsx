import { StyleSheet } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, useTheme } from 'react-native-paper';
import {
  CustomerSelectorCard,
  InvoiceBuilderDialogs,
  InvoiceItemsEditor,
  ProductPickerList,
  TotalsExtrasCard
} from '@/features/invoices/components/InvoiceBuilderParts';
import { customerDefaults, customItemDefaults } from '@/features/invoices/services/invoiceBuilderService';
import { useOrderBuilder } from '@/features/orders/hooks/useOrderBuilder';
import { useAppDialog } from '@/components/AppDialog';
import { Screen } from '@/components/Screen';
import { OrderBuilderScreenProps } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { CustomerFormValues, CustomItemFormValues } from '@/types';
import { customItemSchema, customerSchema } from '@/validation/schemas';

export function OrderBuilderScreen({ navigation }: OrderBuilderScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const customerForm = useForm<CustomerFormValues>({ defaultValues: customerDefaults, resolver: zodResolver(customerSchema) });
  const customForm = useForm<CustomItemFormValues>({ defaultValues: customItemDefaults, resolver: zodResolver(customItemSchema) });
  const builder = useOrderBuilder({
    onCreated: (orderId) => navigation.replace('OrderDetail', { id: orderId }),
    showDialog
  });
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);
  const inputBackground = isDark ? colors.surface : '#FFFFFF';

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
    <Screen title="New Order">
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
        loading={builder.createOrderMutation.isPending}
        onPress={builder.createOrder}
        style={styles.createButton}
        contentStyle={styles.createButtonContent}
        labelStyle={styles.createButtonLabel}
      >
        Create order
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
        loadingMoreCustomers={builder.customersQuery.isFetchingNextPage}
        onAddCustomItem={builder.addCustomItem}
        onCloseCustomerModal={closeCustomerModal}
        onCloseCustomerPicker={() => builder.setCustomerPicker(false)}
        onCloseCustomModal={closeCustomModal}
        onCustomerSearchChange={builder.setCustomerSearch}
        onCustomerSubmit={(values) => builder.addCustomer.mutate(values, { onSuccess: () => customerForm.reset(customerDefaults) })}
        onLoadMoreCustomers={loadMoreCustomers}
        onSelectCustomer={builder.selectCustomer}
        onStockWarningClose={() => undefined}
        onStockWarningContinue={() => undefined}
        recoveryDraft={null}
        onRecoveryDiscard={() => undefined}
        onRecoveryDuplicate={() => undefined}
        onRecoveryResume={() => undefined}
        stockWarning={null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  createButton: { borderRadius: radii.input, marginBottom: 18 },
  createButtonContent: { paddingVertical: 6 },
  createButtonLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 }
});
