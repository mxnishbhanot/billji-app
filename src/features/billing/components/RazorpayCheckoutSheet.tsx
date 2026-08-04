import { useMemo } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkoutHtml, parseCheckoutMessage, type CheckoutResult } from '@/features/billing/checkoutBridge';
import { alpha, appColors, radii } from '@/theme/theme';
import type { Checkout } from '@/types';

export type { CheckoutResult };

type Props = {
  checkout: Checkout | null;
  customerName?: string;
  customerEmail?: string;
  onPaid: (result: CheckoutResult) => void;
  onClose: (reason: 'dismissed' | 'failed', message?: string) => void;
};

// Razorpay Checkout, hosted in the WebView the app already ships (invoice preview uses the same
// dependency). No new package, and no native Razorpay SDK: the SDK's only advantage is UPI-intent
// autofill, and it would add a config plugin plus a prebuild to every developer's setup.
//
// The page itself and the message parsing live in ../checkoutBridge.ts: they are pure, they decide
// whether a mandate or a one-off payment is opened, and testing that must not require this file's
// native WebView import.

export function RazorpayCheckoutSheet({ checkout, customerName, customerEmail, onPaid, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const visible = Boolean(checkout);

  const isMandate = Boolean(checkout?.subscriptionId);

  const handleMessage = (raw: string) => {
    const message = parseCheckoutMessage(raw);
    if (message.kind === 'paid') return onPaid(message.result);
    if (message.kind === 'failed') return onClose('failed', message.message);
    if (message.kind === 'dismissed') return onClose('dismissed');
  };

  /**
   * UPI Autopay hands the mandate off to a UPI app (`upi://`, `phonepe://`, `tez://`), and a WebView
   * refuses to load a scheme it does not know — so without this, approving a mandate simply does
   * nothing. It also fixes UPI-intent on the one-time path, which had the same silent dead end.
   *
   * ponytail: no return deep link. The customer comes back through the app switcher and Razorpay's
   * own page reports the result; wiring a redirect URL means an app-scheme round trip for one screen.
   */
  const handleShouldLoad = (request: { url: string }) => {
    if (/^(https?|about|data|blob):/i.test(request.url)) return true;

    Linking.openURL(request.url).catch(() =>
      onClose('failed', 'We could not open your UPI app. Try a card, or pay without autopay.')
    );
    return false;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose('dismissed')} statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>{isMandate ? 'Approve autopay' : 'Secure payment'}</Text>
          <Pressable
            onPress={() => onClose('dismissed')}
            hitSlop={8}
            style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}
          >
            <Feather name="x" size={16} color={theme.colors.onSurface} />
          </Pressable>
        </View>

        {/* ponytail: react-native-webview has no web build (same constraint InvoiceTemplateScreen
            documents). Checkout on web needs Razorpay's script injected into the real document —
            build it if web ever becomes a paying surface. */}
        {Platform.OS === 'web' ? (
          <View style={styles.webFallback}>
            <Text style={[styles.fallbackText, { color: theme.colors.onSurfaceVariant }]}>
              Payments open in the BillJi mobile app. Your plan and prices are the same there.
            </Text>
          </View>
        ) : checkout ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: checkoutHtml({ checkout, customerName, customerEmail }) }}
            style={{ backgroundColor: colors.background }}
            javaScriptEnabled
            domStorageEnabled
            onShouldStartLoadWithRequest={handleShouldLoad}
            // Razorpay opens bank pages in the same view; a popup would land outside our message channel.
            setSupportMultipleWindows={false}
            onMessage={(event) => handleMessage(event.nativeEvent.data)}
            onError={() => onClose('failed', 'Could not open the payment page')}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  closeBtn: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  fallbackText: { fontSize: 14, textAlign: 'center', lineHeight: 20 }
});
