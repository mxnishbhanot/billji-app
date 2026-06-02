import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, ordersApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useDocumentDraft } from '@/shared/drafts/useDocumentDraft';
import { queryKeys } from '@/shared/query/queryKeys';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAuthStore } from '@/store/authStore';
import { Customer, DiscountType, InvoiceDraftPayload, InvoiceItem, Product } from '@/types';
import { calculateClientTotals } from '@/utils/format';
import {
  addProductToItems,
  buildInvoiceDraftPayload,
  hasInvoiceDraftContent,
  removeInvoiceItem,
  setItemQuantity,
  updateItemQuantity
} from '@/features/invoices/services/invoiceBuilderService';
import { buildOrderPayload } from '../services/orderBuilderService';

const PICKER_PAGE_SIZE = 20;

// Order builder. Reuses the invoice builder's pure item helpers, the shared picker
// queries, and the shared draft autosave (documentType 'order' — same payload shape),
// but skips the stock-warning flow (orders never block on stock — see orderBuilderService).
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
  // Pre-fill the business default GST rate (Tax Settings); user can still edit or clear it per order.
  const defaultTaxRate = useAuthStore((state) => state.user?.businessProfile?.taxSettings?.defaultRate) ?? 0;
  const [taxRate, setTaxRate] = useState(() => String(defaultTaxRate));
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
  const draftPayload = useMemo(
    () => buildInvoiceDraftPayload({ selectedCustomerId, selectedCustomer: activeCustomer, items, taxRate, discountType, discountValue, notes }),
    [activeCustomer, discountType, discountValue, items, notes, selectedCustomerId, taxRate]
  );
  const totals = calculateClientTotals({ items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0) });

  const applyDraftPayload = useCallback((payload: InvoiceDraftPayload) => {
    setSelectedCustomerId(payload.selectedCustomerId);
    setSelectedCustomer(payload.selectedCustomer);
    setItems(payload.items);
    setTaxRate(payload.taxRate);
    setDiscountType(payload.discountType);
    setDiscountValue(payload.discountValue);
    setNotes(payload.notes);
  }, []);

  // A builder holding only the pre-filled default rate has no user content — don't autosave it.
  const hasPayloadContent = useCallback((payload: InvoiceDraftPayload) => hasInvoiceDraftContent(payload, defaultTaxRate), [defaultTaxRate]);

  const draft = useDocumentDraft<InvoiceDraftPayload>({
    documentType: 'order',
    payload: draftPayload,
    hasPayloadContent,
    applyPayload: applyDraftPayload
  });

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
      draft.clearActiveDraft();
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
  const setQuantity = (index: number, quantity: number) => setItems((current) => setItemQuantity(current, index, quantity));
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
    discardRecoveryDraft: draft.discardRecoveryDraft,
    discountType,
    discountValue,
    draftHydrated: draft.draftHydrated,
    draftStatus: draft.draftStatus,
    duplicateDraft: draft.duplicateDraft,
    hasDraftContent: draft.hasDraftContent,
    isDraftDirty: draft.isDraftDirty,
    items,
    lastDraftSavedAt: draft.lastDraftSavedAt,
    notes,
    productSearch,
    products,
    productsQuery,
    recoveryDraft: draft.recoveryDraft,
    removeItem,
    resumeDraft: draft.resumeDraft,
    selectCustomer,
    setCustomerModal,
    setCustomerPicker,
    setCustomerSearch,
    setCustomModal,
    setDiscountType,
    setDiscountValue,
    setNotes,
    setProductSearch,
    setQuantity,
    setTaxRate,
    taxRate,
    totals,
    updateQuantity
  };
};
