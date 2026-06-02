import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Control } from 'react-hook-form';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { BusinessProfileFormValues } from '@/types';

type Props = {
  visible: boolean;
  control: Control<BusinessProfileFormValues>;
  logoPreview: string;
  businessName: string;
  saving?: boolean;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function BrandLogoSheet({ visible, control, logoPreview, businessName, saving, onPickLogo, onRemoveLogo, onClose, onSave }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel(
      visible
        ? [
            Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
          ]
        : [
            Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
          ]
    ).start();
  }, [visible, translateY, backdropOpacity]);

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 16 + insets.bottom, transform: [{ translateY }] }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Brand & Logo</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primaryStrong, isDark ? 0.24 : 0.06) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.logoRow}>
              <View style={[styles.logoFrame, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.04), borderColor: cardBorder }]}>
                <BrandMark size={72} imageUri={logoPreview} label={businessName} />
              </View>
              <View style={styles.logoActions}>
                <Pressable
                  onPress={onPickLogo}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: alpha(theme.colors.primary, isDark ? (pressed ? 0.34 : 0.24) : pressed ? 0.18 : 0.1),
                      borderColor: alpha(theme.colors.primary, isDark ? 0.5 : 0.3)
                    }
                  ]}
                >
                  <Feather name="image" size={15} color={theme.colors.primary} />
                  <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>Choose photo</Text>
                </Pressable>
                {logoPreview ? (
                  <Pressable
                    onPress={onRemoveLogo}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      {
                        backgroundColor: alpha(theme.colors.error, isDark ? (pressed ? 0.3 : 0.2) : pressed ? 0.14 : 0.08),
                        borderColor: alpha(theme.colors.error, isDark ? 0.45 : 0.28)
                      }
                    ]}
                  >
                    <Feather name="trash-2" size={15} color={theme.colors.error} />
                    <Text style={[styles.actionLabel, { color: theme.colors.error }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <FormTextInput control={control} name="businessName" label="Business name" />
          </View>

          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: saving ? colors.surfaceContainerHigh : pressed ? colors.primaryStrong : theme.colors.primary,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="check" size={16} color={saving ? theme.colors.onSurfaceVariant : '#FFFFFF'} strokeWidth={3} />
            <Text style={[styles.submitLabel, { color: saving ? theme.colors.onSurfaceVariant : '#FFFFFF' }]}>
              {saving ? 'Saving...' : 'Save changes'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  actionLabel: { ...fontStyles.semiBold, fontSize: 13 },
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  content: { paddingHorizontal: 18, paddingTop: 14 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  logoActions: { flex: 1, gap: 8, justifyContent: 'center' },
  logoFrame: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 88, justifyContent: 'center', overflow: 'hidden', width: 88 },
  logoRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '90%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  submitBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 16,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  submitLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
