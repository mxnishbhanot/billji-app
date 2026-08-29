import { createElement } from 'react';
import { Platform, StyleSheet } from 'react-native';

// The preview is the real PDF the backend will send the customer, so there is one
// layout to maintain rather than an HTML look-alike kept in sync by hand.
//
// react-native-pdf is native-only and its blob dependency touches NativeModules at
// import time, so it is required lazily and never reaches the web bundle. On web the
// browser's own PDF viewer handles a data: URI in an iframe.
const Pdf = Platform.OS === 'web' ? null : require('react-native-pdf').default;

// A4 at 96dpi: the aspect ratio the preview frame is drawn at, so the page fills it
// with no letterboxing.
export const A4_RATIO = 794 / 1123;

export function PdfPreview({ base64 }: { base64: string }) {
  const uri = `data:application/pdf;base64,${base64}`;

  if (Platform.OS === 'web') {
    return createElement('iframe', {
      // view=FitH fits the page to the frame width; the toolbar would crowd a preview
      // this small and the user already has download/share elsewhere on the screen.
      src: `${uri}#toolbar=0&navpanes=0&view=FitH`,
      title: 'Invoice preview',
      style: { border: 'none', backgroundColor: '#ffffff', width: '100%', height: '100%' }
    });
  }

  return (
    <Pdf
      source={{ uri, cache: false }}
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
