import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const safeName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'invoice';

export const openOrSharePdf = async (url: string, invoiceNumber: string) => {
  try {
    const destination = `${FileSystem.cacheDirectory}${safeName(invoiceNumber)}.pdf`;
    const result = await FileSystem.downloadAsync(url, destination);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: invoiceNumber });
      return;
    }
  } catch {
    // Fall back to the public PDF link if local download/share is unavailable.
  }
  await Linking.openURL(url);
};
