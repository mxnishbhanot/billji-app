import { downloadAndShare, safeFileName } from './download';

export const openOrSharePdf = (url: string, invoiceNumber: string) =>
  downloadAndShare(url, `${safeFileName(invoiceNumber, 'invoice')}.pdf`, {
    mimeType: 'application/pdf',
    uti: 'com.adobe.pdf',
    dialogTitle: invoiceNumber
  });
