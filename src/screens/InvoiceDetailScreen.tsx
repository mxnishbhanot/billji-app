import { Alert, Linking, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, Portal, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { openOrSharePdf } from '@/services/pdf';
import { InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { emailSchema } from '@/validation/schemas';
import { useState } from 'react';

export function InvoiceDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const emailForm = useForm<any>({ defaultValues: { email: '' }, resolver: zodResolver(emailSchema) });
  const query = useQuery({ queryKey: ['invoices', id], queryFn: () => invoicesApi.get(id) });
  const invoice = query.data;
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); queryClient.invalidateQueries({ queryKey: ['report'] }); };
  const status = useMutation({ mutationFn: (next: InvoiceStatus) => invoicesApi.status(id, next), onSuccess: () => { invalidate(); query.refetch(); }, onError: (error) => Alert.alert('Could not update status', apiErrorMessage(error)) });
  const duplicate = useMutation({ mutationFn: () => invoicesApi.duplicate(id), onSuccess: (clone) => { invalidate(); navigation.replace('InvoiceDetail', { id: clone._id }); }, onError: (error) => Alert.alert('Could not duplicate invoice', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => invoicesApi.remove(id), onSuccess: () => { invalidate(); navigation.navigate('InvoiceList'); }, onError: (error) => Alert.alert('Could not delete invoice', apiErrorMessage(error)) });
  const sendEmail = useMutation({ mutationFn: (email: string) => invoicesApi.email(id, email), onSuccess: () => { setEmailOpen(false); query.refetch(); }, onError: (error) => Alert.alert('Could not send email', apiErrorMessage(error)) });
  const shareWhatsApp = async () => { try { const result = await invoicesApi.whatsapp(id); await Linking.openURL(result.link); } catch (error) { Alert.alert('Could not prepare WhatsApp link', apiErrorMessage(error)); } };
  if (!invoice) return <Screen title="Invoice"><Text>Loading invoice...</Text></Screen>;
  return (
    <Screen title={invoice.invoiceNumber}>
      <AppCard><Text style={{ color: theme.colors.onSurfaceVariant }}>{formatDate(invoice.date)}</Text><Text variant="headlineMedium" style={{ fontWeight: '900' }}>{invoice.customerSnapshot.name}</Text><Text variant="displaySmall" style={{ fontWeight: '900', marginTop: 12 }}>{formatCurrency(invoice.total)}</Text><Text>{invoice.status}</Text></AppCard>
      <AppCard><Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 8 }}>Items</Text>{invoice.items.map((item) => <View key={item._id || item.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text>{item.name}\n{item.quantity} x {formatCurrency(item.price)}</Text><Text style={{ fontWeight: '900' }}>{formatCurrency(item.total)}</Text></View>)}</AppCard>
      <AppCard><View style={{ gap: 6 }}><Text>Subtotal: {formatCurrency(invoice.subtotal)}</Text><Text>Discount: -{formatCurrency(invoice.discount.amount)}</Text><Text>Tax: {formatCurrency(invoice.tax.amount)}</Text><Text variant="titleMedium" style={{ fontWeight: '900' }}>Total: {formatCurrency(invoice.total)}</Text></View></AppCard>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}><Button mode="outlined" onPress={() => openOrSharePdf(invoice.pdfUrl, invoice.invoiceNumber)}>PDF</Button><Button mode="outlined" onPress={shareWhatsApp}>WhatsApp</Button><Button mode="outlined" onPress={() => { emailForm.reset({ email: invoice.customerSnapshot.email || '' }); setEmailOpen(true); }}>Email</Button><Button mode="outlined" loading={duplicate.isPending} onPress={() => duplicate.mutate()}>Duplicate</Button></View>
      <AppCard><Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 8 }}>Payment status</Text><SegmentedButtons value={invoice.status} onValueChange={(value) => status.mutate(value as InvoiceStatus)} buttons={[{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }]} /></AppCard>
      <Button mode="contained" buttonColor={theme.colors.error} textColor={theme.colors.onError} onPress={() => setDeleting(true)}>Delete invoice</Button>
      <Portal><Dialog visible={emailOpen} onDismiss={() => setEmailOpen(false)}><Dialog.Title>Send invoice</Dialog.Title><Dialog.Content><FormTextInput control={emailForm.control} name="email" label="Email" keyboardType="email-address" /></Dialog.Content><Dialog.Actions><Button onPress={() => setEmailOpen(false)}>Cancel</Button><Button loading={sendEmail.isPending} onPress={emailForm.handleSubmit((values) => sendEmail.mutate(values.email))}>Send</Button></Dialog.Actions></Dialog></Portal>
      <ConfirmDialog visible={deleting} title="Delete invoice?" message="This permanently removes the invoice and returns catalog stock for product items." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Screen>
  );
}
