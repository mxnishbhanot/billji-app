import { ReactNode, RefObject, useState } from 'react';
import { Pressable, ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, radii, spacing, typeScale } from '@/theme/theme';
import { AppNavigation } from '@/navigation/types';
import { BrandMark } from './BrandMark';
import { NotificationButton } from './NotificationButton';
import { QuickActionsSheet } from './QuickActionsSheet';
import { OfflineBanner } from './SyncStatus';

type Props = {
  title: string;
  children: ReactNode;
  scroll?: boolean;
  showNotifications?: boolean;
  headerAction?: ReactNode;
  titleAccessory?: ReactNode;
  contentStyle?: ViewStyle;
  scrollViewProps?: ScrollViewProps;
  scrollRef?: RefObject<ScrollView | null>;
  /** Screens that already render their own OfflineBanner (Sync settings / issues). */
  hideOfflineBanner?: boolean;
  /** When provided, replaces the default header shell (Dashboard Warm Ledger header). */
  renderHeader?: () => ReactNode;
};
const CONTENT_BOTTOM_PADDING = 112;

export function Screen({
  title,
  children,
  scroll = true,
  showNotifications = true,
  headerAction,
  titleAccessory,
  contentStyle,
  scrollViewProps,
  scrollRef,
  hideOfflineBanner = false,
  renderHeader
}: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const navigation = useNavigation<AppNavigation>();
  const businessProfile = useAuthStore((state) => state.user?.businessProfile);
  const businessName = businessProfile?.businessName?.trim();
  const insets = useSafeAreaInsets();
  // Search-anything / create-anything, in the one header every screen already renders.
  const [quickOpen, setQuickOpen] = useState(false);
  const navigationState = navigation.getState();
  const currentRoute = navigationState.routes[navigationState.index];
  const rootRoute = navigationState.routes[0];
  const canGoBackInStack = navigationState.type === 'stack' && navigationState.index > 0 && currentRoute?.name !== rootRoute?.name;
  const content = (
    <View style={[styles.content, { paddingBottom: CONTENT_BOTTOM_PADDING + insets.bottom }, contentStyle]}>
      {hideOfflineBanner ? null : <OfflineBanner style={styles.offlineBanner} />}
      {children}
    </View>
  );
  return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        {renderHeader ? (
          <View style={styles.customHeader}>{renderHeader()}</View>
        ) : (
        <View
          style={[
            styles.headerShell,
            {
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              shadowColor: isDark ? theme.colors.primary : colors.primaryStrong,
              shadowOpacity: 0
            }
          ]}
        >
          {canGoBackInStack ? <Appbar.BackAction onPress={() => navigation.goBack()} style={styles.backAction} /> : null}
          {canGoBackInStack ? null : (
            <View style={[styles.logoChip, { backgroundColor: isDark ? alpha(colors.primary, 0.18) : alpha('#FFFFFF', 0.7), borderColor: isDark ? alpha(colors.primary, 0.24) : alpha(colors.primaryStrong, 0.08) }]}>
              <BrandMark size={36} compact imageUri={businessProfile?.logoUrl} label={businessName} />
            </View>
          )}
          <View style={styles.titleBlock}>
            {canGoBackInStack ? null : (
              <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{businessName || 'Billji Business'}</Text>
            )}
            <View style={styles.titleRow}>
              <Text numberOfLines={1} variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }, canGoBackInStack ? styles.titleCompact : null]}>{title}</Text>
              {titleAccessory}
            </View>
          </View>
          <Pressable
            onPress={() => setQuickOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Search or create"
            style={({ pressed }) => [
              styles.quickBtn,
              { backgroundColor: alpha(colors.primary, isDark ? (pressed ? 0.28 : 0.18) : pressed ? 0.16 : 0.08) }
            ]}
          >
            <Feather name="search" size={17} color={theme.colors.onSurface} />
          </Pressable>
          {headerAction ?? (showNotifications ? <NotificationButton /> : null)}
        </View>
        )}
        {renderHeader ? null : <QuickActionsSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />}
        {scroll ? (
          <KeyboardAwareScrollView
            ref={scrollRef as never}
            bottomOffset={24}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            {...scrollViewProps}
          >
            {content}
          </KeyboardAwareScrollView>
        ) : content}
      </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.screenPadding, paddingTop: 8 },
  backAction: { marginLeft: -8, marginRight: -2 },
  headerShell: {
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    elevation: 0,
    flexDirection: 'row',
    marginHorizontal: spacing.screenPadding,
    marginTop: 12,
    minHeight: 58,
    paddingLeft: 0,
    paddingRight: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0
  },
  logoChip: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginRight: 10,
    width: 40
  },
  offlineBanner: { marginBottom: 10 },
  quickBtn: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  subtitle: { ...typeScale.bodyPrimaryMedium, fontSize: 13, lineHeight: 18 },
  title: { ...typeScale.screenTitle, flexShrink: 1, fontSize: 26, lineHeight: 34, letterSpacing: -0.52 },
  titleCompact: { fontSize: 22, letterSpacing: -0.4, lineHeight: 28 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minWidth: 0 },
  customHeader: { marginHorizontal: spacing.screenPadding, marginTop: 8 }
});
