// lib/generateLabel.ts
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';

// Styles without custom font - using default Helvetica which is built-in
const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 16, marginBottom: 8, textAlign: 'center', fontWeight: 'bold' },
  text: { fontSize: 11, marginBottom: 4 },
  code: { marginVertical: 15, alignItems: 'center' },
  footer: { fontSize: 9, textAlign: 'center', marginTop: 20, color: '#666' }
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
      // Use qrcode library for QR codes (works in browser)
      const dataUrl = await QRCode.toDataURL(gtin, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: 'H'
      });
      console.log('QR code generated successfully');
      return dataUrl;
    } else if (type === 'CODE128') {
      // For CODE128, fallback to QR for now
      console.log('CODE128 fallback to QR');
      const dataUrl = await QRCode.toDataURL(gtin, { width: 200 });
      return dataUrl;
    } else {
      // For DATAMATRIX, fallback to QR for now
      console.log('DATAMATRIX fallback to QR');
      const dataUrl = await QRCode.toDataURL(gtin, { width: 200 });
      return dataUrl;
    }
  } catch (error) {
    console.error('Error generating barcode image:', error);
    throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate PDF
export async function generatePDF(data: LabelData, codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR') {
  try {
    console.log('generatePDF called with:', { data, codeType });
    
    const barcodeUrl = await generateBarcodeImage(data.gtin, codeType);
    console.log('Barcode URL generated, creating PDF document...');

    const Doc = () => (
      <Document>
        <Page size={[283, 425]} style={styles.page}> {/* ~3x4.5 inch */}
          <Text style={styles.title}>{data.companyName}</Text>
          <Text style={styles.text}>Product: {data.productName}</Text>
          <Text style={styles.text}>Batch: {data.batchNo}</Text>
          <Text style={styles.text}>Mfg: {data.mfgDate} | Exp: {data.expiryDate}</Text>
          <Text style={styles.text}>MRP: ₹{data.mrp}</Text>
          <View style={styles.code}>
            <Image src={barcodeUrl} style={{ width: 200, height: 200 }} />
          </View>
          <Text style={styles.footer}>Verified by RxTrace India • www.rxtrace.in</Text>
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