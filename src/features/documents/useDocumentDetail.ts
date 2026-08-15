import { useState } from 'react';
import { AtSign, FileText, MapPin, Phone, Receipt, Send } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/api/client';
import { documentsApi } from '@/api/endpoints';
import { useAppDialog } from '@/components/AppDialog';
import { openOrSharePdf } from '@/services/pdf';
import { hasWhatsAppPhone } from '@/shared/customers/customerPayload';
import { queryKeys } from '@/shared/query/queryKeys';
import { documentNumberOf, Invoice, SalesDocumentKind } from '@/types';
import { CustomerMetaItem } from './components/DocumentCustomerSection';
import { ShareAction } from './components/DocumentShareActions';
import { DOCUMENT_COPY } from './documentCopy';
import { DocumentLifecycle, documentLifecycle } from './lifecycle';

/**
 * Everything a sales-document detail screen does that is not its own layout: load the
 * document, cancel it, convert it if its type can be converted, share the server's PDF, and
 * describe the customer.
 *
 * The three detail screens (quotation, delivery challan, credit note) differ in what they
 * *say* about a document, not in how they fetch or act on one — that part was copied three
 * times and had already started to drift. Each screen keeps its own copy and composition and
 * takes the mechanics from here.
 */
export const useDocumentDetail = (
  documentType: SalesDocumentKind,
  id: string,
  { onConverted }: { onConverted?: (invoice: Invoice) => void } = {}
) => {
  const copy = DOCUMENT_COPY[documentType];
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.documents.detail(documentType, id),
    queryFn: () => documentsApi.get(documentType, id)
  });
  const document = query.data;

  // Converting or cancelling moves the document lists, stock and the reports that read them;
  // a credit note also moves the customer's balance, and only it needs that refetch.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
    if (copy.touchesCustomers) queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  };

  const convertMutation = useMutation({
    mutationFn: () => documentsApi.convert(documentType, id),
    onSuccess: (invoice) => {
      invalidate();
      void query.refetch();
      onConverted?.(invoice);
    },
    onError: (error) => showDialog({ title: `Could not convert ${copy.noun}`, message: apiErrorMessage(error), tone: 'error' })
  });

  const cancelMutation = useMutation({
    mutationFn: () => documentsApi.cancel(documentType, id),
    onSuccess: () => {
      invalidate();
      void query.refetch();
    },
    onError: (error) => showDialog({ title: `Could not cancel ${copy.noun}`, message: apiErrorMessage(error), tone: 'error' })
  });

  const share = async (label: string) => {
    if (!document || busyAction) return;
    // The PDF is rendered server-side, so a document created offline has none until it syncs.
    if (!document.pdfUrl) {
      showDialog({
        title: 'Saved on this device',
        message: `${documentNumberOf(document)} is saved here and will sync automatically. The PDF is generated on the server, so sharing becomes available once it has synced.`,
        tone: 'warning'
      });
      return;
    }
    setBusyAction(label);
    try {
      await openOrSharePdf(document.pdfUrl, documentNumberOf(document));
    } catch (error) {
      showDialog({ title: `Could not share ${copy.noun}`, message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const lifecycle: DocumentLifecycle = document ? documentLifecycle(document) : 'open';
  const snapshot = document?.customerSnapshot;

  // Sharing a cancelled document hands the customer a record of something that no longer
  // stands, and WhatsApp needs a number to send to.
  const shareActions: ShareAction[] =
    !document || lifecycle === 'cancelled'
      ? []
      : [
          { label: 'PDF', icon: FileText, onPress: () => void share('PDF') },
          ...(hasWhatsAppPhone(snapshot) ? [{ label: 'WhatsApp', icon: Send, onPress: () => void share('WhatsApp') }] : [])
        ];

  const customerMetaItems: CustomerMetaItem[] = (
    [
      snapshot?.phone ? { key: 'phone', icon: Phone, text: `${snapshot.countryCode || '+91'} ${snapshot.phone}` } : null,
      snapshot?.email ? { key: 'email', icon: AtSign, text: snapshot.email, numberOfLines: 1 } : null,
      snapshot?.gstNumber ? { key: 'gst', icon: Receipt, text: snapshot.gstNumber } : null,
      snapshot?.address ? { key: 'address', icon: MapPin, text: snapshot.address } : null
    ] as (CustomerMetaItem | null)[]
  ).filter((item): item is CustomerMetaItem => item !== null);

  return {
    copy,
    document,
    isLoading: query.isLoading,
    lifecycle,
    isCancelled: lifecycle === 'cancelled',
    isInvoiced: lifecycle === 'invoiced',
    isOpen: lifecycle === 'open',
    customerMetaItems,
    shareActions,
    busyAction,
    /** null for a document type the server cannot convert (a credit note). */
    convert: copy.convertsToInvoice ? convertMutation : null,
    cancel: cancelMutation,
    cancelVisible,
    setCancelVisible
  };
};
