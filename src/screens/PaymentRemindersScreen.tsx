import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Text, TextInput, useTheme } from 'react-native-paper';
import { authApi, invoicesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { openSequentially, overdueLabel } from '@/features/reminders/reminderActions';
import { StatusPill } from '@/components/StatusPill';
import { track } from '@/services/analytics';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { formatCurrency } from '@/utils/format';

const TOKEN_HINT = '{name} · {invoice} · {amount} · {link} · {days} · {business}';

export function PaymentRemindersScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const setUser = useAuthStore((state) => state.setUser);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');

  const query = useQuery({
    queryKey: queryKeys.invoices.pendingReminders,
    queryFn: invoicesApi.pendingReminders
  });

  const reminders = useMemo(() => query.data?.reminders ?? [], [query.data]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedTotal = useMemo(
    () => reminders.filter((row) => selectedSet.has(row.invoiceId)).reduce((sum, row) => sum + row.balanceDue, 0),
    [reminders, selectedSet]
  );
  const allSelected = reminders.length > 0 && selected.length === reminders.length;

  const toggle = useCallback((invoiceId: string) => {
    setSelected((current) => (current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId]));
  }, []);

  const toggleAll = () => setSelected(allSelected ? [] : reminders.map((row) => row.invoiceId));

  const send = useMutation({
    mutationFn: (invoiceIds: string[]) => invoicesApi.sendReminders(invoiceIds),
    onSuccess: async ({ reminders: prepared, prepared: preparedCount }) => {
      if (!preparedCount) {
        showDialog({ title: 'Nothing to send', message: 'These invoices are no longer pending. Pull to refresh the list.', tone: 'warning' });
        return;
      }

      track('payment_reminders_sent', { count: preparedCount });
      const opened = await openSequentially(prepared);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

      if (!opened) {
        showDialog({
          title: 'Could not open WhatsApp',
          message: 'WhatsApp does not seem to be installed on this device. Install it, or share the invoice from its detail screen instead.',
          tone: 'error'
        });
        return;
      }
      showToast(opened === preparedCount ? `${opened} reminder${opened === 1 ? '' : 's'} opened in WhatsApp` : `${opened} of ${preparedCount} opened`, 'success');
    },
    onError: (error) => showDialog({ title: 'Could not prepare reminders', message: apiErrorMessage(error), tone: 'error' })
  });

  const saveTemplate = useMutation({
    mutationFn: (reminderTemplate: string) => authApi.updateSettings({ reminderTemplate }),
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.pendingReminders });
      setEditingTemplate(false);
      showToast('Reminder message saved', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save message', message: apiErrorMessage(error), tone: 'error' })
  });

  const startEditingTemplate = () => {
    setTemplateDraft(query.data?.template ?? '');
    setEditingTemplate(true);
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const headerAction = (
    <Pressable onPress={startEditingTemplate} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit reminder message" style={styles.headerBtn}>
      <Feather name="edit-3" size={18} color={theme.colors.primary} />
    </Pressable>
  );

  return (
    <Screen title="Payment reminders" headerAction={headerAction} contentStyle={styles.screenContent}>
      <View style={[styles.summaryCard, { backgroundColor: alpha(colors.destructive, isDark ? 0.14 : 0.06), borderColor: alpha(colors.destructive, isDark ? 0.3 : 0.16) }]}>
        <View>
          <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>TOTAL PENDING</Text>
          <Text style={[styles.summaryValue, { color: colors.destructive }]}>{formatCurrency(query.data?.totalOutstanding ?? 0)}</Text>
        </View>
        <Text style={[styles.summaryCount, { color: theme.colors.onSurfaceVariant }]}>
          {reminders.length} customer{reminders.length === 1 ? '' : 's'}
        </Text>
      </View>

      {editingTemplate ? (
        <View style={[styles.templateCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
          <Text style={[styles.templateTitle, { color: theme.colors.onSurface }]}>Reminder message</Text>
          <Text style={[styles.templateHint, { color: theme.colors.onSurfaceVariant }]}>{TOKEN_HINT}</Text>
          <TextInput
            mode="outlined"
            label="Message"
            value={templateDraft}
            onChangeText={setTemplateDraft}
            multiline
            numberOfLines={4}
            maxLength={1000}
            outlineStyle={styles.templateInputOutline}
            outlineColor={theme.colors.outlineVariant}
            activeOutlineColor={theme.colors.primary}
            style={[styles.templateInput, { backgroundColor: isDark ? colors.surface : colors.card }]}
          />
          <View style={styles.templateActions}>
            <Button mode="text" onPress={() => setEditingTemplate(false)} disabled={saveTemplate.isPending}>
              Cancel
            </Button>
            <Button mode="contained" onPress={() => saveTemplate.mutate(templateDraft.trim())} loading={saveTemplate.isPending} disabled={saveTemplate.isPending}>
              Save
            </Button>
          </View>
        </View>
      ) : null}

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : reminders.length ? (
        <>
          <Pressable onPress={toggleAll} style={styles.selectAllRow} accessibilityRole="button">
            <Checkbox status={allSelected ? 'checked' : 'unchecked'} color={theme.colors.primary} />
            <Text style={[styles.selectAllLabel, { color: theme.colors.onSurface }]}>{allSelected ? 'Clear selection' : 'Select all'}</Text>
          </Pressable>

          {reminders.map((row) => {
            const checked = selectedSet.has(row.invoiceId);
            return (
              <Pressable
                key={row.invoiceId}
                onPress={() => toggle(row.invoiceId)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: checked ? alpha(colors.primary, isDark ? 0.12 : 0.05) : colors.card,
                    borderColor: checked ? alpha(colors.primary, isDark ? 0.45 : 0.3) : cardBorder
                  },
                  pressed && styles.rowPressed
                ]}
              >
                <Checkbox status={checked ? 'checked' : 'unchecked'} color={theme.colors.primary} />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: theme.colors.onSurface }]}>{row.customerName}</Text>
                  <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>
                    {row.invoiceNumber} · {row.countryCode} {row.phone}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowAmount, { color: theme.colors.onSurface }]}>{formatCurrency(row.balanceDue)}</Text>
                  <StatusPill label={overdueLabel(row)} tone={row.reason === 'overdue' ? 'cancelled' : 'pending'} />
                </View>
              </Pressable>
            );
          })}

          {query.data?.skippedWithoutPhone ? (
            <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
              {query.data.skippedWithoutPhone} pending invoice{query.data.skippedWithoutPhone === 1 ? '' : 's'} hidden — no phone number saved.
            </Text>
          ) : null}

          <Button
            mode="contained"
            icon={({ size, color }) => <Feather name="send" size={size} color={color} />}
            onPress={() => send.mutate(selected)}
            loading={send.isPending}
            disabled={!selected.length || send.isPending}
            style={styles.sendButton}
            contentStyle={styles.sendButtonContent}
          >
            {selected.length ? `Send ${selected.length} · ${formatCurrency(selectedTotal)}` : 'Select customers to remind'}
          </Button>
        </>
      ) : (
        <EmptyState
          title="Nothing to chase"
          message="No overdue invoices right now. Reminders appear here once an invoice passes its due date, or stays unpaid for a week without one."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { ...typeScale.caption, fontSize: 12, marginTop: 4, textAlign: 'center' },
  headerBtn: { padding: 8 },
  loader: { marginVertical: 24 },
  row: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 6, marginBottom: 10, paddingHorizontal: 8, paddingVertical: 10 },
  rowAmount: { ...fontStyles.bold, fontSize: 15 },
  rowMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowName: { ...fontStyles.bold, fontSize: 15 },
  rowPressed: { opacity: 0.9 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowText: { flex: 1, minWidth: 0 },
  screenContent: { paddingTop: 8 },
  selectAllLabel: { ...fontStyles.semiBold, fontSize: 13 },
  selectAllRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 6 },
  sendButton: { borderRadius: radii.input, marginTop: 16 },
  sendButtonContent: { minHeight: 48 },
  summaryCard: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, padding: 16 },
  summaryCount: { ...typeScale.caption, fontSize: 12 },
  summaryLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1 },
  summaryValue: { ...fontStyles.bold, fontSize: 24, letterSpacing: -0.6, marginTop: 4 },
  templateActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
  templateCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 14 },
  templateHint: { ...typeScale.caption, fontSize: 11, marginBottom: 10, marginTop: 2 },
  templateInput: { minHeight: 96 },
  templateInputOutline: { borderRadius: radii.input },
  templateTitle: { ...fontStyles.bold, fontSize: 14 }
});
