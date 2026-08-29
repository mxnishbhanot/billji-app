import { StyleSheet } from 'react-native';
import Pdf from 'react-native-pdf';

// The preview is the real PDF the backend will send the customer, so there is one
// layout to maintain rather than an HTML look-alike kept in sync by hand.
//
// react-native-pdf is native-only — Metro resolves PdfPreview.web.tsx for web, which
// keeps this import out of that bundle entirely.
export function PdfPreview({ base64 }: { base64: string }) {
  return (
    <Pdf
      source={{ uri: `data:application/pdf;base64,${base64}`, cache: false }}
      style={styles.pdf}
      fitPolicy={0}
      trustAllCerts={false}
      // A preview is disposable: a failed render must not take the screen down with it.
      onError={() => undefined}
    />
  );
}

const styles = StyleSheet.create({
  pdf: { backgroundColor: '#ffffff', flex: 1, width: '100%' }
});
