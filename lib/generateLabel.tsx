// lib/generateLabel.ts
import { Document, Page, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

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

// ==================== NEW: GS1 FORMAT HELPERS ====================

/**
 * Build GS1-compliant data string from label data
 * Format: (AI)Value(AI)Value...
 */
function buildGS1String(data: LabelData): string {
  const parts: string[] = [];
  
  // (01) GTIN - Global Trade Item Number (14 digits, pad with leading zeros)
  if (data.gtin) {
    const paddedGtin = data.gtin.padStart(14, '0');
    parts.push(`(01)${paddedGtin}`);
  }
  
  // (17) Expiration Date - YYMMDD format
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-');
    const yy = yyyy.slice(-2);
    parts.push(`(17)${yy}${mm}${dd}`);
  }
  
  // (10) Batch/Lot Number
  if (data.batchNo) {
    parts.push(`(10)${data.batchNo}`);
  }
  
  // (21) Serial Number (optional)
  if (data.serial) {
    parts.push(`(21)${data.serial}`);
  }
  
  // (11) Production/Manufacturing Date - YYMMDD format
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-');
    const yy = yyyy.slice(-2);
    parts.push(`(11)${yy}${mm}${dd}`);
  }
  
  return parts.join('');
}

/**
 * Build RxTrace verification URL
 */
function buildRxTraceURL(data: LabelData): string {
  const params = new URLSearchParams();
  
  if (data.gtin) params.append('gtin', data.gtin);
  if (data.serial) params.append('sn', data.serial);
  if (data.batchNo) params.append('lot', data.batchNo);
  
  // Convert DD-MM-YYYY to YYYY-MM-DD
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-');
    params.append('exp', `${yyyy}-${mm}-${dd}`);
  }
  
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-');
    params.append('mfg', `${yyyy}-${mm}-${dd}`);
  }
  
  return `https://rxtrace.in/verify?${params.toString()}`;
}

// ==================== UPDATED: BARCODE GENERATION ====================

/**
 * Generate barcode image with GS1 support
 * @param data - Label data
 * @param type - Barcode type
 * @param useGS1Format - If true, use GS1 format; if false, use plain GTIN
 * @param isRxTraceProduct - If true, generate RxTrace URL instead
 */
async function generateBarcodeImage(
  data: LabelData, 
  type: 'QR' | 'CODE128' | 'DATAMATRIX',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<string> {
  try {
    // Determine what data to encode
    let barcodeData: string;
    
    if (isRxTraceProduct) {
      barcodeData = buildRxTraceURL(data);
      console.log('Generating RxTrace verification URL:', barcodeData);
    } else if (useGS1Format) {
      barcodeData = buildGS1String(data);
      console.log('Generating GS1 format:', barcodeData);
    } else {
      barcodeData = data.gtin;
      console.log('Generating plain GTIN:', barcodeData);
    }

    if (type === 'QR') {
      const dataUrl = await QRCode.toDataURL(barcodeData, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'H'
      });
      console.log('QR code generated successfully');
      return dataUrl;

    } else if (type === 'CODE128') {
      // Generate CODE128 barcode using jsbarcode
      console.log('Generating CODE128 barcode');
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeData, {
        format: 'CODE128',
        width: 2,
        height: 80,
        displayValue: false,
        margin: 5
      });
      const dataUrl = canvas.toDataURL('image/png');
      console.log('CODE128 barcode generated successfully');
      return dataUrl;

    } else if (type === 'DATAMATRIX') {
      // For DATAMATRIX - use QR with minimal margin (similar appearance)
      console.log('Generating DATAMATRIX code (using QR with compact layout)');
      const dataUrl = await QRCode.toDataURL(barcodeData, {
        width: 300,
        margin: 0,
        errorCorrectionLevel: 'L',
        type: 'image/png'
      });
      console.log('DATAMATRIX code generated successfully');
      return dataUrl;
    }

    throw new Error('Unknown barcode type');
  } catch (error) {
    console.error('Error generating barcode image:', error);
    throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== UPDATED: PDF GENERATION ====================

/**
 * Generate PDF with single label
 * @param data - Label data
 * @param codeType - Barcode type
 * @param useGS1Format - Use GS1 format (default: true)
 * @param isRxTraceProduct - Generate RxTrace URL (default: false)
 */
export async function generatePDF(
  data: LabelData, 
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  try {
    console.log('generatePDF called with:', { data, codeType, useGS1Format, isRxTraceProduct });

    const barcodeUrl = await generateBarcodeImage(data, codeType, useGS1Format, isRxTraceProduct);
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

/**
 * Generate PDF with multiple codes on one page (for bulk printing)
 * @param labels - Array of label data
 * @param codeType - Barcode type
 * @param useGS1Format - Use GS1 format (default: true)
 * @param isRxTraceProduct - Generate RxTrace URLs (default: false)
 */
export async function generateMultiCodePDF(
  labels: LabelData[], 
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  try {
    console.log('generateMultiCodePDF called with', labels.length, 'labels, type:', codeType);

    // Generate all barcode images first
    const barcodeUrls: string[] = [];
    for (const label of labels) {
      const url = await generateBarcodeImage(label, codeType, useGS1Format, isRxTraceProduct);
      barcodeUrls.push(url);
    }

    console.log('All barcodes generated, creating PDF with', barcodeUrls.length, 'codes');

    // A4 page can fit 10x10 = 100 codes (80x80pts each with 2pt margin)
    const codesPerPage = 100;

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

// ==================== NEW: SAVE & SHARE FUNCTIONS ====================

/**
 * Save PDF to device
 * @param blob - PDF blob
 * @param filename - File name (without extension)
 */
export async function savePDF(blob: Blob, filename: string = 'rxtrace-label'): Promise<void> {
  try {
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.pdf`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('PDF saved successfully:', filename);
  } catch (error) {
    console.error('Error saving PDF:', error);
    throw new Error(`Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Share PDF using Web Share API (mobile friendly)
 * @param blob - PDF blob
 * @param filename - File name (without extension)
 * @param title - Share title
 */
export async function sharePDF(
  blob: Blob, 
  filename: string = 'rxtrace-label',
  title: string = 'RxTrace Label'
): Promise<void> {
  try {
    // Check if Web Share API is supported
    if (!navigator.share) {
      throw new Error('Web Share API not supported. Using download instead.');
    }

    // Create File from Blob
    const file = new File([blob], `${filename}.pdf`, { type: 'application/pdf' });

    // Share
    await navigator.share({
      title: title,
      text: 'Generated RxTrace Label',
      files: [file]
    });

    console.log('PDF shared successfully');
  } catch (error) {
    console.error('Error sharing PDF:', error);
    
    // Fallback to save if share fails
    console.log('Falling back to save...');
    await savePDF(blob, filename);
  }
}

/**
 * Save barcode as PNG image
 * @param data - Label data
 * @param type - Barcode type
 * @param filename - File name (without extension)
 * @param useGS1Format - Use GS1 format
 * @param isRxTraceProduct - Generate RxTrace URL
 */
export async function saveAsImage(
  data: LabelData,
  type: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  filename: string = 'rxtrace-code',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<void> {
  try {
    const dataUrl = await generateBarcodeImage(data, type, useGS1Format, isRxTraceProduct);
    
    // Create download link
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.png`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    
    console.log('Image saved successfully:', filename);
  } catch (error) {
    console.error('Error saving image:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Print PDF directly
 * @param blob - PDF blob
 */
export async function printPDF(blob: Blob): Promise<void> {
  try {
    const url = URL.createObjectURL(blob);
    
    // Open in new window and print
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      throw new Error('Failed to open print window');
    }
    
    // Cleanup after 1 second
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    console.log('Print dialog opened');
  } catch (error) {
    console.error('Error printing PDF:', error);
    throw new Error(`Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== UPDATED: ZPL & EPL WITH GS1 ====================

/**
 * Generate ZPL (Zebra) with GS1 format
 */
export function generateZPL(
  data: LabelData, 
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  // Determine barcode data
  let barcodeData: string;
  if (isRxTraceProduct) {
    barcodeData = buildRxTraceURL(data);
  } else if (useGS1Format) {
    barcodeData = buildGS1String(data);
  } else {
    barcodeData = data.gtin;
  }

  const codeZpl = codeType === 'QR'
    ? `^FO80,140^BQN,2,5^FDQA,${barcodeData}^FS`
    : codeType === 'CODE128'
    ? `^FO50,150^BY3^BCN,100,Y,N,N^FD${barcodeData}^FS`
    : `^FO80,150^BXN,8,200^FD${barcodeData}^FS`;

  return `^XA
^CF0,30
^FO50,20^FD${data.companyName}^FS
^FO50,60^FD${data.productName}^FS
^FO50,100^FDBatch: ${data.batchNo} Mfg: ${data.mfgDate} Exp: ${data.expiryDate}^FS
^FO50,130^FDMRP: Rs.${data.mrp}^FS
${codeZpl}
^FO80,420^FDScan to Verify - RxTrace India^FS
^XZ`;
}

/**
 * Generate EPL (Eltron/Zebra) with GS1 format
 */
export function generateEPL(
  data: LabelData,
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  // Determine barcode data
  let barcodeData: string;
  if (isRxTraceProduct) {
    barcodeData = buildRxTraceURL(data);
  } else if (useGS1Format) {
    barcodeData = buildGS1String(data);
  } else {
    barcodeData = data.gtin;
  }

  return `N
A50,20,0,4,1,1,N,"${data.companyName}"
A50,70,0,3,1,1,N,"${data.productName}"
A50,110,0,2,1,1,N,"Batch:${data.batchNo} Mfg:${data.mfgDate} Exp:${data.expiryDate}"
A50,140,0,3,1,1,N,"MRP:Rs.${data.mrp}"
Q800,24
B100,200,0,QR,7,7,M2,L,"${barcodeData}"
A100,500,0,2,1,1,N,"RxTrace ${isRxTraceProduct ? 'Verified' : 'GS1 Format'}"
P1
`;
}

// ==================== HELPER EXPORTS ====================

/**
 * Export helper functions for external use
 */
export const helpers = {
  buildGS1String,
  buildRxTraceURL,
  savePDF,
  sharePDF,
  saveAsImage,
  printPDF
};
