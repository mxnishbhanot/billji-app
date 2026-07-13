import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

export type RoleOption = { value: string; label: string; description?: string; roleKey?: string; roleId?: string };

type Props = {
  visible: boolean;
  title: string;
  options: RoleOption[];
  selectedValue?: string;
  saving?: boolean;
  onSelect: (option: RoleOption) => void;
  onClose: () => void;
};

// Single-select role sheet. Shared by the invite flow and member re-role — the caller
// builds the option list (system roles + the business's custom roles) and maps the
// chosen option onto { roleKey } or { roleId }.
export function RolePickerSheet({ visible, title, options, selectedValue, saving = false, onSelect, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 700, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  disabled={saving}
                  onPress={() => onSelect(option)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: selected ? alpha(colors.primary, isDark ? 0.2 : 0.08) : isDark ? colors.surface : '#FFFFFF',
                      borderColor: selected ? theme.colors.primary : cardBorder,
                      opacity: pressed ? 0.85 : 1
                    }
                  ]}
                >
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: theme.colors.onSurface }]}>{option.label}</Text>
                    {option.description ? (
                      <Text numberOfLines={2} style={[styles.optionDescription, { color: theme.colors.onSurfaceVariant }]}>{option.description}</Text>
                    ) : null}
                  </View>
                  {saving && selected ? (
                    <ActivityIndicator size={16} color={theme.colors.primary} />
                  ) : selected ? (
                    <Feather name="check" size={18} color={theme.colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
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
  optionDescription: { ...fontStyles.regular, fontSize: 12, lineHeight: 16, marginTop: 2 },
  optionLabel: { ...fontStyles.semiBold, fontSize: 15 },
  optionText: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '80%',
    paddingTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
