import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, invoicesApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useDocumentDraft } from '@/shared/drafts/useDocumentDraft';
import { queryKeys } from '@/shared/query/queryKeys';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAuthStore } from '@/store/authStore';
import { track } from '@/services/analytics';
import { useOnboardingOptional } from '@/features/onboarding';
import { Customer, DiscountType, InvoiceCreatePayload, InvoiceDraftPayload, InvoiceItem, Product, StockShortage } from '@/types';
import { calculateClientTotals } from '@/utils/format';
import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  hasInvoiceDraftContent,
  removeInvoiceItem,
  setItemQuantity,
  updateItemQuantity
} from '../services/invoiceBuilderService';

const PICKER_PAGE_SIZE = 20;

type StockWarning = { items: StockShortage[]; payload: InvoiceCreatePayload };
type ApiErrorWithDetails = { response?: { data?: { details?: { code?: string; items?: StockShortage[] } } } };

const stockShortagesFromError = (error: unknown) => {
  const details = (error as ApiErrorWithDetails)?.response?.data?.details;
  return details?.code === 'INSUFFICIENT_STOCK' && Array.isArray(details.items) ? details.items : null;
};

export const useInvoiceBuilder = ({
  onCreated,
  showDialog
}: {
  onCreated: (invoiceId: string) => void;
  showDialog: (dialog: { title: string; message?: string; tone?: 'default' | 'success' | 'error' | 'warning' }) => void;
}) => {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingOptional();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPicker, setCustomerPicker] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [customModal, setCustomModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  // Pre-fill the business default GST rate (Tax Settings); user can still edit or clear it per invoice.
  const defaultTaxRate = useAuthStore((state) => state.user?.businessProfile?.taxSettings?.defaultRate) ?? 0;
  const [taxRate, setTaxRate] = useState(() => String(defaultTaxRate));
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null);
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
  const activeCustomer = useMemo(
    () => selectedCustomer ?? customers.find((customer) => customer._id === selectedCustomerId) ?? null,
    [selectedCustomer, customers, selectedCustomerId]
  );
  const draftPayload = useMemo(
    () => buildInvoiceDraftPayload({ selectedCustomerId, selectedCustomer: activeCustomer, items, taxRate, discountType, discountValue, notes }),
    [activeCustomer, discountType, discountValue, items, notes, selectedCustomerId, taxRate]
  );
  const totals = useMemo(
    () => calculateClientTotals({ items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0) }),
    [items, taxRate, discountType, discountValue]
  );

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
    documentType: 'invoice',
    payload: draftPayload,
    hasPayloadContent,
    applyPayload: applyDraftPayload
  });

  const addCustomer = useMutation({
    mutationFn: customersApi.create,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onboarding?.completeTask('add_customer', 'action');
      setSelectedCustomerId(customer._id);
      setSelectedCustomer(customer);
      setCustomerModal(false);
    },
    onError: (error) => showDialog({ title: 'Could not add customer', message: apiErrorMessage(error), tone: 'error' })
  });

  const createInvoiceMutation = useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: (_invoice, payload) => {
      // No PII / amounts — counts and booleans only. Covers normal + oversell paths.
      track('invoice_created', {
        item_count: payload.items.length,
        has_discount: payload.discountValue > 0,
        oversell: Boolean(payload.allowOversell)
      });
      onboarding?.completeTask('create_invoice', 'action');
      onboarding?.markLocalFlag('invoiceCreateCount');
      draft.clearActiveDraft();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      queryClient.invalidateQueries({ queryKey: ['onboarding', 'progress'] });
    },
    onError: (error) => {
      const shortages = stockShortagesFromError(error);
      if (shortages) {
        setStockWarning({
          items: shortages,
          payload: buildInvoicePayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes, allowOversell: true })
        });
        return;
      }

      showDialog({ title: 'Could not create invoice', message: apiErrorMessage(error), tone: 'error' });
    }
  });

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer._id);
    setSelectedCustomer(customer);
    setCustomerPicker(false);
  };

  const addProduct = useCallback((product: Product) => setItems((current) => addProductToItems(current, product)), []);
  const updateQuantity = useCallback((index: number, delta: number) => setItems((current) => updateItemQuantity(current, index, delta)), []);
  const setQuantity = useCallback((index: number, quantity: number) => setItems((current) => setItemQuantity(current, index, quantity)), []);
  const removeItem = useCallback((index: number) => setItems((current) => removeInvoiceItem(current, index)), []);
  const addCustomItem = useCallback((item: InvoiceItem) => setItems((current) => [...current, item]), []);

  const buildPayload = useCallback(
    (allowOversell = false) => buildInvoicePayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes, allowOversell }),
    [selectedCustomerId, items, taxRate, discountType, discountValue, notes]
  );

  const createInvoice = async () => {
    // Re-entry guard: a second tap before isPending propagates would POST twice → duplicate invoice.
    if (createInvoiceMutation.isPending) return;

    if (!selectedCustomerId) {
      showDialog({ title: 'Select or add a customer', message: 'Choose a saved customer or quick add a new one before generating the invoice.', tone: 'warning' });
      return;
    }

    if (!items.length) {
      showDialog({ title: 'Add at least one item', message: 'Pick a product or add a custom item before generating the invoice.', tone: 'warning' });
      return;
    }

    try {
      const invoice = await createInvoiceMutation.mutateAsync(buildPayload(true));
      onCreated(invoice._id);
    } catch {
      // Stock warning / error already surfaced in createInvoiceMutation.onError.
    }
  };

  const continueWithOversell = async () => {
    if (!stockWarning || createInvoiceMutation.isPending) return;
    const payload = stockWarning.payload;
    setStockWarning(null);
    try {
      const invoice = await createInvoiceMutation.mutateAsync(payload);
      onCreated(invoice._id);
    } catch {
      // Error already surfaced in createInvoiceMutation.onError.
    }
  };

  const isGenerating = createInvoiceMutation.isPending;

  return {
    activeCustomer,
    addCustomer,
    addCustomItem,
    addProduct,
    createInvoice,
    createInvoiceMutation,
    customerModal,
    customerPicker,
    customerSearch,
    customers,
    customersQuery,
    customModal,
    discardRecoveryDraft: draft.discardRecoveryDraft,
    dismissRecoveryDraft: draft.dismissRecoveryDraft,
    draftHydrated: draft.draftHydrated,
    draftStatus: draft.draftStatus,
    duplicateDraft: draft.duplicateDraft,
    continueWithOversell,
    discountType,
    discountValue,
    hasDraftContent: draft.hasDraftContent,
    isDraftDirty: draft.isDraftDirty,
    isGenerating,
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
    setStockWarning,
    setTaxRate,
    stockWarning,
    taxRate,
    totals,
    updateQuantity,
    buildPayload
  };
};
