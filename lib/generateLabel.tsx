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
    height: 70,
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export interface LabelData {
  companyName: string;   // from registration form
  productName: string;   // SKU / Product
  batchNo: string;
  mfgDate: string;       // DD-MM-YYYY
  expiryDate: string;    // DD-MM-YYYY
  mrp: string;           // e.g. "120.00"
  gtin: string;          // GTIN-14 or unique identifier
  serial?: string;
}

// ==================== GTIN HELPERS ====================

/** Calculate GS1 mod-10 check digit for GTIN body (without check digit) */
export function calcGs1CheckDigit(body: string): string {
  const digits = body.replace(/\D/g, '').split('').map(Number).reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
}

/** Build a valid GTIN-14 from up to 13 digits (no check digit yet) */
export function makeGtin14(body: string): string {
  const clean = body.replace(/\D/g, '');
  const withoutCheck = clean.padStart(13, '0');
  const check = calcGs1CheckDigit(withoutCheck);
  return withoutCheck + check;
}

// ==================== GS1 FORMAT HELPERS ====================

/**
 * Build GS1-compliant data string from label data.
 *
 * AIs used:
 * - (01) GTIN (14 digits)
 * - (17) Expiration Date (YYMMDD)
 * - (11) MFG date (YYMMDD)
 * - (10) Batch/Lot (variable, GS-terminated)
 * - (91) MRP (company-internal, variable, GS-terminated)
 * - (92) SKU / Product name (company-internal, GS-terminated)
 * - (93) Company name (company-internal, GS-terminated)
 * - (21) Serial (optional, GS-terminated)
 *
 * forBarcode = true  → raw AIs (no parentheses) + GS separators
 * forBarcode = false → human-readable with parentheses
 */
function buildGS1String(data: LabelData, forBarcode: boolean = false): string {
  const GS = String.fromCharCode(29);
  const parts: string[] = [];

  // (01) GTIN – 14 digits
  if (data.gtin) {
    const paddedGtin = data.gtin.replace(/\D/g, '').padStart(14, '0');
    if (forBarcode) {
      parts.push(`01${paddedGtin}`);
    } else {
      parts.push(`(01)${paddedGtin}`);
    }
  }

  // (17) Expiration Date – YYMMDD
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-'); // DD-MM-YYYY
    if (dd && mm && yyyy) {
      const yy = yyyy.slice(-2);
      const yymmdd = `${yy}${mm}${dd}`;
      if (forBarcode) {
        parts.push(`17${yymmdd}`);
      } else {
        parts.push(`(17)${yymmdd}`);
      }
    }
  }

  // (11) MFG Date – YYMMDD
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-'); // DD-MM-YYYY
    if (dd && mm && yyyy) {
      const yy = yyyy.slice(-2);
      const yymmdd = `${yy}${mm}${dd}`;
      if (forBarcode) {
        parts.push(`11${yymmdd}`);
      } else {
        parts.push(`(11)${yymmdd}`);
      }
    }
  }

  // (10) Batch/Lot – variable length
  if (data.batchNo) {
    if (forBarcode) {
      parts.push(`10${data.batchNo}${GS}`);
    } else {
      parts.push(`(10)${data.batchNo}`);
    }
  }

  // (91) MRP – variable length (company-internal)
  if (data.mrp) {
    const mrpClean = String(data.mrp).trim();
    if (forBarcode) {
      parts.push(`91${mrpClean}${GS}`);
    } else {
      parts.push(`(91)${mrpClean}`);
    }
  }

  // (92) SKU / Product Name – variable length (company-internal)
  if (data.productName) {
    if (forBarcode) {
      parts.push(`92${data.productName}${GS}`);
    } else {
      parts.push(`(92)${data.productName}`);
    }
  }

  // (93) Company Name – variable length (company-internal)
  if (data.companyName) {
    if (forBarcode) {
      parts.push(`93${data.companyName}${GS}`);
    } else {
      parts.push(`(93)${data.companyName}`);
    }
  }

  // (21) Serial – optional
  if (data.serial) {
    if (forBarcode) {
      parts.push(`21${data.serial}${GS}`);
    } else {
      parts.push(`(21)${data.serial}`);
    }
  }

  return parts.join('');
}

/** For UI preview: human-readable GS1 string with parentheses */
export function buildGs1DisplayString(data: LabelData): string {
  return buildGS1String(data, false);
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
    if (dd && mm && yyyy) params.append('exp', `${yyyy}-${mm}-${dd}`);
  }
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-');
    if (dd && mm && yyyy) params.append('mfg', `${yyyy}-${mm}-${dd}`);
  }

  return `https://rxtrace.in/verify?${params.toString()}`;
}

// ==================== BARCODE GENERATION ====================

/**
 * Generate barcode image with GS1 support.
 */
async function generateBarcodeImage(
  data: LabelData,
  type: 'QR' | 'CODE128' | 'DATAMATRIX',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<string> {
  try {
    // 1. Decide what data to encode
    let barcodeData: string;

    if (isRxTraceProduct) {
      barcodeData = buildRxTraceURL(data);
    } else if (useGS1Format) {
      // NOTE: SAME GS1 payload for QR / DM / Code128
      barcodeData = buildGS1String(data, true);
    } else {
      barcodeData = data.gtin;
    }

    // 2. QR
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
        let bwipData = barcodeData;
        if (useGS1Format && !isRxTraceProduct) {
          // ^FNC1 tells bwip-js to treat as GS1
          bwipData = '^FNC1' + barcodeData;
        }

        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'gs1-128',
          text: bwipData,
          scale: 4,
          height: 15,
          includetext: false,
        });

        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Error generating GS1-128 with bwip-js, fallback to JsBarcode:', error);

        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: false,
          margin: 5,
        });
        return canvas.toDataURL('image/png');
      }
    }

    // 4. DataMatrix
    if (type === 'DATAMATRIX') {
      try {
        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'datamatrix',
          text: barcodeData,
          scale: 4,
        });
        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('DataMatrix generation failed, attempting fallbacks:', error);
        try {
          const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
            bcid: 'datamatrix',
            text: barcodeData,
          });
          return canvas.toDataURL('image/png');
        } catch (fallbackError) {
          console.error('Simplified DataMatrix also failed, fallback to QR:', fallbackError);
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
              style={is1D ? { width: 160, height: 50 } : { width: 76, height: 76 }}
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

    const codesPerPage = 100;
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
                <View key={idx} style={is1D ? styles.codeContainerBar : styles.codeContainerSquare}>
                  <Image
                    src={url}
                    style={is1D ? { width: 160, height: 50 } : { width: 76, height: 76 }}
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
  buildGs1DisplayString,
  buildRxTraceURL,
  calcGs1CheckDigit,
  makeGtin14,
  savePDF,
  sharePDF,
  saveAsImage,
  printPDF,
};
