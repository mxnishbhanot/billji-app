import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppDialog } from '@/components/AppDialog';
import { apiErrorMessage } from '@/api/client';
import { rolesApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import type { RoleSummary } from '@/types';
import type { RolesScreenProps as NavProps } from '@/navigation/types';

export function RolesScreen({ navigation }: NavProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.rolesManage);

  const [archiving, setArchiving] = useState<RoleSummary | null>(null);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);

  const rolesQuery = useQuery({ queryKey: queryKeys.roles.list, queryFn: rolesApi.list });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
  const onError = (title: string) => (error: unknown) => showDialog({ title, message: apiErrorMessage(error), tone: 'error' });

  const archive = useMutation({ mutationFn: rolesApi.archive, onSuccess: () => { setArchiving(null); invalidate(); }, onError: onError('Could not archive role') });
  const remove = useMutation({ mutationFn: rolesApi.remove, onSuccess: () => { setDeleting(null); invalidate(); }, onError: (e) => { setDeleting(null); onError('Could not delete role')(e); } });

  const roles = rolesQuery.data ?? [];
  // System roles by privilege hierarchy (most → least), not alphabetical.
  const SYSTEM_ROLE_ORDER = ['owner', 'admin', 'accountant', 'staff', 'viewer'];
  const rank = (key: string) => { const i = SYSTEM_ROLE_ORDER.indexOf(key); return i === -1 ? SYSTEM_ROLE_ORDER.length : i; };
  const systemRoles = roles.filter((r) => r.isSystem).sort((a, b) => rank(a.key) - rank(b.key));
  const customRoles = roles.filter((r) => !r.isSystem);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  const headerAction = canManage ? (
    <Pressable onPress={() => navigation.navigate('RoleEditor', {})} style={[styles.addBtn, { backgroundColor: theme.colors.primary }]} hitSlop={8}>
      <Feather name="plus" size={20} color={theme.colors.onPrimary} />
    </Pressable>
  ) : undefined;

  const renderRole = (role: RoleSummary) => {
    const editable = canManage && !role.isSystem;
    return (
      <Pressable
        key={role.id}
        disabled={!editable}
        onPress={() => editable && navigation.navigate('RoleEditor', { roleId: role.id })}
        style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={[styles.icon, { backgroundColor: alpha(role.isSystem ? colors.violet : colors.primary, isDark ? 0.24 : 0.12) }]}>
          <Feather name={role.isSystem ? 'lock' : 'shield'} size={16} color={role.isSystem ? colors.violet : theme.colors.primary} />
        </View>
        <View style={styles.cardText}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.colors.onSurface }]}>{role.name}</Text>
          <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
            {role.isSystem ? 'System role' : 'Custom role'} · {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
          </Text>
        </View>
        {editable ? (
          <View style={styles.actions}>
            <Pressable onPress={() => setArchiving(role)} hitSlop={8} style={styles.iconAction}>
              <Feather name="archive" size={16} color={theme.colors.onSurfaceVariant} />
            </Pressable>
            <Pressable onPress={() => setDeleting(role)} hitSlop={8} style={styles.iconAction}>
              <Feather name="trash-2" size={16} color={theme.colors.error} />
            </Pressable>
          </View>
        ) : (
          <Feather name="chevron-right" size={18} color="transparent" />
        )}
      </Pressable>
    );
  };

  return (
    <Screen title="Roles" headerAction={headerAction}>
      {rolesQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : roles.length === 0 ? (
        <EmptyState title="No roles" message="Roles could not be loaded." />
      ) : (
        <>
          {customRoles.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>CUSTOM ROLES</Text>
              {customRoles.map(renderRole)}
            </View>
          ) : null}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SYSTEM ROLES</Text>
            {systemRoles.map(renderRole)}
          </View>
        </>
      )}

      <ConfirmDialog
        visible={Boolean(archiving)}
        title="Archive role?"
        message={`"${archiving?.name}" will be hidden and can no longer be assigned. Members already on it keep their access.`}
        confirmLabel="Archive"
        onCancel={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
      />
      <ConfirmDialog
        visible={Boolean(deleting)}
        title="Delete role?"
        message={`"${deleting?.name}" will be permanently deleted. If it's still assigned to anyone, archive it instead.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 4 },
  addBtn: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  cardText: { flex: 1, minWidth: 0 },
  icon: { alignItems: 'center', borderRadius: radii.md, height: 38, justifyContent: 'center', width: 38 },
  iconAction: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  meta: { ...typeScale.caption, marginTop: 2 },
  name: { ...fontStyles.semiBold, fontSize: 15 },
  section: { marginTop: 18 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 12, letterSpacing: 0.6, marginBottom: 12 }
});
