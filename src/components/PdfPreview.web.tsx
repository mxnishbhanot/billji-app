// Web counterpart of PdfPreview. The browser already ships a PDF viewer, so an iframe
// on a data: URI covers this with nothing installed — react-native-pdf is native-only
// and Metro rejects it in a web bundle.
export function PdfPreview({ base64 }: { base64: string }) {
  return (
    <iframe
      // view=FitH fits the page to the frame width; the toolbar would crowd a preview
      // this small and the user already has download/share elsewhere on the screen.
      src={`data:application/pdf;base64,${base64}#toolbar=0&navpanes=0&view=FitH`}
      title="Invoice preview"
      style={{ border: 'none', backgroundColor: '#ffffff', width: '100%', height: '100%' }}
    />
  );
}
