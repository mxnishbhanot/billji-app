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
import { A4_PAGE_WIDTH, A4_RATIO, withFittedViewport } from '@/utils/invoicePreview';

function PreviewSurface({ html, frameWidth }: { html: string; frameWidth: number }) {
  if (Platform.OS === 'web') {
    const scale = frameWidth > 0 ? frameWidth / A4_PAGE_WIDTH : 1;
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