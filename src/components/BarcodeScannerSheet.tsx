import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

// Retail labels in India are overwhelmingly EAN/UPC; QR and Code128 cover printed
// shelf labels and anything a shop prints itself.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

type Props = {
  visible: boolean;
  title?: string;
  hint?: string;
  onClose: () => void;
  onScanned: (value: string) => void;
};

/**
 * Full-screen camera sheet that reports one scanned code and closes.
 *
 * Manual entry always stays available behind this: the caller keeps its text field, so a
 * denied camera permission or an unreadable label never blocks the task.
 */
export function BarcodeScannerSheet({ visible, title = 'Scan barcode', hint, onClose, onScanned }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [sweep] = useState(() => new Animated.Value(0));
  // A single label fires onBarcodeScanned many times per second; latch so one open sheet
  // yields exactly one result.
  const handled = useRef(false);

  useEffect(() => {
    if (!visible) {
      handled.current = false;
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [visible, sweep]);

  const handleScan = (result: BarcodeScanningResult) => {
    const value = String(result?.data || '').trim();
    if (handled.current || !value) return;
    handled.current = true;
    onScanned(value);
    onClose();
  };

  const canScan = Platform.OS !== 'web' && permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: '#0B0B14', paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close scanner" style={styles.closeBtn}>
            <Feather name="x" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {canScan ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={[styles.frame, { borderColor: alpha('#FFFFFF', 0.9) }]}>
                <Animated.View
                  style={[
                    styles.sweepLine,
                    {
                      backgroundColor: colors.accent,
                      transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }) }]
                    }
                  ]}
                />
              </View>
              <Text style={styles.hint}>{hint || 'Point the camera at the barcode'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.fallback}>
            <Feather name={Platform.OS === 'web' ? 'monitor' : 'camera-off'} size={28} color="#FFFFFF" />
            <Text style={styles.fallbackTitle}>
              {Platform.OS === 'web' ? 'Scanning needs the phone app' : 'Camera access is off'}
            </Text>
            <Text style={styles.fallbackText}>
              {Platform.OS === 'web'
                ? 'Open BillJi on your phone to scan, or type the code in by hand.'
                : 'Allow camera access to scan, or type the code in by hand.'}
            </Text>
            {Platform.OS !== 'web' && !permission?.granted ? (
              <Button mode="contained" onPress={() => void requestPermission()} style={styles.fallbackButton}>
                {permission?.canAskAgain === false ? 'Open settings' : 'Allow camera'}
              </Button>
            ) : null}
            <Button mode="text" textColor="#FFFFFF" onPress={onClose}>
              Type it instead
            </Button>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { flex: 1, overflow: 'hidden' },
  closeBtn: { padding: 8 },
  fallback: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 32 },
  fallbackButton: { borderRadius: radii.input, marginTop: 6 },
  fallbackText: { ...typeScale.caption, color: alpha('#FFFFFF', 0.7), fontSize: 13, textAlign: 'center' },
  fallbackTitle: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 16, marginTop: 6 },
  frame: { borderRadius: radii.lg, borderWidth: 2, height: 160, overflow: 'hidden', width: '78%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  hint: { ...typeScale.caption, color: alpha('#FFFFFF', 0.8), fontSize: 13, marginTop: 18, textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1 },
  sweepLine: { height: 2, width: '100%' },
  title: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 17 }
});
