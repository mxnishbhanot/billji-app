import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { useAppDialog } from '@/components/AppDialog';
import { apiErrorMessage } from '@/api/client';
import { rolesApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import type { RoleEditorScreenProps } from '@/navigation/types';

export function RoleEditorScreen({ navigation, route }: RoleEditorScreenProps) {
  const roleId = route.params?.roleId;
  const isEdit = Boolean(roleId);
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  const catalogQuery = useQuery({ queryKey: queryKeys.roles.permissionCatalog, queryFn: rolesApi.permissionCatalog });
  const roleQuery = useQuery({ queryKey: queryKeys.roles.detail(roleId ?? 'new'), queryFn: () => rolesApi.get(roleId as string), enabled: isEdit });

  useEffect(() => {
    if (roleQuery.data) {
      setName(roleQuery.data.name);
      setDescription(roleQuery.data.description);
      setSelected(new Set(roleQuery.data.permissions));
    }
  }, [roleQuery.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), description: description.trim(), permissions: [...selected] };
      return isEdit ? rolesApi.update(roleId as string, payload) : rolesApi.create(payload);
    },
    onSuccess: () => { invalidate(); navigation.goBack(); },
    onError: (error) => showDialog({ title: 'Could not save role', message: apiErrorMessage(error), tone: 'error' })
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (keys: string[], allOn: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  const nameValid = name.trim().length > 0;
  const canSave = nameValid && selected.size > 0;
  const submit = () => {
    setTouched(true);
    if (!canSave) return;
    save.mutate();
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const loading = catalogQuery.isLoading || (isEdit && roleQuery.isLoading);

  return (
    <Screen title={isEdit ? 'Edit role' : 'New role'}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <>
          <TextInput
            mode="outlined"
            label="Role name"
            value={name}
            onChangeText={setName}
            onBlur={() => setTouched(true)}
            error={touched && !nameValid}
            style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
            outlineStyle={{ borderRadius: radii.input }}
            outlineColor={theme.colors.outlineVariant}
            activeOutlineColor={theme.colors.primary}
          />
          {touched && !nameValid ? <HelperText type="error" visible>Enter a role name</HelperText> : null}
          <TextInput
            mode="outlined"
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
            outlineStyle={{ borderRadius: radii.input }}
            outlineColor={theme.colors.outlineVariant}
            activeOutlineColor={theme.colors.primary}
          />

          <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PERMISSIONS</Text>
          {touched && selected.size === 0 ? <HelperText type="error" visible>Select at least one permission</HelperText> : null}

          {(catalogQuery.data ?? []).map((group) => {
            const keys = group.permissions.map((p) => p.key);
            const allOn = keys.every((k) => selected.has(k));
            return (
              <View key={group.domain} style={[styles.group, { backgroundColor: colors.card, borderColor: cardBorder }]}>
                <Pressable onPress={() => toggleGroup(keys, allOn)} style={styles.groupHeader}>
                  <Text style={[styles.groupTitle, { color: theme.colors.onSurface }]}>{group.label}</Text>
                  <Text style={[styles.groupToggle, { color: theme.colors.primary }]}>{allOn ? 'Clear all' : 'Select all'}</Text>
                </Pressable>
                {group.permissions.map((permission) => {
                  const on = selected.has(permission.key);
                  return (
                    <Pressable key={permission.key} onPress={() => toggle(permission.key)} style={styles.permRow}>
                      <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                      <Text style={[styles.permLabel, { color: theme.colors.onSurface }]}>{permission.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          <Pressable
            onPress={submit}
            disabled={save.isPending}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, shadowColor: isDark ? '#000000' : colors.primaryStrong, opacity: save.isPending ? 0.8 : 1 }
            ]}
          >
            {save.isPending ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
            <Text style={styles.saveLabel}>{isEdit ? 'Save changes' : 'Create role'}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 12, paddingBottom: 6, paddingHorizontal: 14, paddingTop: 12 },
  groupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  groupTitle: { ...fontStyles.bold, fontSize: 15 },
  groupToggle: { ...fontStyles.semiBold, fontSize: 12 },
  input: { marginTop: 8 },
  permLabel: { ...fontStyles.regular, fontSize: 14 },
  permRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  saveBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 12, letterSpacing: 0.6, marginBottom: 10, marginTop: 18 }
});
