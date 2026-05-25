import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { BrandMark } from './BrandMark';
import { NotificationButton } from './NotificationButton';

type Props = { title: string; children: ReactNode; scroll?: boolean; showNotifications?: boolean; contentStyle?: ViewStyle };
const CONTENT_BOTTOM_PADDING = 96;

export function Screen({ title, children, scroll = true, showNotifications = true, contentStyle }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const navigation = useNavigation<any>();
  const businessProfile = useAuthStore((state) => state.user?.businessProfile);
  const businessName = businessProfile?.businessName?.trim();
  const insets = useSafeAreaInsets();
  const navigationState = navigation.getState();
  const canGoBackInStack = navigationState.type === 'stack' && navigationState.index > 0;
  const content = (
    <View style={[styles.content, { paddingBottom: CONTENT_BOTTOM_PADDING + insets.bottom }, contentStyle]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.glow, { backgroundColor: isDark ? theme.colors.primary : theme.colors.primaryContainer, opacity: isDark ? 0.12 : 0.44 }]} />
      <View
        style={[
          styles.headerShell,
          {
            backgroundColor: isDark ? theme.colors.elevation.level1 : 'rgba(255,255,255,0.78)',
            borderColor: isDark ? theme.colors.outlineVariant : theme.colors.outlineVariant,
            shadowColor: isDark ? theme.colors.primary : '#000000',
            shadowOpacity: isDark ? 0.08 : 0.09
          }
        ]}
      >
        {canGoBackInStack ? <Appbar.BackAction onPress={() => navigation.goBack()} style={styles.backAction} /> : null}
        <View style={[styles.logoChip, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
          <BrandMark size={36} compact imageUri={businessProfile?.logoUrl} label={businessName} />
        </View>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }]}>{title}</Text>
          {businessName ? <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{businessName}</Text> : null}
        </View>
        {showNotifications ? <NotificationButton /> : null}
      </View>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 12 },
  glow: {
    borderRadius: 999,
    height: 170,
    opacity: 0.52,
    position: 'absolute',
    right: -62,
    top: -82,
    width: 170
  },
  backAction: { marginLeft: -8, marginRight: -2 },
  headerShell: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 4,
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 6,
    minHeight: 66,
    paddingLeft: 10,
    paddingRight: 8,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24
  },
  logoChip: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46
  },
  subtitle: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  title: { fontWeight: '900', letterSpacing: -0.4 },
  titleBlock: { flex: 1, minWidth: 0 }
});
