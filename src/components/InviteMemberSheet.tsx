import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { RoleOption } from '@/components/RolePickerSheet';

type Props = {
  visible: boolean;
  roleOptions: RoleOption[];
  saving: boolean;
  onSubmit: (payload: { email: string; roleKey?: string; roleId?: string }) => void;
  onClose: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberSheet({ visible, roleOptions, saving, onSubmit, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [email, setEmail] = useState('');
  const [selectedValue, setSelectedValue] = useState<string | undefined>(roleOptions[0]?.value);
  const [touched, setTouched] = useState(false);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const emailValid = EMAIL_RE.test(email.trim());

  useEffect(() => {
    if (visible) {
      setEmail('');
      setTouched(false);
      setSelectedValue(roleOptions[0]?.value);
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
    // roleOptions is stable per render cycle; only re-run on open/close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    setTouched(true);
    const option = roleOptions.find((o) => o.value === selectedValue);
    if (!emailValid || !option) return;
    onSubmit({ email: email.trim().toLowerCase(), roleKey: option.roleKey, roleId: option.roleId });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Invite teammate</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <TextInput
              mode="outlined"
              label="Email address"
              value={email}
              onChangeText={setEmail}
              onBlur={() => setTouched(true)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              error={touched && !emailValid}
              style={[styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
              outlineStyle={{ borderRadius: radii.input }}
              outlineColor={theme.colors.outlineVariant}
              activeOutlineColor={theme.colors.primary}
            />
            {touched && !emailValid ? <HelperText type="error" visible>Enter a valid email address</HelperText> : null}

            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>ROLE</Text>
            {roleOptions.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setSelectedValue(option.value)}
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
                    {option.description ? <Text numberOfLines={2} style={[styles.optionDescription, { color: theme.colors.onSurfaceVariant }]}>{option.description}</Text> : null}
                  </View>
                  {selected ? <Feather name="check" size={18} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, shadowColor: isDark ? '#000000' : colors.primaryStrong, opacity: saving ? 0.8 : 1 }
            ]}
          >
            {saving ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Feather name="send" size={16} color="#FFFFFF" />}
            <Text style={styles.saveLabel}>Send invite</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  input: { marginTop: 4 },
  option: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  optionDescription: { ...fontStyles.regular, fontSize: 12, lineHeight: 16, marginTop: 2 },
  optionLabel: { ...fontStyles.semiBold, fontSize: 15 },
  optionText: { flex: 1 },
  saveBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 10,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 12, letterSpacing: 0.6, marginBottom: 10, marginTop: 6 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '92%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
