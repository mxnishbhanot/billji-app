import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { invoicesApi, paymentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { InvoiceDetailScreenProps } from '@/navigation/types';
import { openOrSharePdf } from '@/services/pdf';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { InvoicePaymentStatus, InvoiceStatus, PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { emailSchema } from '@/validation/schemas';
import { useState } from 'react';

function HeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="invHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={220} fill="url(#invHeroGrad)" />
      <G opacity="0.18">
        {Array.from({ length: 14 }).map((_, row) =>
          Array.from({ length: 22 }).map((__, col) => (
            <Circle key={`${row}-${col}`} cx={col * 18 + 9} cy={row * 18 + 9} r={1} fill="#FFFFFF" />
          ))
        )}
      </G>
      <Circle cx={340} cy={236} r={92} fill="#6366F1" opacity={0.24} />
      <Circle cx={-12} cy={-12} r={70} fill="#F472B6" opacity={0.08} />
    </Svg>
  );
}

const statusIconName = (status: InvoiceStatus): keyof typeof MaterialCommunityIcons.glyphMap =>
  status === 'paid' ? 'check-decagram' : status === 'cancelled' ? 'close-circle' : 'clock-outline';

const paymentStatusIconName = (status: InvoicePaymentStatus): keyof typeof MaterialCommunityIcons.glyphMap =>
  status === 'paid' ? 'check-decagram' : status === 'partial' ? 'progress-clock' : status === 'refunded' ? 'cash-refund' : 'clock-outline';

const paymentMethodButtons = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' }
];

export function InvoiceDetailScreen({ route, navigation }: InvoiceDetailScreenProps) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canRecordPayment = can(PERMISSION.paymentsRecord);
  const canUpdateInvoice = can(PERMISSION.invoicesUpdate);
  const canDeleteInvoice = can(PERMISSION.invoicesDelete);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localStatus, setLocalStatus] = useState<InvoiceStatus | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const emailForm = useForm<{ email: string }>({ defaultValues: { email: '' }, resolver: zodResolver(emailSchema) });
  const query = useQuery({ queryKey: queryKeys.invoices.detail(id), queryFn: () => invoicesApi.get(id) });
  const paymentsQuery = useQuery({ queryKey: queryKeys.payments.invoice(id), queryFn: () => paymentsApi.list({ invoiceId: id }) });
  const invoice = query.data;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
  };
  const status = useMutation({ mutationFn: (next: InvoiceStatus) => invoicesApi.status(id, next), onSuccess: () => { setLocalStatus(null); invalidate(); query.refetch(); }, onError: (error) => showDialog({ title: 'Could not update status', message: apiErrorMessage(error), tone: 'error' }) });
  const remove = useMutation({ mutationFn: () => invoicesApi.remove(id), onSuccess: () => { setDeleting(false); invalidate(); navigation.navigate('InvoiceList'); }, onError: (error) => showDialog({ title: 'Could not delete invoice', message: apiErrorMessage(error), tone: 'error' }) });
  const sendEmail = useMutation({ mutationFn: (email: string) => invoicesApi.email(id, email), onSuccess: () => { setEmailOpen(false); query.refetch(); }, onError: (error) => showDialog({ title: 'Could not send email', message: apiErrorMessage(error), tone: 'error' }) });
  const recordPayment = useMutation({
    mutationFn: () => paymentsApi.recordInvoicePayment(id, {
      amount: Number(paymentAmount || 0),
      method: paymentMethod,
      reference: paymentReference,
      notes: paymentNotes
    }),
    onSuccess: () => {
      setPaymentOpen(false);
      setPaymentReference('');
      setPaymentNotes('');
      invalidate();
      query.refetch();
      paymentsQuery.refetch();
    },
    onError: (error) => showDialog({ title: 'Could not record payment', message: apiErrorMessage(error), tone: 'error' })
  });
  const shareWhatsApp = async () => { try { const result = await invoicesApi.whatsapp(id); await Linking.openURL(result.link); } catch (error) { showDialog({ title: 'Could not prepare WhatsApp link', message: apiErrorMessage(error), tone: 'error' }); } };

  if (!invoice) return <Screen title="Invoice"><Text>Loading invoice...</Text></Screen>;

  const currentStatus = localStatus ?? invoice.status;
  const paidAmount = invoice.paidAmount ?? (invoice.paymentStatus === 'paid' ? invoice.total : 0);
  const balanceDue = invoice.balanceDue ?? Math.max(invoice.total - paidAmount, 0);
  const paymentStatus = invoice.paymentStatus ?? (currentStatus === 'paid' ? 'paid' : 'unpaid');
  const hasStatusChange = localStatus !== null && localStatus !== invoice.status;
  const tone = statusTone(currentStatus, isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const openPaymentDialog = () => {
    setPaymentAmount(balanceDue > 0 ? String(balanceDue) : '');
    setPaymentMethod('cash');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentOpen(true);
  };

  const actions: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }[] = [
    { label: 'PDF', icon: 'file-text', onPress: () => openOrSharePdf(invoice.pdfUrl, invoice.invoiceNumber) },
    { label: 'WhatsApp', icon: 'send', onPress: shareWhatsApp },
    { label: 'Email', icon: 'mail', onPress: () => { emailForm.reset({ email: invoice.customerSnapshot.email || '' }); setEmailOpen(true); } }
  ];

  return (
    <Screen title={invoice.invoiceNumber}>
      <View style={[styles.heroCard, { borderColor: alpha('#C3C0FF', 0.3) }]}>
        <HeroPattern />
        <View style={styles.heroInner}>
          <View style={[styles.heroEyebrowBadge, { borderColor: alpha('#FFFFFF', 0.22), backgroundColor: alpha('#1C1A4A', 0.4) }]}>
            <Text style={styles.heroEyebrow}>{invoice.invoiceNumber}</Text>
          </View>
          <Text style={styles.heroDate}>{formatDate(invoice.date)}</Text>
          <Text numberOfLines={1} style={styles.heroCustomer}>{invoice.customerSnapshot.name}</Text>
          <Text style={styles.heroAmount}>{formatCurrency(invoice.total)}</Text>
          <View style={[styles.heroStatusPill, { backgroundColor: '#FFFFFF' }]}>
            <MaterialCommunityIcons name={statusIconName(currentStatus)} size={14} color={colors.primaryStrong} />
            <Text style={[styles.heroStatusText, { color: colors.primaryStrong }]}>{currentStatus}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.actionTile,
              {
                backgroundColor: colors.card,
                borderColor: cardBorder,
                opacity: pressed ? 0.85 : 1
              }
            ]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
              <Feather name={action.icon} size={16} color={theme.colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: theme.colors.onSurface }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Items</Text>
          <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
            <Text style={[styles.countBadgeText, { color: theme.colors.primary }]}>{invoice.items.length}</Text>
          </View>
        </View>
        {invoice.items.map((item, index) => (
          <View key={item._id || `${item.name}-${index}`} style={[styles.itemRow, index < invoice.items.length - 1 && { borderBottomWidth: 1, borderColor: cardBorder }]}>
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>{item.quantity} × {formatCurrency(item.price)}</Text>
            </View>
            <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.total)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Bill summary</Text>
        <View style={styles.totalRows}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Discount</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>-{formatCurrency(invoice.discount.amount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Tax</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.tax.amount)}</Text>
          </View>
          <View style={[styles.grandTotal, { borderColor: cardBorder }]}>
            <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>{formatCurrency(invoice.total)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Payment status</Text>
        <View style={[styles.statusPreview, { backgroundColor: tone.background, borderColor: tone.border }]}>
          <MaterialCommunityIcons name={paymentStatusIconName(paymentStatus)} size={16} color={tone.foreground} />
          <Text style={[styles.statusPreviewText, { color: tone.foreground }]}>{paymentStatus}</Text>
        </View>
        <View style={styles.paymentSummaryRows}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Paid</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(paidAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Balance due</Text>
            <Text style={[styles.totalValue, { color: balanceDue > 0 ? colors.destructive : theme.colors.onSurface }]}>{formatCurrency(balanceDue)}</Text>
          </View>
        </View>
        {canRecordPayment ? (
          <Button mode="outlined" icon="cash-plus" onPress={openPaymentDialog} style={styles.recordPaymentButton}>
            Record payment
          </Button>
        ) : null}
        {paymentsQuery.data?.length ? (
          <View style={[styles.paymentHistory, { borderColor: cardBorder }]}>
            {paymentsQuery.data.slice(0, 3).map((payment) => (
              <View key={payment._id} style={styles.paymentHistoryRow}>
                <Text style={[styles.paymentHistoryLabel, { color: theme.colors.onSurface }]}>{payment.method.replace('_', ' ')}</Text>
                <Text style={[styles.paymentHistoryValue, { color: theme.colors.onSurfaceVariant }]}>{formatCurrency(payment.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {canUpdateInvoice ? (
          <SegmentedButtons
            value={currentStatus}
            onValueChange={(value) => setLocalStatus(value as InvoiceStatus)}
            buttons={[
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'cancelled', label: 'Cancelled' }
            ]}
          />
        ) : null}
      </View>

      <View style={styles.footerActions}>
        {hasStatusChange && canUpdateInvoice && (
          <Button mode="contained" loading={status.isPending} onPress={() => status.mutate(localStatus)} style={styles.footerButton}>
            Save invoice
          </Button>
        )}
        {canDeleteInvoice ? (
          <Button
            mode="contained"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            icon={({ size, color }) => <Feather name="trash-2" size={size} color={color} />}
            onPress={() => setDeleting(true)}
            style={styles.footerButton}
          >
            Delete invoice
          </Button>
        ) : null}
      </View>

      <Portal>
        <Dialog visible={paymentOpen} onDismiss={() => setPaymentOpen(false)}>
          <Dialog.Title>Record payment</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Amount"
              keyboardType="decimal-pad"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              style={styles.dialogInput}
            />
            <SegmentedButtons
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              buttons={paymentMethodButtons}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Reference"
              value={paymentReference}
              onChangeText={setPaymentReference}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Notes"
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              multiline
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentOpen(false)}>Cancel</Button>
            <Button loading={recordPayment.isPending} onPress={() => recordPayment.mutate()}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={emailOpen} onDismiss={() => setEmailOpen(false)}>
          <Dialog.Title>Send invoice</Dialog.Title>
          <Dialog.Content><FormTextInput control={emailForm.control} name="email" label="Email" keyboardType="email-address" /></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEmailOpen(false)}>Cancel</Button>
            <Button loading={sendEmail.isPending} onPress={emailForm.handleSubmit((values) => sendEmail.mutate(values.email))}>Send</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <ConfirmDialog visible={deleting} title="Delete invoice?" message="This permanently removes the invoice and returns catalog stock for product items." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionIconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionTile: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 14
  },
  countBadge: { alignItems: 'center', borderRadius: radii.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...fontStyles.bold, fontSize: 11 },
  dialogInput: { marginTop: 10 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  footerButton: { borderRadius: radii.input, flex: 1 },
  grandTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12
  },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 16 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.4 },
  heroAmount: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 30, letterSpacing: -0.9, marginTop: 8 },
  heroCard: { borderRadius: 26, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  heroCustomer: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 18, letterSpacing: -0.3, marginTop: 4 },
  heroDate: { ...fontStyles.medium, color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 10 },
  heroEyebrow: { ...fontStyles.bold, color: '#C7D2FE', fontSize: 10, letterSpacing: 1.4 },
  heroEyebrowBadge: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  heroInner: { padding: 22 },
  heroStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  heroStatusText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  itemContent: { flex: 1, minWidth: 0 },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  itemName: { ...fontStyles.semiBold, fontSize: 14 },
  itemRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 12 },
  itemTotal: { ...fontStyles.bold, fontSize: 14 },
  paymentHistory: { borderTopWidth: 1, gap: 8, marginBottom: 14, marginTop: 12, paddingTop: 12 },
  paymentHistoryLabel: { ...fontStyles.semiBold, fontSize: 13, textTransform: 'capitalize' },
  paymentHistoryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  paymentHistoryValue: { ...fontStyles.semiBold, fontSize: 13 },
  paymentSummaryRows: { gap: 8, marginBottom: 12 },
  recordPaymentButton: { borderRadius: radii.input, marginBottom: 12 },
  sectionCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 16 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16 },
  statusPreview: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  statusPreviewText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  totalLabel: { ...typeScale.bodyPrimary, fontSize: 14 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalRows: { gap: 10 },
  totalValue: { ...fontStyles.semiBold, fontSize: 14 }
});
