// lib/generateLabel.ts
import { Document, Page, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import bwipjs from 'bwip-js';

// Styles for compact label (only barcode, no text)
const styles = StyleSheet.create({
  page: {
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  codeContainer: {
    width: 80,  // Each code is 80x80 pts (about 28mm)
    height: 80,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ===================== DATE HELPERS =====================

/**
 * Parse a date string that might be:
 * - DD-MM-YYYY
 * - YYYY-MM-DD
 * - DD/MM/YYYY
 * - YYYY/MM/DD
 * and return { dd, mm, yyyy } or null if invalid.
 */
function parseFlexibleDate(
  input: string | undefined | null
): { dd: string; mm: string; yyyy: string } | null {
  if (!input) return null;

  const value = input.trim();
  if (!value) return null;

  const sep = value.includes('-') ? '-' : value.includes('/') ? '/' : null;
  if (!sep) return null;

  const parts = value.split(sep);
  if (parts.length !== 3) return null;

  let dd = '';
  let mm = '';
  let yyyy = '';

  // YYYY-MM-DD or YYYY/MM/DD
  if (parts[0].length === 4) {
    yyyy = parts[0];
    mm = parts[1];
    dd = parts[2];
  } else if (parts[2].length === 4) {
    // DD-MM-YYYY or DD/MM/YYYY
    dd = parts[0];
    mm = parts[1];
    yyyy = parts[2];
  } else {
    // Fallback: treat last part as year (YY) and expand
    dd = parts[0];
    mm = parts[1];
    const yy = parts[2];
    const fullYear =
      parseInt(yy, 10) < 50 ? 2000 + parseInt(yy, 10) : 1900 + parseInt(yy, 10);
    yyyy = String(fullYear);
  }

  if (!dd || !mm || !yyyy) return null;
  if (dd.length === 1) dd = `0${dd}`;
  if (mm.length === 1) mm = `0${mm}`;

  return { dd, mm, yyyy };
}

/** Convert any supported input date to GS1 YYMMDD. Returns null if invalid. */
function toGs1Date(input: string | undefined | null): string | null {
  const parsed = parseFlexibleDate(input);
  if (!parsed) return null;
  const { dd, mm, yyyy } = parsed;
  const yy = yyyy.slice(-2);
  return `${yy}${mm}${dd}`;
}

// ===================== GTIN HELPERS =====================

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

// ===================== CORE LABEL TYPE =====================

export interface LabelData {
  companyName: string;
  productName: string;  // SKU / trade name
  batchNo: string;
  mfgDate: string;      // any of: DD-MM-YYYY / YYYY-MM-DD / DD/MM/YYYY / YYYY/MM/DD
  expiryDate: string;   // same formats
  mrp: string;
  gtin: string;         // full GTIN-14 (with check digit)
  serial?: string;
}

// ===================== GS1 DATA STRING =====================

const GS = String.fromCharCode(29); // Group Separator

/**
 * Build GS1 string.
 *   forBarcode = false → (01)GTIN(17)...(11)...(10)...(91)...(92)...(93)...(21)...
 *   forBarcode = true  → 01GTIN17YYMMDD11YYMMDD10BATCH<GS>91MRP<GS>92SKU<GS>93COMPANY<GS>21SERIAL<GS>
 *
 * AIs used:
 * - (01) GTIN-14
 * - (17) Expiry date YYMMDD
 * - (11) MFG date YYMMDD
 * - (10) Batch (variable, GS)
 * - (91) MRP (company-internal, variable, GS)
 * - (92) SKU / Product name (company-internal, variable, GS)
 * - (93) Company name (company-internal, variable, GS)
 * - (21) Serial (optional, variable, GS)
 */
export function buildGS1String(data: LabelData, forBarcode: boolean): string {
  const parts: string[] = [];

  // (01) GTIN – assume gtin already has body+check; normalize to 14 digits
  const gtinDigits = (data.gtin || '').replace(/\D/g, '');
  const gtin14 = gtinDigits.padStart(14, '0');

  if (forBarcode) {
    parts.push(`01${gtin14}`);
  } else {
    parts.push(`(01)${gtin14}`);
  }

  // (17) Expiry
  const gs1Expiry = toGs1Date(data.expiryDate);
  if (gs1Expiry) {
    parts.push(forBarcode ? `17${gs1Expiry}` : `(17)${gs1Expiry}`);
  }

  // (11) MFG
  const gs1Mfg = toGs1Date(data.mfgDate);
  if (gs1Mfg) {
    parts.push(forBarcode ? `11${gs1Mfg}` : `(11)${gs1Mfg}`);
  }

  // (10) Batch (variable, GS)
  if (data.batchNo) {
    parts.push(forBarcode ? `10${data.batchNo}${GS}` : `(10)${data.batchNo}`);
  }

  // (91) MRP (variable, GS)
  if (data.mrp) {
    parts.push(forBarcode ? `91${data.mrp}${GS}` : `(91)${data.mrp}`);
  }

  // (92) SKU / Product (variable, GS)
  if (data.productName) {
    parts.push(forBarcode ? `92${data.productName}${GS}` : `(92)${data.productName}`);
  }

  // (93) Company (variable, GS)
  if (data.companyName) {
    parts.push(forBarcode ? `93${data.companyName}${GS}` : `(93)${data.companyName}`);
  }

  // (21) Serial (optional, variable, GS)
  if (data.serial) {
    parts.push(forBarcode ? `21${data.serial}${GS}` : `(21)${data.serial}`);
  }

  return parts.join('');
}

/** For UI preview: human-readable GS1 string with parentheses */
export function buildGs1DisplayString(data: LabelData): string {
  return buildGS1String(data, false);
}

/**
 * Build RxTrace verification URL (optional mode)
 */
function buildRxTraceURL(data: LabelData): string {
  const params = new URLSearchParams();

  if (data.gtin) params.append('gtin', data.gtin);
  if (data.serial) params.append('sn', data.serial);
  if (data.batchNo) params.append('lot', data.batchNo);

  const expParsed = parseFlexibleDate(data.expiryDate);
  if (expParsed) {
    params.append('exp', `${expParsed.yyyy}-${expParsed.mm}-${expParsed.dd}`);
  }

  const mfgParsed = parseFlexibleDate(data.mfgDate);
  if (mfgParsed) {
    params.append('mfg', `${mfgParsed.yyyy}-${mfgParsed.mm}-${mfgParsed.dd}`);
  }

  return `https://rxtrace.in/verify?${params.toString()}`;
}

// ===================== BARCODE IMAGE GENERATION =====================

/**
 * Generate barcode image with GS1 support
 * @param data - Label data
 * @param type - Barcode type
 * @param useGS1Format - If true, use GS1 AIs; if false, encode plain GTIN-14
 * @param isRxTraceProduct - If true, encode RxTrace URL instead of GS1 data
 */
async function generateBarcodeImage(
  data: LabelData,
  type: 'QR' | 'CODE128' | 'DATAMATRIX',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
): Promise<string> {
  try {
    let barcodeData: string;

    if (isRxTraceProduct) {
      barcodeData = buildRxTraceURL(data);
      console.log('Generating RxTrace URL:', barcodeData);
    } else if (useGS1Format) {
      barcodeData = buildGS1String(data, true); // raw GS1 data with AIs + GS
      console.log('Generating GS1 data:', barcodeData.replace(/\x1D/g, '<GS>'));
    } else {
      // Plain GTIN-14 only
      const digits = (data.gtin || '').replace(/\D/g, '');
      barcodeData = digits.padStart(14, '0');
      console.log('Generating plain GTIN:', barcodeData);
    }

    if (type === 'QR') {
      const dataUrl = await QRCode.toDataURL(barcodeData, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'H',
      });
      console.log('QR generated');
      return dataUrl;
    }

    if (type === 'CODE128') {
      // GS1-128 with bwip-js (FNC1)
      try {
        let text = barcodeData;
        if (useGS1Format && !isRxTraceProduct) {
          text = '^FNC1' + barcodeData;
        }

        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'gs1-128',
          text,
          scale: 3,
          height: 10,
          includetext: false,
        });

        console.log('GS1-128 generated (bwip-js)');
        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Error generating GS1-128 with bwip-js, fallback to JsBarcode:', err);
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: false,
          margin: 5,
        });
        console.log('GS1-128 fallback (JsBarcode)');
        return canvas.toDataURL('image/png');
      }
    }

    if (type === 'DATAMATRIX') {
      try {
        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'datamatrix',
          text: barcodeData,
          scale: 4,
        });
        console.log('DataMatrix generated');
        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('DataMatrix failed, fallback to QR:', err);
        const dataUrl = await QRCode.toDataURL(barcodeData, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'H',
        });
        console.log('DataMatrix fallback QR generated');
        return dataUrl;
      }
    }

    throw new Error('Unknown barcode type');
  } catch (error) {
    console.error('Error generating barcode image:', error);
    throw new Error(
      `Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ===================== PDF GENERATION =====================

/**
 * Generate PDF with single label (simple layout: only barcode, no text)
 */
export async function generatePDF(
  data: LabelData,
  codeType: 'QR' | 'CODE128' | 'DATAMATRIX' = 'QR',
  useGS1Format: boolean = true,
  isRxTraceProduct: boolean = false
) {
  try {
    const barcodeUrl = await generateBarcodeImage(data, codeType, useGS1Format, isRxTraceProduct);

    const Doc = () => (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.codeContainer}>
            <Image src={barcodeUrl} style={{ width: 76, height: 76 }} />
          </View>
        </Page>
      </Document>
    );

    const blob = await pdf(<Doc />).toBlob();
    return blob;
  } catch (error) {
    console.error('Error in generatePDF:', error);
    throw new Error(
      `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate PDF with multiple codes on one page (bulk printing)
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

    const blob = await pdf(<Doc />).toBlob();
    return blob;
  } catch (error) {
    console.error('Error in generateMultiCodePDF:', error);
    throw new Error(
      `Failed to generate multi-code PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ===================== SAVE & SHARE HELPERS =====================

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
    throw new Error(
      `Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
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
    console.error('Error sharing PDF:', error);
    await savePDF(blob, filename);
  }
}

/**
 * Save barcode as PNG image
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

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error saving image:', error);
    throw new Error(
      `Failed to save image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Print PDF directly
 */
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
    throw new Error(
      `Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ===================== ZPL & EPL WITH GS1 =====================

/**
 * Generate ZPL (Zebra) with GS1 format
 */
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
    const digits = (data.gtin || '').replace(/\D/g, '');
    barcodeData = digits.padStart(14, '0');
  }

  let codeZpl = '';

  if (codeType === 'QR') {
    codeZpl = `^FO80,140^BQN,2,5^FDQA,${barcodeData}^FS`;
  } else if (codeType === 'CODE128') {
    // For GS1-128, add FNC1 marker (>8)
    let code128Data = barcodeData;
    if (useGS1Format && !isRxTraceProduct) {
      code128Data = '>8' + barcodeData;
    }
    codeZpl = `^FO50,150^BY3^BCN,100,Y,N,N^FD${code128Data}^FS`;
  } else {
    // DataMatrix
    codeZpl = `^FO80,150^BXN,8,200^FD${barcodeData}^FS`;
  }

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
  let barcodeData: string;

  if (isRxTraceProduct) {
    barcodeData = buildRxTraceURL(data);
  } else if (useGS1Format) {
    barcodeData = buildGS1String(data, true);
  } else {
    const digits = (data.gtin || '').replace(/\D/g, '');
    barcodeData = digits.padStart(14, '0');
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

// ===================== HELPER EXPORTS =====================

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
