import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appColors, fontStyles, radii } from '@/theme/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (dataUri: string) => void;
};

// Injected CSS for the underlying signature pad: full-bleed body, web footer hidden
// (Clear/Save are native buttons below — the WebView footer gets clipped on small screens).
const WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { background: #fff; }
`;

// Draw-a-signature modal backed by react-native-signature-canvas (WebView on device).
// Confirm/Save fires onOK with a PNG data URI, which the signatureUrl pipeline consumes
// exactly like an uploaded logo; Clear is handled internally by the pad.
export function SignaturePadSheet({ visible, onClose, onSave }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const insets = useSafeAreaInsets();
  const padRef = useRef<any>(null);
  const [drew, setDrew] = useState(false);

  // Pad unmounts while hidden, so its strokes are gone next open — keep the flag in sync.
  useEffect(() => { if (visible) setDrew(false); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Draw your signature</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.cancel, { color: theme.colors.error }]}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.padFrame}>
            {visible ? (
              <SignatureScreen
                ref={padRef}
                onOK={onSave}
                onEmpty={onClose}
                onBegin={() => setDrew(true)}
                webStyle={WEB_STYLE}
                penColor="#0f172a"
                backgroundColor="#ffffff"
              />
            ) : null}
          </View>
          <View style={styles.footer}>
            <Button
              mode="outlined"
              icon="eraser"
              style={styles.footerButton}
              contentStyle={styles.footerButtonContent}
              disabled={!drew}
              onPress={() => { padRef.current?.clearSignature(); setDrew(false); }}
            >
              Clear
            </Button>
            <Button
              mode="contained"
              icon="check"
              style={styles.footerButton}
              contentStyle={styles.footerButtonContent}
              disabled={!drew}
              onPress={() => padRef.current?.readSignature()}
            >
              Save
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(8,9,18,0.55)', flex: 1, justifyContent: 'flex-end' },
  cancel: { ...fontStyles.semiBold, fontSize: 15 },
  footer: { flexDirection: 'row', gap: 12, paddingBottom: 12, paddingHorizontal: 12 },
  footerButton: { borderRadius: radii.input, flex: 1 },
  footerButtonContent: { height: 48 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  padFrame: { backgroundColor: '#fff', borderRadius: radii.md, flex: 1, marginBottom: 12, marginHorizontal: 12, overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1, marginTop: 64 },
  title: { ...fontStyles.bold, fontSize: 18 }
});
