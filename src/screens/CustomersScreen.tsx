import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { customersApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { Customer } from '@/types';
import { customerSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankCustomer = { name: '', phone: '', email: '', address: '' };

export function CustomersScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const form = useForm<any>({ defaultValues: blankCustomer, resolver: zodResolver(customerSchema) });
  const query = useInfiniteQuery({ queryKey: ['customers', search], initialPageParam: 1, queryFn: ({ pageParam }) => customersApi.page({ search, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const customers = useMemo(() => query.data?.pages.flatMap((page) => page.customers) ?? [], [query.data]);
  const save = useMutation({ mutationFn: (values: any) => editing?._id ? customersApi.update(editing._id, values) : customersApi.create(values), onSuccess: () => { setEditing(undefined); queryClient.invalidateQueries({ queryKey: ['customers'] }); }, onError: (error) => showDialog({ title: 'Could not save customer', message: apiErrorMessage(error), tone: 'error' }) });
  const remove = useMutation({ mutationFn: (id: string) => customersApi.remove(id), onSuccess: () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: ['customers'] }); }, onError: (error) => showDialog({ title: 'Could not delete customer', message: apiErrorMessage(error), tone: 'error' }) });
  useEffect(() => { if (editing !== undefined) form.reset(editing || blankCustomer); }, [editing, form]);

  return (
    <Screen title="Customers" scroll={false}>
      <View style={{ gap: 10, marginBottom: 12 }}><TextInput mode="outlined" placeholder="Search customers" value={search} onChangeText={setSearch} left={<TextInput.Icon icon="magnify" />} /><Button mode="contained" onPress={() => setEditing(null)}>Add customer</Button></View>
      <FlatList data={customers} keyExtractor={(item) => item._id} refreshing={query.isRefetching} onRefresh={() => query.refetch()} onEndReached={() => query.hasNextPage && query.fetchNextPage()} ListEmptyComponent={!query.isLoading ? <EmptyState title="No customers" message="Add customers once and reuse them in every invoice." actionLabel="Add customer" onAction={() => setEditing(null)} /> : null} renderItem={({ item }) => <AppCard><Text variant="titleMedium" style={{ fontWeight: '900' }}>{item.name}</Text><Text>{item.phone}</Text>{item.email ? <Text style={{ color: theme.colors.onSurfaceVariant }}>{item.email}</Text> : null}<View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}><Button mode="outlined" onPress={() => setEditing(item)}>Edit</Button><Button mode="outlined" textColor={theme.colors.error} onPress={() => setDeleting(item)}>Delete</Button></View></AppCard>} />
      <Portal><Dialog visible={editing !== undefined} onDismiss={() => setEditing(undefined)}><Dialog.Title>{editing?._id ? 'Edit customer' : 'Add customer'}</Dialog.Title><Dialog.Content><FormTextInput control={form.control} name="name" label="Name" /><FormTextInput control={form.control} name="phone" label="Phone" keyboardType="phone-pad" /><FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" /><FormTextInput control={form.control} name="address" label="Address" multiline /></Dialog.Content><Dialog.Actions><Button onPress={() => setEditing(undefined)}>Cancel</Button><Button loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))}>Save</Button></Dialog.Actions></Dialog></Portal>
      <ConfirmDialog visible={Boolean(deleting)} title="Delete customer?" message="This removes the customer from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}
