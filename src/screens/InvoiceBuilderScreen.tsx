
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, List, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { customersApi, invoicesApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { Customer, DiscountType, InvoiceItem, Product } from '@/types';
import { calculateClientTotals, formatCurrency } from '@/utils/format';
import { customItemSchema, customerSchema } from '@/validation/schemas';

const customerDefaults = { name: '', phone: '', email: '', address: '' };
const customDefaults = { name: '', price: '', quantity: '1' };

export function InvoiceBuilderScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const theme = useTheme();
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
    const query = productSearch.trim().toLowerCase();
    return (products.data || []).filter((product) => !query || [product.name, product.sku, product.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
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

  return (
    <Screen title="New Invoice">
      <AppCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text variant="titleMedium" style={{ fontWeight: '900' }}>Customer</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{selectedCustomer ? `${selectedCustomer.name} · ${selectedCustomer.phone}` : 'Select a customer'}</Text></View><Button onPress={() => setCustomerPicker(true)}>Choose</Button></View>
        <Button mode="outlined" onPress={() => setCustomerModal(true)} style={{ marginTop: 8 }}>Quick add customer</Button>
      </AppCard>
      <AppCard>
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 8 }}>Products</Text><TextInput mode="outlined" placeholder="Search products" value={productSearch} onChangeText={setProductSearch} />
        <FlatList data={filteredProducts.slice(0, 20)} keyExtractor={(item) => item._id} scrollEnabled={false} renderItem={({ item }) => <List.Item title={item.name} description={`${formatCurrency(item.price)} · Stock ${item.stockQuantity}`} onPress={() => addProduct(item)} right={(props) => <Button {...props} onPress={() => addProduct(item)}>Add</Button>} />} />
        <Button mode="outlined" onPress={() => setCustomModal(true)}>Add custom item</Button>
      </AppCard>
      <AppCard>
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 8 }}>Invoice items</Text>{items.length ? items.map((item, index) => <View key={`${item.name}-${index}`} style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>{item.name}</Text><Text>{item.quantity} x {formatCurrency(item.price)} = {formatCurrency(item.quantity * item.price)}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><Button mode="outlined" onPress={() => updateQuantity(index, -1)}>-</Button><Button mode="outlined" onPress={() => updateQuantity(index, 1)}>+</Button><Button mode="outlined" textColor={theme.colors.error} onPress={() => removeItem(index)}>Remove</Button></View></View>) : <Text style={{ color: theme.colors.onSurfaceVariant }}>No items yet.</Text>}
      </AppCard>
      <AppCard>
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 8 }}>Totals</Text><TextInput mode="outlined" label="Tax rate %" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" /><SegmentedButtons value={discountType} onValueChange={(value) => setDiscountType(value as DiscountType)} buttons={[{ value: 'flat', label: 'Flat' }, { value: 'percentage', label: '%' }]} style={{ marginVertical: 10 }} /><TextInput mode="outlined" label="Discount" value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" /><TextInput mode="outlined" label="Notes" value={notes} onChangeText={setNotes} multiline style={{ marginTop: 10 }} /><Text style={{ marginTop: 12 }}>Subtotal {formatCurrency(totals.subtotal)} · Discount {formatCurrency(totals.discountAmount)} · Tax {formatCurrency(totals.taxAmount)}</Text><Text variant="headlineSmall" style={{ fontWeight: '900', marginTop: 6 }}>Total {formatCurrency(totals.total)}</Text>
      </AppCard>
      <Button mode="contained" loading={createInvoiceMutation.isPending} onPress={createInvoice}>Generate invoice</Button>
      <Portal>
        <Dialog visible={customerPicker} onDismiss={() => setCustomerPicker(false)}><Dialog.Title>Select customer</Dialog.Title><Dialog.ScrollArea><FlatList data={customers.data || []} keyExtractor={(item) => item._id} renderItem={({ item }: { item: Customer }) => <List.Item title={item.name} description={item.phone} onPress={() => { setSelectedCustomerId(item._id); setCustomerPicker(false); }} />} /></Dialog.ScrollArea><Dialog.Actions><Button onPress={() => setCustomerPicker(false)}>Close</Button></Dialog.Actions></Dialog>
        <Dialog visible={customerModal} onDismiss={() => setCustomerModal(false)}><Dialog.Title>Quick add customer</Dialog.Title><Dialog.Content><FormTextInput control={customerForm.control} name="name" label="Name" /><FormTextInput control={customerForm.control} name="phone" label="Phone" /><FormTextInput control={customerForm.control} name="email" label="Email" /><FormTextInput control={customerForm.control} name="address" label="Address" /></Dialog.Content><Dialog.Actions><Button onPress={() => setCustomerModal(false)}>Cancel</Button><Button loading={addCustomer.isPending} onPress={customerForm.handleSubmit((values) => addCustomer.mutate(values))}>Save</Button></Dialog.Actions></Dialog>
        <Dialog visible={customModal} onDismiss={() => setCustomModal(false)}><Dialog.Title>Custom item</Dialog.Title><Dialog.Content><FormTextInput control={customForm.control} name="name" label="Name" /><FormTextInput control={customForm.control} name="price" label="Price" keyboardType="decimal-pad" /><FormTextInput control={customForm.control} name="quantity" label="Quantity" keyboardType="number-pad" /></Dialog.Content><Dialog.Actions><Button onPress={() => setCustomModal(false)}>Cancel</Button><Button onPress={customForm.handleSubmit((values) => { setItems((current) => [...current, { name: values.name, price: Number(values.price), quantity: Number(values.quantity || 1), isCustom: true }]); setCustomModal(false); customForm.reset(customDefaults); })}>Add</Button></Dialog.Actions></Dialog>
        <Dialog visible={Boolean(oversell)} onDismiss={() => setOversell(null)}><Dialog.Title>Stock warning</Dialog.Title><Dialog.Content>{oversell?.items.map((item) => <Text key={item.productId}>{item.name}: app stock {item.available}, invoice quantity {item.requested}, shortage {item.shortage}</Text>)}<Text style={{ marginTop: 8 }}>Continue only if the item is physically available.</Text></Dialog.Content><Dialog.Actions><Button onPress={() => setOversell(null)}>Cancel</Button><Button onPress={() => oversell && createInvoiceMutation.mutate(oversell.payload)}>Continue</Button></Dialog.Actions></Dialog>
      </Portal>
    </Screen>
  );
}
