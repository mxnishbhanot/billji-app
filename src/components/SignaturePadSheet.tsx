import { Modal, Pressable, StyleSheet, View } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appColors, fontStyles, radii } from '@/theme/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (dataUri: string) => void;
};

// Injected CSS for the underlying signature pad: full-bleed body, branded footer buttons.
const WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { margin: 8px 0; }
  .m-signature-pad--footer .button { border-radius: 12px; height: 46px; font-size: 15px; font-weight: 600; }
  .m-signature-pad--footer .button.clear { background-color: #f1f5f9; color: #475569; }
  .m-signature-pad--footer .button.save { background-color: #4338CA; color: #fff; }
  body, html { background: #fff; }
`;

// Draw-a-signature modal backed by react-native-signature-canvas (WebView on device).
// Confirm/Save fires onOK with a PNG data URI, which the signatureUrl pipeline consumes
// exactly like an uploaded logo; Clear is handled internally by the pad.
export function SignaturePadSheet({ visible, onClose, onSave }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const insets = useSafeAreaInsets();

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
                onOK={onSave}
                onEmpty={onClose}
                webStyle={WEB_STYLE}
                descriptionText="Sign above"
                clearText="Clear"
                confirmText="Save"
                penColor="#0f172a"
                backgroundColor="#ffffff"
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(8,9,18,0.55)', flex: 1, justifyContent: 'flex-end' },
  cancel: { ...fontStyles.semiBold, fontSize: 15 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  padFrame: { backgroundColor: '#fff', borderRadius: radii.md, flex: 1, marginBottom: 12, marginHorizontal: 12, overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1, marginTop: 64 },
  title: { ...fontStyles.bold, fontSize: 18 }
});
