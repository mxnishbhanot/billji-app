import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { Customer } from '@/types';

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

type Props = {
  visible: boolean;
  customers: Customer[];
  selectedCustomerId?: string;
  search: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  onSelect: (customer: Customer) => void;
  onQuickAdd?: () => void;
  onClose: () => void;
};

export function CustomerPickerSheet({
  visible,
  customers,
  selectedCustomerId,
  search,
  loading,
  loadingMore,
  hasMore,
  onSearchChange,
  onLoadMore,
  onSelect,
  onQuickAdd,
  onClose
}: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);
  const inputBackground = isDark ? colors.surface : '#FFFFFF';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: cardBorder,
              paddingBottom: 12 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Select customer</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <TextInput
            mode="outlined"
            placeholder="Search by name or phone"
            value={search}
            onChangeText={onSearchChange}
            autoCorrect={false}
            left={<TextInput.Icon icon="magnify" color={theme.colors.onSurfaceVariant} />}
            right={search ? <TextInput.Icon icon="close-circle" color={theme.colors.onSurfaceVariant} onPress={() => onSearchChange('')} /> : null}
            outlineColor={cardBorder}
            activeOutlineColor={theme.colors.primary}
            outlineStyle={styles.inputOutline}
            style={[styles.searchInput, { backgroundColor: inputBackground }]}
          />
          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>Loading customers...</Text>
            </View>
          ) : (
            <FlatList
              data={customers}
              keyExtractor={(item) => item._id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              onEndReached={() => { if (hasMore && !loadingMore) onLoadMore(); }}
              onEndReachedThreshold={0.4}
              ListEmptyComponent={
                <View style={styles.stateWrap}>
                  <MaterialCommunityIcons name="account-search-outline" size={32} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>
                    {search ? `No customers match "${search}"` : 'No customers yet'}
                  </Text>
                </View>
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />
                ) : !hasMore && customers.length ? (
                  <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>
                    {customers.length} customer{customers.length === 1 ? '' : 's'}
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                const active = item._id === selectedCustomerId;
                return (
                  <Pressable
                    onPress={() => onSelect(item)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: active ? alpha(colors.primary, isDark ? 0.22 : 0.1) : pressed ? alpha(colors.primary, isDark ? 0.14 : 0.06) : subSurface,
                        borderColor: active ? alpha(colors.primary, isDark ? 0.5 : 0.35) : cardBorder
                      }
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(item.name)}</Text>
                    </View>
                    <View style={styles.rowContent}>
                      <Text numberOfLines={1} style={[styles.rowName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                      <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>
                        {item.countryCode || '+91'} {item.phone}
                      </Text>
                    </View>
                    {active ? <Feather name="check-circle" size={18} color={theme.colors.primary} /> : <Feather name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />}
                  </Pressable>
                );
              }}
            />
          )}
          {onQuickAdd ? (
            <Pressable
              onPress={onQuickAdd}
              style={({ pressed }) => [
                styles.quickAddBtn,
                { borderColor: alpha(colors.primary, isDark ? 0.4 : 0.28), backgroundColor: alpha(colors.primary, pressed ? 0.12 : 0.04) }
              ]}
            >
              <Feather name="plus" size={15} color={theme.colors.primary} />
              <Text style={[styles.quickAddLabel, { color: theme.colors.primary }]}>Add new customer</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { ...fontStyles.bold, fontSize: 13, letterSpacing: 0.4 },
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  endText: { ...fontStyles.semiBold, fontSize: 12, paddingVertical: 10, textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  footerLoader: { marginVertical: 12 },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  inputOutline: { borderRadius: radii.input },
  list: { flexGrow: 0, marginTop: 12 },
  listContent: { gap: 8, paddingBottom: 4, paddingHorizontal: 18 },
  quickAddBtn: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 10,
    paddingVertical: 12
  },
  quickAddLabel: { ...fontStyles.bold, fontSize: 13 },
  row: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { ...fontStyles.semiBold, fontSize: 12, marginTop: 2 },
  rowName: { ...fontStyles.bold, fontSize: 14 },
  searchInput: { fontSize: 14, marginHorizontal: 18, marginTop: 12 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    height: '80%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  stateWrap: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  stateText: { ...fontStyles.semiBold, fontSize: 13, textAlign: 'center' },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
