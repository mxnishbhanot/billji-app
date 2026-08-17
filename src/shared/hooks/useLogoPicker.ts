import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';

/**
 * Business logo picker shared by Settings and Business Profile.
 * Native gets the cropper (square, circle overlay); web falls back to the plain picker.
 * Hands back a data URI so the caller can drop it straight into the form.
 */
export function useLogoPicker(onPicked: (dataUri: string) => void) {
  const { showDialog } = useAppDialog();

  const pickWeb = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog({ title: 'Permission required', message: 'Photo library access is required to choose a business logo.', tone: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.95, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onPicked(asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri);
  }, [onPicked, showDialog]);

  return useCallback(async () => {
    // Native crop UI (zoom / pan / rotate) is unavailable on web — fall back to the plain picker there.
    if (Platform.OS === 'web') {
      await pickWeb();
      return;
    }

    // Lazy require: the crop picker registers a TurboModule at import time, which crashes
    // on dev clients built before the library was added. Fall back to the plain picker then.
    let cropPicker: typeof import('react-native-image-crop-picker').default;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cropPicker = require('react-native-image-crop-picker').default;
    } catch {
      await pickWeb();
      return;
    }

    try {
      const image = await cropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        width: 1024,
        height: 1024,
        cropperCircleOverlay: true,
        // Lock rotation while scaling — two-finger pinch was accidentally rotating the image.
        // Rotation stays available via the rotate controls (cropperRotateButtonsHidden: false).
        enableRotationGesture: false,
        cropperRotateButtonsHidden: false,
        cropperToolbarTitle: 'Adjust logo',
        cropperActiveWidgetColor: '#D95F18',
        cropperStatusBarColor: '#9B4000',
        cropperToolbarColor: '#9B4000',
        cropperToolbarWidgetColor: '#FFFFFF',
        compressImageQuality: 0.95,
        includeBase64: true
      });
      if (image.data) onPicked(`data:${image.mime};base64,${image.data}`);
    } catch (error) {
      // User cancelled the picker/cropper — not an error.
      if ((error as { code?: string })?.code === 'E_PICKER_CANCELLED') return;
      showDialog({ title: 'Could not pick image', message: apiErrorMessage(error), tone: 'error' });
    }
  }, [onPicked, pickWeb, showDialog]);
}
