import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { PdfPreview } from '@/components/PdfPreview';
import { Screen } from '@/components/Screen';
import { InvoicePreviewScreenProps } from '@/navigation/types';
import { A4_RATIO, radii } from '@/theme/theme';

export function InvoicePreviewScreen({ route }: InvoicePreviewScreenProps) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { payload } = route.params;
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setPreviewPdf(null);
    invoicesApi
      .preview(payload)
      .then((base64) => {
        if (id === requestId.current) setPreviewPdf(base64);
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        showDialog({ title: 'Could not load preview', message: apiErrorMessage(error), tone: 'error' });
      });
  }, [payload, showDialog]);

  return (
    <Screen title="Invoice Preview" scroll={false}>
      <View style={[styles.previewFrame, { borderColor: theme.colors.outlineVariant || theme.colors.outline }]}>
        {previewPdf ? (
          <PdfPreview base64={previewPdf} />
        ) : (
          <View style={styles.previewLoading}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </View>
      <Text style={[styles.previewHint, { color: theme.colors.onSurfaceVariant }]}>This is the actual PDF your customer will receive.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewFrame: { aspectRatio: A4_RATIO, backgroundColor: '#ffffff', borderRadius: radii.lg, borderWidth: 1, marginBottom: 6, overflow: 'hidden' },
  previewHint: { fontSize: 12, marginBottom: 18, textAlign: 'center' },
  previewLoading: { alignItems: 'center', flex: 1, justifyContent: 'center' }
});