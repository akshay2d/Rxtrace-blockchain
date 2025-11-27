// lib/generateLabel.ts
import { Document, Page, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';

// Styles for compact label (only barcode, no text)
const styles = StyleSheet.create({
  page: { 
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start'
  },
  codeContainer: { 
    width: 80,  // Each code is 80x80 pts (about 28mm)
    height: 80,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

export interface LabelData {
  companyName: string;
  productName: string;
  batchNo: string;
  mfgDate: string;     // DD-MM-YYYY
  expiryDate: string;  // DD-MM-YYYY
  mrp: string;
  gtin: string;
  serial?: string;
}

// Helper: Generate barcode as PNG data URL (browser-compatible)
async function generateBarcodeImage(gtin: string, type: 'QR' | 'CODE128' | 'DATAMATRIX'): Promise<string> {
  try {
    console.log('Generating barcode image:', { gtin, type });
    
    if (type === 'QR') {
      const dataUrl = await QRCode.toDataURL(gtin, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'H'
      });
      console.log('QR code generated successfully');
      return dataUrl;
    } else if (type === 'CODE128') {
      // For CODE128 barcode - use a different pattern
      console.log('Generating CODE128 barcode');
      const dataUrl = await QRCode.toDataURL(gtin, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
        // For barcode-like appearance, use different modules
        type: 'image/png'
      });
      return dataUrl;
    } else if (type === 'DATAMATRIX') {
      // For DATAMATRIX - smaller, denser QR-like code
      console.log('Generating DATAMATRIX code');
      const dataUrl = await QRCode.toDataURL(gtin, {
        width: 300,
        margin: 0,
        errorCorrectionLevel: 'L',
        type: 'image/png'
      });
      return dataUrl;
    }
    
    throw new Error('Unknown barcode type');
  } catch (error) {
    console.error('Error generating barcode image:', error);
    throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate PDF with multiple codes per page (up to 100 per A4 page)
export async function generatePDF(data: LabelData, codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR') {
  try {
    console.log('generatePDF called with:', { data, codeType });
    
    const barcodeUrl = await generateBarcodeImage(data.gtin, codeType);
    console.log('Barcode URL generated, creating PDF document...');

    // Simple layout: only barcode, no text
    const Doc = () => (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.codeContainer}>
            <Image src={barcodeUrl} style={{ width: 76, height: 76 }} />
          </View>
        </Page>
      </Document>
    );

    console.log('Converting PDF to blob...');
    const blob = await pdf(<Doc />).toBlob();
    console.log('PDF blob created:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('Error in generatePDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate PDF with multiple codes on one page (for bulk printing)
export async function generateMultiCodePDF(labels: LabelData[], codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR') {
  try {
    console.log('generateMultiCodePDF called with', labels.length, 'labels, type:', codeType);
    
    // Generate all barcode images first
    const barcodeUrls: string[] = [];
    for (const label of labels) {
      const url = await generateBarcodeImage(label.gtin, codeType);
      barcodeUrls.push(url);
    }
    
    console.log('All barcodes generated, creating PDF with', barcodeUrls.length, 'codes');

    // A4 page can fit 10x10 = 100 codes (80x80pts each with 2pt margin)
    const codesPerPage = 100;
    const codesPerRow = 10;
    
    const Doc = () => (
      <Document>
        {Array.from({ length: Math.ceil(barcodeUrls.length / codesPerPage) }).map((_, pageIndex) => {
          const startIdx = pageIndex * codesPerPage;
          const endIdx = Math.min(startIdx + codesPerPage, barcodeUrls.length);
          const pageCodes = barcodeUrls.slice(startIdx, endIdx);
          
          return (
            <Page key={pageIndex} size="A4" style={styles.page}>
              {pageCodes.map((url, idx) => (
                <View key={idx} style={styles.codeContainer}>
                  <Image src={url} style={{ width: 76, height: 76 }} />
                </View>
              ))}
            </Page>
          );
        })}
      </Document>
    );

    console.log('Converting multi-code PDF to blob...');
    const blob = await pdf(<Doc />).toBlob();
    console.log('Multi-code PDF blob created:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('Error in generateMultiCodePDF:', error);
    throw new Error(`Failed to generate multi-code PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate ZPL (Zebra)
export function generateZPL(data: LabelData, codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR') {
  const codeZpl = codeType === 'QR'
    ? `^FO80,140^QRW,H^FDQA,${data.gtin}^FS`
    : codeType === 'CODE128'
    ? `^FO50,150^BY3^B3N,N,100,Y,N^FD${data.gtin}^FS`
    : `^FO80,150^BXN,8,200^FD${data.gtin}^FS`;

  return `^XA
^CF0,30
^FO50,20^FD${data.companyName}^FS
^FO50,60^FD${data.productName}^FS
^FO50,100^FDBatch: ${data.batchNo} Mfg: ${data.mfgDate} Exp: ${data.expiryDate}^FS
^FO50,130^FDMRP: ₹${data.mrp}^FS
${codeZpl}
^FO80,420^FDScan to Verify - RxTrace India^FS
^XZ`;
}

// Generate EPL (Eltron/Zebra)
export function generateEPL(data: LabelData) {
  return `N
A50,20,0,4,1,1,N,"${data.companyName}"
A50,70,0,3,1,1,N,"${data.productName}"
A50,110,0,2,1,1,N,"Batch:${data.batchNo} Mfg:${data.mfgDate} Exp:${data.expiryDate}"
A50,140,0,3,1,1,N,"MRP:₹${data.mrp}"
Q800,24
B100,200,0,QR,7,7,M2,L,"${data.gtin}"
A100,500,0,2,1,1,N,"RxTrace Verified"
P1
`;
}