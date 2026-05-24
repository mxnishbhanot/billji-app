import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiBaseUrl } from '@/api/client';

const safeName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'invoice';

const normalizePdfUrl = (url: string) => {
  try {
    const pdfUrl = new URL(url);
    if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(pdfUrl.hostname)) return url;

    const apiUrl = new URL(apiBaseUrl);
    return `${apiUrl.origin}${pdfUrl.pathname}${pdfUrl.search}${pdfUrl.hash}`;
  } catch {
    return url;
  }
};

export const openOrSharePdf = async (url: string, invoiceNumber: string) => {
  const pdfUrl = normalizePdfUrl(url);

  try {
    const destination = `${FileSystem.cacheDirectory}${safeName(invoiceNumber)}.pdf`;
    const result = await FileSystem.downloadAsync(pdfUrl, destination);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: invoiceNumber });
      return;
    }
  } catch {
    // Fall back to the public PDF link if local download/share is unavailable.
  }
  await Linking.openURL(pdfUrl);
};
