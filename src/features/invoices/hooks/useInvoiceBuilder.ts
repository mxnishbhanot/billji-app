import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, draftsApi, invoicesApi, productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { queryKeys } from '@/shared/query/queryKeys';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAuthStore } from '@/store/authStore';
import { Customer, DiscountType, DraftDocument, InvoiceCreatePayload, InvoiceDraftPayload, InvoiceItem, Product, StockShortage } from '@/types';
import { calculateClientTotals } from '@/utils/format';
import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  hasInvoiceDraftContent,
  removeInvoiceItem,
  updateItemQuantity
} from '../services/invoiceBuilderService';
import {
  createInvoiceDraftId,
  deleteInvoiceDraft,
  getLatestInvoiceDraft,
  INVOICE_DRAFT_SCHEMA_VERSION,
  saveInvoiceDraft
} from '../services/invoiceDraftStore';

const PICKER_PAGE_SIZE = 20;
const SERVER_SYNC_DELAY_MS = 1500;

type StockWarning = { items: StockShortage[]; payload: InvoiceCreatePayload };
type ApiErrorWithDetails = { response?: { data?: { details?: { code?: string; items?: StockShortage[] } } } };
type InvoiceDraftDocument = DraftDocument<InvoiceDraftPayload>;
type DraftStatus = 'idle' | 'saved' | 'syncing' | 'synced' | 'error';

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
  const businessId = useAuthStore((state) => state.user?.businessId || null);
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
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState(createInvoiceDraftId);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<InvoiceDraftDocument | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const currentDraftIdRef = useRef(currentDraftId);
  const lastEditedAtRef = useRef<string | null>(null);
  const serverDraftIdRef = useRef<string | null>(null);
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
  const hasDraftContent = useMemo(() => hasInvoiceDraftContent(draftPayload), [draftPayload]);
  const totals = calculateClientTotals({ items, taxRate: Number(taxRate || 0), discountType, discountValue: Number(discountValue || 0) });

  const setActiveDraftId = useCallback((draftId: string) => {
    currentDraftIdRef.current = draftId;
    setCurrentDraftId(draftId);
  }, []);

  const clearDraft = useCallback(async (localDraftId: string) => {
    await deleteInvoiceDraft(localDraftId);
    try {
      await draftsApi.remove(localDraftId);
    } catch {
      // Local discard must not fail because server cleanup is temporarily offline.
    }
  }, []);

  const syncDraft = useCallback(async (draft: InvoiceDraftDocument) => {
    try {
      const network = await NetInfo.fetch();
      if (network.isConnected === false || network.isInternetReachable === false) {
        setDraftStatus('error');
        return;
      }

      setDraftStatus('syncing');
      const synced = await draftsApi.upsert(draft.localDraftId, {
        documentType: 'invoice',
        schemaVersion: draft.schemaVersion,
        payload: draft.payload,
        dirty: false,
        lastEditedAt: draft.lastEditedAt
      });

      if (lastEditedAtRef.current !== draft.lastEditedAt || currentDraftIdRef.current !== draft.localDraftId) {
        return;
      }

      const syncedAt = synced.lastSyncedAt || new Date().toISOString();
      serverDraftIdRef.current = synced.serverDraftId || synced._id || draft.serverDraftId || null;
      await saveInvoiceDraft({
        ...draft,
        serverDraftId: serverDraftIdRef.current,
        businessId: synced.businessId ? String(synced.businessId) : draft.businessId || businessId,
        dirty: false,
        lastSyncedAt: syncedAt
      });
      setIsDraftDirty(false);
      setDraftStatus('synced');
      setLastDraftSavedAt(syncedAt);
    } catch {
      setDraftStatus('error');
    }
  }, [businessId]);

  const applyDraftPayload = useCallback((payload: InvoiceDraftPayload) => {
    setSelectedCustomerId(payload.selectedCustomerId);
    setSelectedCustomer(payload.selectedCustomer);
    setItems(payload.items);
    setTaxRate(payload.taxRate);
    setDiscountType(payload.discountType);
    setDiscountValue(payload.discountValue);
    setNotes(payload.notes);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadDraft = async () => {
      let draft = await getLatestInvoiceDraft(businessId);

      if (!draft) {
        try {
          const serverDraft = (await draftsApi.list('invoice'))[0];
          if (serverDraft) {
            draft = {
              ...serverDraft,
              businessId: serverDraft.businessId ? String(serverDraft.businessId) : businessId,
              dirty: false
            };
            await saveInvoiceDraft(draft);
          }
        } catch {
          draft = null;
        }
      }

      if (!mounted) return;
      if (draft && hasInvoiceDraftContent(draft.payload)) {
        setRecoveryDraft(draft);
        serverDraftIdRef.current = draft.serverDraftId || draft._id || null;
        setLastDraftSavedAt(draft.lastEditedAt);
        setDraftStatus(draft.dirty ? 'saved' : 'synced');
      }
      setDraftHydrated(true);
    };

    void loadDraft();
    return () => {
      mounted = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!draftHydrated || !hasDraftContent) return undefined;

    const lastEditedAt = new Date().toISOString();
    lastEditedAtRef.current = lastEditedAt;
    const draft: InvoiceDraftDocument = {
      localDraftId: currentDraftId,
      serverDraftId: serverDraftIdRef.current,
      businessId,
      documentType: 'invoice',
      schemaVersion: INVOICE_DRAFT_SCHEMA_VERSION,
      payload: draftPayload,
      dirty: true,
      lastEditedAt,
      lastSyncedAt: null
    };

    void saveInvoiceDraft(draft)
      .then(() => {
        if (lastEditedAtRef.current !== lastEditedAt) return;
        setIsDraftDirty(true);
        setDraftStatus('saved');
        setLastDraftSavedAt(lastEditedAt);
      })
      .catch(() => setDraftStatus('error'));

    const timeout = setTimeout(() => {
      void syncDraft(draft);
    }, SERVER_SYNC_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [businessId, currentDraftId, draftHydrated, draftPayload, hasDraftContent, syncDraft]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((network) => {
      if (!draftHydrated || !hasDraftContent || !isDraftDirty) return;
      if (network.isConnected === false || network.isInternetReachable === false) return;

      const lastEditedAt = lastEditedAtRef.current || new Date().toISOString();
      void syncDraft({
        localDraftId: currentDraftIdRef.current,
        serverDraftId: serverDraftIdRef.current,
        businessId,
        documentType: 'invoice',
        schemaVersion: INVOICE_DRAFT_SCHEMA_VERSION,
        payload: draftPayload,
        dirty: true,
        lastEditedAt,
        lastSyncedAt: null
      });
    });

    return () => unsubscribe();
  }, [businessId, draftHydrated, draftPayload, hasDraftContent, isDraftDirty, syncDraft]);

  const resumeDraft = () => {
    if (!recoveryDraft) return;
    setActiveDraftId(recoveryDraft.localDraftId);
    serverDraftIdRef.current = recoveryDraft.serverDraftId || recoveryDraft._id || null;
    lastEditedAtRef.current = recoveryDraft.lastEditedAt;
    applyDraftPayload(recoveryDraft.payload);
    setIsDraftDirty(recoveryDraft.dirty);
    setDraftStatus(recoveryDraft.dirty ? 'saved' : 'synced');
    setLastDraftSavedAt(recoveryDraft.lastEditedAt);
    setRecoveryDraft(null);
  };

  const duplicateDraft = () => {
    if (!recoveryDraft) return;
    setActiveDraftId(createInvoiceDraftId());
    serverDraftIdRef.current = null;
    lastEditedAtRef.current = null;
    applyDraftPayload(recoveryDraft.payload);
    setIsDraftDirty(true);
    setDraftStatus('saved');
    setRecoveryDraft(null);
  };

  const discardRecoveryDraft = () => {
    if (!recoveryDraft) return;
    const draftToDiscard = recoveryDraft;
    setRecoveryDraft(null);
    setDraftStatus('idle');
    setLastDraftSavedAt(null);
    setIsDraftDirty(false);
    setActiveDraftId(createInvoiceDraftId());
    void clearDraft(draftToDiscard.localDraftId);
  };

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
    mutationFn: invoicesApi.create,
    onSuccess: (invoice) => {
      void clearDraft(currentDraftIdRef.current).catch(() => {});
      setIsDraftDirty(false);
      setDraftStatus('idle');
      setLastDraftSavedAt(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      onCreated(invoice._id);
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

  const addProduct = (product: Product) => setItems((current) => addProductToItems(current, product));
  const updateQuantity = (index: number, delta: number) => setItems((current) => updateItemQuantity(current, index, delta));
  const removeItem = (index: number) => setItems((current) => removeInvoiceItem(current, index));
  const addCustomItem = (item: InvoiceItem) => setItems((current) => [...current, item]);

  const buildPayload = (allowOversell = false) =>
    buildInvoicePayload({ selectedCustomerId, items, taxRate, discountType, discountValue, notes, allowOversell });

  const createInvoice = () => {
    if (!selectedCustomerId) {
      showDialog({ title: 'Select or add a customer', message: 'Choose a saved customer or quick add a new one before generating the invoice.', tone: 'warning' });
      return;
    }

    if (!items.length) {
      showDialog({ title: 'Add at least one item', message: 'Pick a product or add a custom item before generating the invoice.', tone: 'warning' });
      return;
    }

    createInvoiceMutation.mutate(buildPayload(true));
  };

  const continueWithOversell = () => {
    if (!stockWarning || createInvoiceMutation.isPending) return;
    const payload = stockWarning.payload;
    setStockWarning(null);
    createInvoiceMutation.mutate(payload);
  };

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
    discardRecoveryDraft,
    draftHydrated,
    draftStatus,
    duplicateDraft,
    continueWithOversell,
    discountType,
    discountValue,
    hasDraftContent,
    isDraftDirty,
    items,
    lastDraftSavedAt,
    notes,
    productSearch,
    products,
    productsQuery,
    recoveryDraft,
    removeItem,
    resumeDraft,
    selectCustomer,
    setCustomerModal,
    setCustomerPicker,
    setCustomerSearch,
    setCustomModal,
    setDiscountType,
    setDiscountValue,
    setNotes,
    setProductSearch,
    setStockWarning,
    setTaxRate,
    stockWarning,
    taxRate,
    totals,
    updateQuantity
  };
};
