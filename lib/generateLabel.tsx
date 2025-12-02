// lib/generateLabel.ts
import { Document, Page, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import bwipjs from 'bwip-js';

// Styles for compact label (barcode-only layout)
const styles = StyleSheet.create({
  page: {
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },

  // For QR / DataMatrix (square codes)
  codeContainerSquare: {
    width: 80,   // ~28mm
    height: 80,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // For 1D barcodes (Code128 / GS1-128)
  codeContainerBar: {
    width: 180,  // wider for proper bar width
    height: 70,  // taller for scanner
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export interface LabelData {
  companyName: string;
  productName: string;
  batchNo: string;
  mfgDate: string;     // DD-MM-YYYY
  expiryDate: string;  // DD-MM-YYYY
  mrp: string;
  gtin: string;        // GTIN-14 or unique identifier
  serial?: string;
}

// ==================== GS1 FORMAT HELPERS ====================

/**
 * Build GS1-compliant data string from label data.
 *
 * Uses AIs:
 * - (01) GTIN (14 digits)
 * - (17) Expiration Date (YYMMDD)
 * - (10) Batch/Lot (variable, GS-terminated)
 * - (11) MFG date (YYMMDD)
 * - (21) Serial (optional, GS-terminated)
 *
 * For barcode encoding:
 * - `forBarcode = true` → raw AIs without parentheses + GS separators
 * - `forBarcode = false` → human-readable "(01)...(17)..."
 */
function buildGS1String(data: LabelData, forBarcode: boolean = false): string {
  const GS = String.fromCharCode(29);
  const parts: string[] = [];

  // (01) GTIN - 14 digits, pad with leading zeros
  if (data.gtin) {
    const paddedGtin = data.gtin.padStart(14, '0');
    if (forBarcode) {
      parts.push(`01${paddedGtin}`);
    } else {
      parts.push(`(01)${paddedGtin}`);
    }
  }

  // (17) Expiration Date - YYMMDD
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-'); // DD-MM-YYYY
    if (dd && mm && yyyy) {
      const yy = yyyy.slice(-2);
      if (forBarcode) {
        parts.push(`17${yy}${mm}${dd}`);
      } else {
        parts.push(`(17)${yy}${mm}${dd}`);
      }
    }
  }

  // (10) Batch/Lot - variable length (GS after value in barcode mode)
  if (data.batchNo) {
    if (forBarcode) {
      parts.push(`10${data.batchNo}${GS}`);
    } else {
      parts.push(`(10)${data.batchNo}`);
    }
  }

  // (11) MFG Date - YYMMDD
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-'); // DD-MM-YYYY
    if (dd && mm && yyyy) {
      const yy = yyyy.slice(-2);
      if (forBarcode) {
        parts.push(`11${yy}${mm}${dd}`);
      } else {
        parts.push(`(11)${yy}${mm}${dd}`);
      }
    }
  }

  // (21) Serial (optional, GS for barcode mode if more AIs followed)
  if (data.serial) {
    if (forBarcode) {
      parts.push(`21${data.serial}${GS}`);
    } else {
      parts.push(`(21)${data.serial}`);
    }
  }

  return parts.join('');
}

/**
 * Build RxTrace verification URL.
 * Encodes GTIN / Serial / Lot / Dates as query params.
 */
function buildRxTraceURL(data: LabelData): string {
  const params = new URLSearchParams();

  if (data.gtin) params.append('gtin', data.gtin);
  if (data.serial) params.append('sn', data.serial);
  if (data.batchNo) params.append('lot', data.batchNo);

  // Convert DD-MM-YYYY → YYYY-MM-DD
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-');
    if (dd && mm && yyyy) {
      params.append('exp', `${yyyy}-${mm}-${dd}`);
    }
  }
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-');
    if (dd && mm && yyyy) {
      params.append('mfg', `${yyyy}-${mm}-${dd}`);
    }
  }

  return `https://rxtrace.in/verify?${params.toString()}`;
}

// ==================== BARCODE GENERATION ====================

/**
 * Generate barcode image with GS1 support.
 * - type: 'QR' | 'CODE128' | 'DATAMATRIX'
 * - useGS1Format: encode GS1 AIs vs plain GTIN
 * - isRxTraceProduct: encode RxTrace URL instead of GS1 AIs
 */
async function generateBarcodeImage(
  data: LabelData,
  type: 'QR' | 'CODE128' | 'DATAMATRIX',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<string> {
  try {
    // 1. Decide payload to encode
    let barcodeData: string;

    if (isRxTraceProduct) {
      barcodeData = buildRxTraceURL(data);
    } else if (useGS1Format) {
      barcodeData = buildGS1String(data, true); // for barcode encoding
    } else {
      barcodeData = data.gtin;
    }

    // 2. QR code
    if (type === 'QR') {
      const dataUrl = await QRCode.toDataURL(barcodeData, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'H',
      });
      return dataUrl;
    }

    // 3. 1D Code128 / GS1-128
    if (type === 'CODE128') {
      try {
        // Use bwip-js for GS1-128 (1D) with FNC1 prefix
        let bwipData = barcodeData;
        if (useGS1Format && !isRxTraceProduct) {
          // ^FNC1 indicates GS1-mode to bwip-js
          bwipData = '^FNC1' + barcodeData;
        }

        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'gs1-128',
          text: bwipData,
          scale: 4,        // thicker bars than before
          height: 15,      // taller bars
          includetext: false,
        });

        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl;
      } catch (error) {
        console.error('Error generating GS1-128 with bwip-js, fallback to JsBarcode:', error);

        // Fallback to JsBarcode plain Code128
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: false,
          margin: 5,
        });
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl;
      }
    }

    // 4. DataMatrix (2D)
    if (type === 'DATAMATRIX') {
      try {
        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'datamatrix',
          text: barcodeData,
          scale: 4,
        });
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl;
      } catch (error) {
        console.error('DataMatrix generation failed, attempting fallbacks:', error);

        // Fallback 1: simpler options
        try {
          const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
            bcid: 'datamatrix',
            text: barcodeData,
          });
          const dataUrl = canvas.toDataURL('image/png');
          return dataUrl;
        } catch (fallbackError) {
          console.error('Simplified DataMatrix also failed, fallback to QR:', fallbackError);

          // Final fallback: QR
          const dataUrl = await QRCode.toDataURL(barcodeData, {
            width: 300,
            margin: 1,
            errorCorrectionLevel: 'H',
          });
          return dataUrl;
        }
      }
    }

    throw new Error('Unknown barcode type');
  } catch (error) {
    console.error('Error generating barcode image:', error);
    throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== PDF GENERATION ====================

/**
 * Generate PDF with a single code (barcode-only label).
 */
export async function generatePDF(
  data: LabelData,
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  try {
    const barcodeUrl = await generateBarcodeImage(data, codeType, useGS1Format, isRxTraceProduct);
    const is1D = codeType === 'CODE128';

    const Doc = () => (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={is1D ? styles.codeContainerBar : styles.codeContainerSquare}>
            <Image
              src={barcodeUrl}
              style={
                is1D
                  ? { width: 160, height: 50 }  // wide, tall barcode
                  : { width: 76, height: 76 }   // square 2D codes
              }
            />
          </View>
        </Page>
      </Document>
    );

    const blob = await pdf(<Doc />).toBlob();
    return blob;
  } catch (error) {
    console.error('Error in generatePDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate PDF with multiple codes on pages (for bulk printing).
 */
export async function generateMultiCodePDF(
  labels: LabelData[],
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  try {
    const barcodeUrls: string[] = [];
    for (const label of labels) {
      const url = await generateBarcodeImage(label, codeType, useGS1Format, isRxTraceProduct);
      barcodeUrls.push(url);
    }

    const codesPerPage = 100; // for 2D; for 1D the actual number per page will be lower visually
    const is1D = codeType === 'CODE128';

    const Doc = () => (
      <Document>
        {Array.from({ length: Math.ceil(barcodeUrls.length / codesPerPage) }).map((_, pageIndex) => {
          const startIdx = pageIndex * codesPerPage;
          const endIdx = Math.min(startIdx + codesPerPage, barcodeUrls.length);
          const pageCodes = barcodeUrls.slice(startIdx, endIdx);

          return (
            <Page key={pageIndex} size="A4" style={styles.page}>
              {pageCodes.map((url, idx) => (
                <View
                  key={idx}
                  style={is1D ? styles.codeContainerBar : styles.codeContainerSquare}
                >
                  <Image
                    src={url}
                    style={
                      is1D
                        ? { width: 160, height: 50 }
                        : { width: 76, height: 76 }
                    }
                  />
                </View>
              ))}
            </Page>
          );
        })}
      </Document>
    );

    const blob = await pdf(<Doc />).toBlob();
    return blob;
  } catch (error) {
    console.error('Error in generateMultiCodePDF:', error);
    throw new Error(`Failed to generate multi-code PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== SAVE / SHARE / PRINT HELPERS ====================

export async function savePDF(blob: Blob, filename: string = 'rxtrace-label'): Promise<void> {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error saving PDF:', error);
    throw new Error(`Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function sharePDF(
  blob: Blob,
  filename: string = 'rxtrace-label',
  title: string = 'RxTrace Label'
): Promise<void> {
  try {
    if (!navigator.share) {
      throw new Error('Web Share API not supported. Using download instead.');
    }

    const file = new File([blob], `${filename}.pdf`, { type: 'application/pdf' });

    await navigator.share({
      title,
      text: 'Generated RxTrace Label',
      files: [file],
    });
  } catch (error) {
    console.error('Error sharing PDF, falling back to save:', error);
    await savePDF(blob, filename);
  }
}

export async function saveAsImage(
  data: LabelData,
  type: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  filename: string = 'rxtrace-code',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<void> {
  try {
    const dataUrl = await generateBarcodeImage(data, type, useGS1Format, isRxTraceProduct);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error saving image:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function printPDF(blob: Blob): Promise<void> {
  try {
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');

    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      throw new Error('Failed to open print window');
    }

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Error printing PDF:', error);
    throw new Error(`Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== ZPL & EPL GENERATION ====================

export function generateZPL(
  data: LabelData,
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  let barcodeData: string;

  if (isRxTraceProduct) {
    barcodeData = buildRxTraceURL(data);
  } else if (useGS1Format) {
    barcodeData = buildGS1String(data, true);
  } else {
    barcodeData = data.gtin;
  }

  let code128Data = barcodeData;
  if (codeType === 'CODE128' && useGS1Format && !isRxTraceProduct) {
    // In ZPL, >8 is FNC1 for GS1-128
    code128Data = '>8' + barcodeData;
  }

  const codeZpl =
    codeType === 'QR'
      ? `^FO80,140^BQN,2,5^FDQA,${barcodeData}^FS`
      : codeType === 'CODE128'
      ? `^FO50,150^BY3^BCN,100,Y,N,N^FD${code128Data}^FS`
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

export function generateEPL(
  data: LabelData,
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  let barcodeData: string;

  if (isRxTraceProduct) {
    barcodeData = buildRxTraceURL(data);
  } else if (useGS1Format) {
    barcodeData = buildGS1String(data, true);
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

export const helpers = {
  buildGS1String,
  buildRxTraceURL,
  savePDF,
  sharePDF,
  saveAsImage,
  printPDF,
};

