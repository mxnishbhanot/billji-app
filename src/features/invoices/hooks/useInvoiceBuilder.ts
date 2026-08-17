import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, documentsApi, invoicesApi, productsApi } from '@/api/endpoints';
import { useAppToast } from '@/components/AppToast';
import { PaywallError, apiErrorMessage, isPaywallError } from '@/api/client';
import { useDocumentDraft } from '@/shared/drafts/useDocumentDraft';
import { useSupplyType } from '@/shared/gst/useSupplyType';
import { queryKeys } from '@/shared/query/queryKeys';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAuthStore } from '@/store/authStore';
import { track } from '@/services/analytics';
import { useOnboardingOptional } from '@/features/onboarding';
import { Customer, DiscountType, Invoice, InvoiceCreatePayload, InvoiceDraftPayload, InvoiceItem, Product, SalesDocumentKind, StockShortage } from '@/types';
import { calculateClientTotals } from '@/utils/format';
import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  duplicateAddToastMessage,
  hasInvoiceDraftContent,
  invoiceItemsToBuilderItems,
  removeInvoiceItem,
  setItemPrice,
  setItemQuantity,
  updateItemQuantity
} from '../services/invoiceBuilderService';

const PICKER_PAGE_SIZE = 20;

type StockWarning = { items: StockShortage[]; payload: InvoiceCreatePayload };
type StockDetails = { code?: string; items?: StockShortage[] };
type ApiErrorWithDetails = { response?: { data?: { details?: StockDetails } }; details?: StockDetails };

/**
 * The shortfall behind a refused sale, from either path: the server's 409, or the same
 * refusal raised locally when the bill is being written offline (db/errors.LocalRuleError).
 */
const stockShortagesFromError = (error: unknown) => {
  const wrapped = error as ApiErrorWithDetails;
  const details = wrapped?.response?.data?.details ?? wrapped?.details;
  return details?.code === 'INSUFFICIENT_STOCK' && Array.isArray(details.items) ? details.items : null;
};

export const useInvoiceBuilder = ({
  onCreated,
  showDialog,
  documentType,
  documentNoun = 'invoice'
}: {
  onCreated: (document: Invoice) => void;
  showDialog: (dialog: { title: string; message?: string; tone?: 'default' | 'success' | 'error' | 'warning' }) => void;
  /** Absent = tax invoice. A quotation or challan posts to /documents instead. */
  documentType?: SalesDocumentKind;
  /** Lower-case noun for user-facing copy — "quotation", "challan", … */
  documentNoun?: string;
}) => {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingOptional();
  const { showToast } = useAppToast();
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
  const [paywall, setPaywall] = useState<PaywallError | null>(null);
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
  const businessProfile = useAuthStore((state) => state.user?.businessProfile);
  const supplyType = useSupplyType(activeCustomer);

  const totals = useMemo(
    () =>
      calculateClientTotals({
        items,
        taxRate: Number(taxRate || 0),
        discountType,
        discountValue: Number(discountValue || 0),
        supplyType,
        pricesIncludeTax: Boolean(businessProfile?.taxSettings?.pricesIncludeTax)
      }),
    [items, taxRate, discountType, discountValue, supplyType, businessProfile?.taxSettings?.pricesIncludeTax]
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

  /**
   * Seeds the builder from an existing invoice for "Duplicate & correct". This only fills the
   * form — the source invoice is untouched and nothing is created until the user taps Generate,
   * so there is exactly one create and one stock movement for the corrected bill.
   */
  const applyPrefillInvoice = useCallback((invoice: Invoice) => {
    setSelectedCustomerId(invoice.customer || '');
    setSelectedCustomer(invoice.customer ? { ...invoice.customerSnapshot, _id: invoice.customer } : null);
    setItems(invoiceItemsToBuilderItems(invoice.items));
    // Aggregate rate; per-line rates ride along on the items, matching the server's own duplicate.
    setTaxRate(String(invoice.tax?.rate ?? 0));
    setDiscountType(invoice.discount?.type ?? 'flat');
    setDiscountValue(String(invoice.discount?.value ?? 0));
    setNotes(invoice.notes || '');
  }, []);

  // A builder holding only the pre-filled default rate has no user content — don't autosave it.
  const hasPayloadContent = useCallback((payload: InvoiceDraftPayload) => hasInvoiceDraftContent(payload, defaultTaxRate), [defaultTaxRate]);

  const draft = useDocumentDraft<InvoiceDraftPayload>({
    // Keyed per type so an unfinished quotation and an unfinished invoice do not overwrite
    // each other's recovery draft.
    documentType: documentType || 'invoice',
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

  const createInvoiceMutation = useMutation({
    mutationFn: (payload: InvoiceCreatePayload) =>
      documentType ? documentsApi.create(documentType, payload) : invoicesApi.create(payload),
    onSuccess: (_invoice, payload) => {
      // No PII / amounts — counts and booleans only. Covers normal + oversell paths.
      track('invoice_created', {
        item_count: payload.items.length,
        has_discount: payload.discountValue > 0,
        oversell: Boolean(payload.allowOversell)
      });
      onboarding?.markLocalFlag('invoiceCreateCount');
      draft.clearActiveDraft();
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
    },
    onError: (error) => {
      // The monthly document quota is spent. Shown as the upgrade sheet rather than an error
      // dialog: the work is still in the builder and still saved as a draft, so this is a
      // decision to make, not a failure to dismiss. Documents created offline are never
      // refused — the server counts those as overage — so this only happens online.
      if (isPaywallError(error)) {
        track('quota_blocked', { metric: error.metric || 'documents_per_month' });
        setPaywall(error);
        return;
      }

      const shortages = stockShortagesFromError(error);
      if (shortages) {
        setStockWarning({
          items: shortages,
          payload: buildInvoicePayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes, allowOversell: true })
        });
        return;
      }

      showDialog({ title: `Could not create ${documentNoun}`, message: apiErrorMessage(error), tone: 'error' });
    }
  });

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer._id);
    setSelectedCustomer(customer);
    setCustomerPicker(false);
  };

  const addProduct = useCallback(
    (product: Product) => {
      // Same path for picker taps and barcode scans, so a repeat scan gets the same nudge.
      const message = duplicateAddToastMessage(items, product);
      setItems((current) => addProductToItems(current, product));
      if (message) showToast(message, 'info');
    },
    [items, showToast]
  );

  /**
   * Scan a label straight onto the bill. Looks the code up directly rather than pushing it
   * into the search box and waiting for the list to settle — the server resolves an exact
   * barcode to a single product, so there is nothing to disambiguate.
   */
  const addScannedProduct = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;

      try {
        const matches = await productsApi.list({ search: code, limit: 1 });
        const product = matches.find((item) => item.barcode === code) ?? matches[0];

        if (!product) {
          showDialog({
            title: 'Product not found',
            message: `No product is saved against ${code}. Add it in Inventory, or search by name instead.`,
            tone: 'warning'
          });
          return;
        }

        addProduct(product);
        track('invoice_item_scanned', { matched: true });
      } catch (error) {
        showDialog({ title: 'Could not look up that code', message: apiErrorMessage(error), tone: 'error' });
      }
    },
    [addProduct, showDialog]
  );
  const updateQuantity = useCallback((index: number, delta: number) => setItems((current) => updateItemQuantity(current, index, delta)), []);
  const setQuantity = useCallback((index: number, quantity: number) => setItems((current) => setItemQuantity(current, index, quantity)), []);
  const setPrice = useCallback((index: number, price: number) => setItems((current) => setItemPrice(current, index, price)), []);
  const removeItem = useCallback((index: number) => setItems((current) => removeInvoiceItem(current, index)), []);
  const addCustomItem = useCallback((item: InvoiceItem) => setItems((current) => [...current, item]), []);

  const buildPayload = useCallback(
    (allowOversell = false) => buildInvoicePayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes, allowOversell }),
    [selectedCustomerId, items, taxRate, discountType, discountValue, notes]
  );

  const createInvoice = async () => {
    // Re-entry guard: a second tap before isPending propagates would POST twice → duplicate invoice.
    if (createInvoiceMutation.isPending) return;

    // No customer check: a counter/cash sale is billed without one (server records it as a
    // customerless "Walk-in customer" document — no Customer row, no balance, no ledger).
    if (!items.length) {
      showDialog({ title: 'Add at least one item', message: `Pick a product or add a custom item before generating the ${documentNoun}.`, tone: 'warning' });
      return;
    }

    try {
      // First attempt never forces oversell — shortage surfaces as stockWarning for confirm.
      const invoice = await createInvoiceMutation.mutateAsync(buildPayload(false));
      onCreated(invoice);
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
      onCreated(invoice);
    } catch {
      // Error already surfaced in createInvoiceMutation.onError.
    }
  };

  const isGenerating = createInvoiceMutation.isPending;

  return {
    activeCustomer,
    addCustomer,
    applyPrefillInvoice,
    addCustomItem,
    addProduct,
    addScannedProduct,
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
    setPrice,
    setProductSearch,
    setQuantity,
    setStockWarning,
    setTaxRate,
    stockWarning,
    paywall,
    dismissPaywall: () => setPaywall(null),
    taxRate,
    totals,
    updateQuantity,
    buildPayload
  };
};
