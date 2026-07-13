import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusPill } from '@/components/StatusPill';
import { InviteMemberSheet } from '@/components/InviteMemberSheet';
import { RolePickerSheet, RoleOption } from '@/components/RolePickerSheet';
import { useAppDialog } from '@/components/AppDialog';
import { apiErrorMessage } from '@/api/client';
import { rolesApi, teamApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import type { TeamMember } from '@/types';

const SYSTEM_ROLE_META: { roleKey: string; label: string; description: string }[] = [
  { roleKey: 'admin', label: 'Admin', description: 'Full access to run the business.' },
  { roleKey: 'accountant', label: 'Accountant', description: 'Invoices, orders, payments and customers.' },
  { roleKey: 'staff', label: 'Staff', description: 'Day-to-day sales operations.' },
  { roleKey: 'viewer', label: 'Viewer', description: 'Read-only access.' }
];

const memberTone = (status: TeamMember['status']) =>
  status === 'active' ? 'success' : status === 'invited' ? 'pending' : 'cancelled';

const initials = (name?: string, email?: string) => (name || email || '?').trim().charAt(0).toUpperCase();

export function TeamScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.teamManage);
  const currentRoleKey = useAuthStore((state) => state.user?.roleKey);
  const isOwner = !currentRoleKey || currentRoleKey === 'owner';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [reRoleTarget, setReRoleTarget] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const membersQuery = useQuery({ queryKey: queryKeys.team.members, queryFn: teamApi.members });
  const invitationsQuery = useQuery({ queryKey: queryKeys.team.invitations, queryFn: teamApi.invitations, enabled: canManage });
  // Custom roles for the re-role picker (system roles are hardcoded below).
  const rolesQuery = useQuery({ queryKey: queryKeys.roles.list, queryFn: rolesApi.list, enabled: canManage });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.team.all });
  };
  const onError = (title: string) => (error: unknown) => showDialog({ title, message: apiErrorMessage(error), tone: 'error' });

  const invite = useMutation({
    mutationFn: teamApi.invite,
    onSuccess: () => { setInviteOpen(false); invalidate(); showDialog({ title: 'Invitation sent', tone: 'success' }); },
    onError: onError('Could not send invite')
  });
  const cancelInvite = useMutation({ mutationFn: teamApi.cancelInvite, onSuccess: invalidate, onError: onError('Could not cancel invite') });
  const resendInvite = useMutation({
    mutationFn: teamApi.resendInvite,
    onSuccess: () => { invalidate(); showDialog({ title: 'Invitation resent', tone: 'success' }); },
    onError: onError('Could not resend invite')
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: { roleKey?: string; roleId?: string } }) => teamApi.updateRole(userId, payload),
    onSuccess: () => { setReRoleTarget(null); invalidate(); },
    onError: onError('Could not change role')
  });
  const changeStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'archived' }) => teamApi.updateStatus(userId, status),
    onSuccess: invalidate,
    onError: onError('Could not update member')
  });
  const removeMember = useMutation({
    mutationFn: teamApi.removeMember,
    onSuccess: () => { setRemoving(null); invalidate(); },
    onError: onError('Could not remove member')
  });

  // Role options for invite: system roles, plus owner only when the actor is an owner.
  const inviteRoleOptions: RoleOption[] = useMemo(() => {
    const base = SYSTEM_ROLE_META.map((r) => ({ value: r.roleKey, roleKey: r.roleKey, label: r.label, description: r.description }));
    return isOwner ? [{ value: 'owner', roleKey: 'owner', label: 'Owner', description: 'Full access, including billing.' }, ...base] : base;
  }, [isOwner]);

  // Re-role options: system roles + this business's custom roles.
  const reRoleOptions: RoleOption[] = useMemo(() => {
    const customRoles = (rolesQuery.data ?? []).filter((r) => !r.isSystem && !r.isArchived);
    return [
      ...inviteRoleOptions,
      ...customRoles.map((r) => ({ value: `custom:${r.id}`, roleId: r.id, label: r.name, description: r.description || 'Custom role' }))
    ];
  }, [inviteRoleOptions, rolesQuery.data]);

  const headerAction = canManage ? (
    <Pressable onPress={() => setInviteOpen(true)} style={[styles.addBtn, { backgroundColor: theme.colors.primary }]} hitSlop={8}>
      <Feather name="user-plus" size={18} color={theme.colors.onPrimary} />
    </Pressable>
  ) : undefined;

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Team" headerAction={headerAction}>
      {membersQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : members.length === 0 && invitations.length === 0 ? (
        <EmptyState
          title="No teammates yet"
          message="Invite people to help run your business. You control what each role can access."
          actionLabel={canManage ? 'Invite teammate' : undefined}
          onAction={canManage ? () => setInviteOpen(true) : undefined}
        />
      ) : (
        <>
          {canManage && invitations.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PENDING INVITES</Text>
              {invitations.map((inv) => (
                <View key={inv.id} style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
                  <View style={[styles.avatar, { backgroundColor: alpha(colors.warning, isDark ? 0.24 : 0.14) }]}>
                    <Feather name="mail" size={16} color={colors.warning} />
                  </View>
                  <View style={styles.cardText}>
                    <Text numberOfLines={1} style={[styles.name, { color: theme.colors.onSurface }]}>{inv.email}</Text>
                    <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{inv.roleName} · Pending</Text>
                  </View>
                  <Pressable onPress={() => resendInvite.mutate(inv.id)} hitSlop={8} style={styles.iconAction}>
                    <Feather name="refresh-cw" size={16} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                  <Pressable onPress={() => cancelInvite.mutate(inv.id)} hitSlop={8} style={styles.iconAction}>
                    <Feather name="x" size={18} color={theme.colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>MEMBERS</Text>
            {members.map((member) => (
              <View key={member.userId} style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
                <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12) }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.primary }]}>{initials(member.name, member.email)}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text numberOfLines={1} style={[styles.name, { color: theme.colors.onSurface }]}>{member.name || member.email}</Text>
                  <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{member.email}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.roleChip, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
                      <Text style={[styles.roleChipText, { color: theme.colors.primary }]}>{member.roleName || member.roleKey}</Text>
                    </View>
                    {member.status !== 'active' ? <StatusPill label={member.status} tone={memberTone(member.status)} /> : null}
                  </View>
                </View>
                {canManage ? (
                  <View style={styles.actions}>
                    <Pressable onPress={() => setReRoleTarget(member)} hitSlop={8} style={styles.iconAction}>
                      <Feather name="shield" size={16} color={theme.colors.onSurfaceVariant} />
                    </Pressable>
                    <Pressable
                      onPress={() => changeStatus.mutate({ userId: member.userId, status: member.status === 'archived' ? 'active' : 'archived' })}
                      hitSlop={8}
                      style={styles.iconAction}
                    >
                      <Feather name={member.status === 'archived' ? 'rotate-ccw' : 'archive'} size={16} color={theme.colors.onSurfaceVariant} />
                    </Pressable>
                    <Pressable onPress={() => setRemoving(member)} hitSlop={8} style={styles.iconAction}>
                      <Feather name="trash-2" size={16} color={theme.colors.error} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </>
      )}

      <InviteMemberSheet
        visible={inviteOpen}
        roleOptions={reRoleOptions}
        saving={invite.isPending}
        onSubmit={(payload) => invite.mutate(payload)}
        onClose={() => setInviteOpen(false)}
      />
      <RolePickerSheet
        visible={Boolean(reRoleTarget)}
        title={`Change role · ${reRoleTarget?.name || reRoleTarget?.email || ''}`}
        options={reRoleOptions}
        selectedValue={reRoleTarget?.roleId ? `custom:${reRoleTarget.roleId}` : reRoleTarget?.roleKey}
        saving={changeRole.isPending}
        onSelect={(option) => reRoleTarget && changeRole.mutate({ userId: reRoleTarget.userId, payload: option.roleId ? { roleId: option.roleId } : { roleKey: option.roleKey } })}
        onClose={() => setReRoleTarget(null)}
      />
      <ConfirmDialog
        visible={Boolean(removing)}
        title="Remove member?"
        message={`${removing?.name || removing?.email || 'This member'} will lose access to this business. You can invite them again later.`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && removeMember.mutate(removing.userId)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 4 },
  addBtn: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  avatar: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { ...fontStyles.bold, fontSize: 16 },
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 6 },
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  cardText: { flex: 1, minWidth: 0 },
  iconAction: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  meta: { ...typeScale.caption, marginTop: 1 },
  name: { ...fontStyles.semiBold, fontSize: 15 },
  roleChip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  roleChipText: { ...fontStyles.semiBold, fontSize: 11, textTransform: 'capitalize' },
  section: { marginTop: 18 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 12, letterSpacing: 0.6, marginBottom: 12 }
});
