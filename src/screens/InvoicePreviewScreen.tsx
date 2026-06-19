import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { Screen } from '@/components/Screen';
import { InvoicePreviewScreenProps } from '@/navigation/types';
import { radii } from '@/theme/theme';

const A4_PAGE_WIDTH = 794;
const A4_RATIO = A4_PAGE_WIDTH / 1123;

// The PDF template is a fixed 794px-wide A4 page. WebView has no viewport meta of
// its own, so it renders the page at full width and the user sees it zoomed in.
// Inject a viewport that pins the content width to 794 so WebView scales the whole
// page down to fit the device. Replace any existing viewport to avoid conflicts.
const VIEWPORT_TAG = `<meta name="viewport" content="width=${A4_PAGE_WIDTH}, initial-scale=1, maximum-scale=1, user-scalable=no">`;
function withFittedViewport(html: string) {
  const stripped = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, '');
  if (/<head[^>]*>/i.test(stripped)) return stripped.replace(/<head[^>]*>/i, (head) => `${head}${VIEWPORT_TAG}`);
  if (/<html[^>]*>/i.test(stripped)) return stripped.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${VIEWPORT_TAG}</head>`);
  return `${VIEWPORT_TAG}${stripped}`;
}

function PreviewSurface({ html, frameWidth }: { html: string; frameWidth: number }) {
  if (Platform.OS === 'web') {
    const scale = frameWidth > 0 ? frameWidth / 794 : 1;
    return createElement('iframe', {
      srcDoc: html,
      title: 'Invoice preview',
      scrolling: 'no',
      style: {
        border: 'none',
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        transform: `scale(${scale})`,
        transformOrigin: 'top left'
      }
    });
  }

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: withFittedViewport(html) }}
      style={styles.webview}
      scrollEnabled
      showsVerticalScrollIndicator={false}
      javaScriptEnabled={false}
      androidLayerType="software"
    />
  );
}

export function InvoicePreviewScreen({ route }: InvoicePreviewScreenProps) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { payload } = route.params;
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setPreviewHtml(null);
    invoicesApi
      .preview(payload)
      .then((html) => {
        if (id === requestId.current) setPreviewHtml(html);
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        showDialog({ title: 'Could not load preview', message: apiErrorMessage(error), tone: 'error' });
      });
  }, [payload, showDialog]);

  return (
    <Screen title="Invoice Preview" scroll={false}>
      <View style={[styles.previewFrame, { borderColor: theme.colors.outlineVariant || theme.colors.outline }]} onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}>
        {previewHtml ? (
          <PreviewSurface html={previewHtml} frameWidth={frameWidth} />
        ) : (
          <View style={styles.previewLoading}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </View>
      <Text style={[styles.previewHint, { color: theme.colors.onSurfaceVariant }]}>Preview uses the same HTML template as the generated PDF.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewFrame: { aspectRatio: A4_RATIO, backgroundColor: '#ffffff', borderRadius: radii.lg, borderWidth: 1, marginBottom: 6, overflow: 'hidden' },
  previewHint: { fontSize: 12, marginBottom: 18, textAlign: 'center' },
  previewLoading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  webview: { backgroundColor: '#ffffff', flex: 1 }
});