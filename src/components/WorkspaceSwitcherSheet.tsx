import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppDialog } from '@/components/AppDialog';
import { apiErrorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

type Props = { visible: boolean; onClose: () => void };

export function WorkspaceSwitcherSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const setUser = useAuthStore((state) => state.setUser);
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  const businessesQuery = useQuery({ queryKey: queryKeys.businesses.all, queryFn: authApi.businesses, enabled: visible });
  const switchBusiness = useMutation({
    mutationFn: authApi.switchBusiness,
    onSuccess: async (user) => {
      await setUser(user);
      // The active business changed — every scoped query is now stale.
      await queryClient.invalidateQueries();
      onClose();
    },
    onError: (error) => showDialog({ title: 'Could not switch business', message: apiErrorMessage(error), tone: 'error' })
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : 700, duration: visible ? 280 : 220, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 180, useNativeDriver: true })
    ]).start();
  }, [visible, translateY, backdropOpacity]);

  const businesses = businessesQuery.data ?? [];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }]}>
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Switch business</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {businessesQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} />
            ) : (
              businesses.map((business) => (
                <Pressable
                  key={business.businessId}
                  disabled={business.current || switchBusiness.isPending}
                  onPress={() => switchBusiness.mutate(business.businessId)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: business.current ? alpha(colors.primary, isDark ? 0.2 : 0.08) : isDark ? colors.surface : '#FFFFFF',
                      borderColor: business.current ? theme.colors.primary : cardBorder,
                      opacity: pressed ? 0.85 : 1
                    }
                  ]}
                >
                  <View style={styles.optionText}>
                    <Text numberOfLines={1} style={[styles.optionLabel, { color: theme.colors.onSurface }]}>{business.businessName}</Text>
                    <Text style={[styles.optionMeta, { color: theme.colors.onSurfaceVariant }]}>{business.roleKey}</Text>
                  </View>
                  {business.current ? <Feather name="check-circle" size={18} color={theme.colors.primary} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  option: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  optionLabel: { ...fontStyles.semiBold, fontSize: 15 },
  optionMeta: { ...typeScale.caption, marginTop: 2, textTransform: 'capitalize' },
  optionText: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '70%',
    paddingTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
