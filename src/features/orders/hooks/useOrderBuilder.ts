import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, ordersApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { queryKeys } from '@/shared/query/queryKeys';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Customer, DiscountType, InvoiceItem, Product } from '@/types';
import { calculateClientTotals } from '@/utils/format';
import {
  addProductToItems,
  removeInvoiceItem,
  updateItemQuantity
} from '@/features/invoices/services/invoiceBuilderService';
import { buildOrderPayload } from '../services/orderBuilderService';

const PICKER_PAGE_SIZE = 20;

// Lightweight order builder. Reuses the invoice builder's pure item helpers and
// the shared picker queries, but deliberately skips the invoice-draft autosave
// machinery (orders need no local drafts in this release) and the stock-warning
// flow (orders never block on stock — see orderBuilderService).
export const useOrderBuilder = ({
  onCreated,
  showDialog
}: {
  onCreated: (orderId: string) => void;
  showDialog: (dialog: { title: string; message?: string; tone?: 'default' | 'success' | 'error' | 'warning' }) => void;
}) => {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPicker, setCustomerPicker] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [customModal, setCustomModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [taxRate, setTaxRate] = useState('0');
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);

  const customersQuery = useInfiniteQuery({
    queryKey: queryKeys.customers.picker({ search: debouncedCustomerSearch }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => customersApi.page({ search: debouncedCustomerSearch, page: pageParam, limit: PICKER_PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });

  const productsQuery = useInfiniteQuery({
    queryKey: queryKeys.products.picker({ search: debouncedProductSearch }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => productsApi.page({ search: debouncedProductSearch, page: pageParam, limit: PICKER_PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });

  const customers = useMemo(() => customersQuery.data?.pages.flatMap((page) => page.customers) ?? [], [customersQuery.data]);
  const products = useMemo(() => productsQuery.data?.pages.flatMap((page) => page.products) ?? [], [productsQuery.data]);
  const activeCustomer = selectedCustomer ?? customers.find((customer) => customer._id === selectedCustomerId) ?? null;
  const totals = calculateClientTotals({ items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0) });

  const addCustomer = useMutation({
    mutationFn: customersApi.create,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      setSelectedCustomerId(customer._id);
      setSelectedCustomer(customer);
      setCustomerModal(false);
    },
    onError: (error) => showDialog({ title: 'Could not add customer', message: apiErrorMessage(error), tone: 'error' })
  });

  const createOrderMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      onCreated(order._id);
    },
    onError: (error) => showDialog({ title: 'Could not create order', message: apiErrorMessage(error), tone: 'error' })
  });

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer._id);
    setSelectedCustomer(customer);
    setCustomerPicker(false);
  };

  const addProduct = (product: Product) => setItems((current) => addProductToItems(current, product));
  const updateQuantity = (index: number, delta: number) => setItems((current) => updateItemQuantity(current, index, delta));
  const removeItem = (index: number) => setItems((current) => removeInvoiceItem(current, index));
  const addCustomItem = (item: InvoiceItem) => setItems((current) => [...current, item]);

  const createOrder = () => {
    if (!selectedCustomerId) {
      showDialog({ title: 'Select or add a customer', message: 'Choose a saved customer or quick add a new one before creating the order.', tone: 'warning' });
      return;
    }

    if (!items.length) {
      showDialog({ title: 'Add at least one item', message: 'Pick a product or add a custom item before creating the order.', tone: 'warning' });
      return;
    }

    createOrderMutation.mutate(buildOrderPayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes }));
  };

  return {
    activeCustomer,
    addCustomer,
    addCustomItem,
    addProduct,
    createOrder,
    createOrderMutation,
    customerModal,
    customerPicker,
    customerSearch,
    customers,
    customersQuery,
    customModal,
    discountType,
    discountValue,
    items,
    notes,
    productSearch,
    products,
    productsQuery,
    removeItem,
    selectCustomer,
    setCustomerModal,
    setCustomerPicker,
    setCustomerSearch,
    setCustomModal,
    setDiscountType,
    setDiscountValue,
    setNotes,
    setProductSearch,
    setTaxRate,
    taxRate,
    totals,
    updateQuantity
  };
};
