import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { BrandMark } from './BrandMark';
import { NotificationButton } from './NotificationButton';

type Props = { title: string; children: ReactNode; scroll?: boolean; showNotifications?: boolean; contentStyle?: ViewStyle };
const CONTENT_BOTTOM_PADDING = 96;

export function Screen({ title, children, scroll = true, showNotifications = true, contentStyle }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const navigation = useNavigation<any>();
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
      <View style={[styles.glow, { backgroundColor: isDark ? theme.colors.primary : theme.colors.primaryContainer, opacity: isDark ? 0.16 : 0.52 }]} />
      <Appbar.Header
        mode="small"
        statusBarHeight={0}
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: isDark ? theme.colors.outlineVariant : 'transparent',
            borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 0
          }
        ]}
      >
        {canGoBackInStack ? <Appbar.BackAction onPress={() => navigation.goBack()} /> : null}
        <View style={[canGoBackInStack ? styles.logoAfterBack : styles.logoAtStart]}>
          <BrandMark size={38} compact />
        </View>
        <Appbar.Content title={title} titleStyle={[styles.title, { color: theme.colors.onBackground }]} />
        {showNotifications ? <NotificationButton /> : null}
      </Appbar.Header>
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
  header: {
    elevation: 0,
    shadowOpacity: 0
  },
  logoAfterBack: { marginLeft: -4 },
  logoAtStart: { marginLeft: 16 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }
});
