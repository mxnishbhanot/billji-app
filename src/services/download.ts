import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiBaseUrl } from '@/api/client';

export const safeFileName = (value: string, fallback: string) =>
  value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || fallback;

// A dev server hands out localhost URLs, which mean nothing on a device or emulator.
const normalizeUrl = (url: string) => {
  try {
    const target = new URL(url);
    if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(target.hostname)) return url;

    const apiUrl = new URL(apiBaseUrl);
    return `${apiUrl.origin}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return url;
  }
};

/**
 * Downloads a file to the cache directory and opens the OS share sheet on it, falling
 * back to opening the URL in the browser when sharing isn't available (web, or a device
 * with no share target for the type).
 *
 * Shared by invoice PDFs and data exports, so the localhost rewrite and the fallback
 * exist in one place.
 */
export const downloadAndShare = async (
  url: string,
  fileName: string,
  { mimeType, uti, dialogTitle }: { mimeType: string; uti: string; dialogTitle?: string }
) => {
  const sourceUrl = normalizeUrl(url);

  try {
    const destination = `${FileSystem.cacheDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(sourceUrl, destination);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType, UTI: uti, dialogTitle: dialogTitle || fileName });
      return;
    }
  } catch {
    // Fall back to the plain link if local download/share is unavailable.
  }
  await Linking.openURL(sourceUrl);
};

export const shareDataExport = (url: string, fileName: string) =>
  downloadAndShare(url, `${safeFileName(fileName.replace(/\.zip$/i, ''), 'billji-export')}.zip`, {
    mimeType: 'application/zip',
    uti: 'public.zip-archive',
    dialogTitle: 'BillJi data export'
  });
