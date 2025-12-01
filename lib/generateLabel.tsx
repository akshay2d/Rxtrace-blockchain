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
  gtin: string;        // GS1-registered GTIN or auto-generated unique identifier (14 digits)
  serial?: string;
}

// ==================== NEW: GS1 FORMAT HELPERS ====================

/**
 * Build GS1-compliant data string from label data
 * Format: (AI)Value(AI)Value...
 * 
 * GS1 Application Identifiers (AI) used:
 * - (01) GTIN: Global Trade Item Number (14 digits) - Fixed length
 * - (17) Expiration Date (YYMMDD format) - Fixed length (6 digits)
 * - (10) Batch/Lot Number - Variable length (requires GS separator)
 * - (11) Manufacturing Date (YYMMDD format) - Fixed length (6 digits)
 * - (21) Serial Number (optional) - Variable length (requires GS separator)
 * 
 * For actual barcode encoding:
 * - Parentheses are removed
 * - GS1 separators (Group Separator, ASCII 29) are added after variable-length fields
 * - FNC1 is added at the start (handled by bwip-js with ^FNC1 prefix)
 * 
 * Note: GTIN can be either GS1-registered or auto-generated unique identifier
 */
function buildGS1String(data: LabelData, forBarcode: boolean = false): string {
  const GS = String.fromCharCode(29); // Group Separator (ASCII 29) - used in GS1 for variable length fields
  const parts: string[] = [];
  
  // (01) GTIN - Global Trade Item Number (14 digits, pad with leading zeros)
  // Fixed length - no separator needed after this
  if (data.gtin) {
    const paddedGtin = data.gtin.padStart(14, '0');
    if (forBarcode) {
      parts.push(`01${paddedGtin}`);
    } else {
      parts.push(`(01)${paddedGtin}`);
    }
  }
  
  // (17) Expiration Date - YYMMDD format (6 digits)
  // Fixed length - no separator needed after this
  if (data.expiryDate) {
    const [dd, mm, yyyy] = data.expiryDate.split('-');
    const yy = yyyy.slice(-2);
    if (forBarcode) {
      parts.push(`17${yy}${mm}${dd}`);
    } else {
      parts.push(`(17)${yy}${mm}${dd}`);
    }
  }
  
  // (10) Batch/Lot Number - Variable length
  // Place AFTER all fixed-length fields for proper GS1 parsing
  // MUST have GS separator after value for scanner to detect next AI
  if (data.batchNo) {
    if (forBarcode) {
      // Add GS separator after batch number for proper parsing
      parts.push(`10${data.batchNo}${GS}`);
    } else {
      parts.push(`(10)${data.batchNo}`);
    }
  }
  
  // (11) Production/Manufacturing Date - YYMMDD format (6 digits)
  // Fixed length - no separator needed
  if (data.mfgDate) {
    const [dd, mm, yyyy] = data.mfgDate.split('-');
    const yy = yyyy.slice(-2);
    if (forBarcode) {
      parts.push(`11${yy}${mm}${dd}`);
    } else {
      parts.push(`(11)${yy}${mm}${dd}`);
    }
  }
  
  // (21) Serial Number (optional) - Variable length
  // If present, add GS separator (unless it's the last field)
  if (data.serial) {
    if (forBarcode) {
      parts.push(`21${data.serial}${GS}`);
    } else {
      parts.push(`(21)${data.serial}`);
    }
  }
  
  const gs1String = parts.join('');
  console.log('GS1 String built:', forBarcode ? 'For Barcode (no parentheses, with GS)' : 'For Display (with parentheses)');
  console.log('GS1 Data:', gs1String.replace(/\x1D/g, '<GS>'));
  console.log('Data used:', { gtin: data.gtin, expiry: data.expiryDate, batch: data.batchNo, mfg: data.mfgDate });
  console.log('Field order: (01)GTIN → (17)EXPIRY → (10)BATCH+GS → (11)MFG');
  return gs1String;
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
      // For barcode encoding, remove parentheses - FNC1 and AI numbers are sufficient
      barcodeData = buildGS1String(data, true);
      console.log('Generating GS1 format (no parentheses for barcode):', barcodeData);
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
      // Generate GS1-128 barcode using bwip-js for proper FNC1 support
      console.log('Generating GS1-128 (Code 128) barcode with bwip-js');
      
      try {
        // bwip-js supports GS1-128 with proper FNC1 character
        // Use ^FNC1 at the start to indicate GS1 format
        let bwipData = barcodeData;
        
        if (useGS1Format && !isRxTraceProduct) {
          // For GS1-128, use ^FNC1 prefix which bwip-js recognizes
          bwipData = '^FNC1' + barcodeData;
          console.log('Using GS1-128 with FNC1 prefix');
        }
        
        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'gs1-128',        // GS1-128 barcode type
          text: bwipData,
          scale: 3,
          height: 10,
          includetext: false,
        });
        
        const dataUrl = canvas.toDataURL('image/png');
        console.log('GS1-128 barcode generated successfully with bwip-js');
        return dataUrl;
      } catch (error) {
        console.error('Error generating GS1-128 with bwip-js:', error);
        // Fallback to JsBarcode
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: false,
          margin: 5
        });
        const dataUrl = canvas.toDataURL('image/png');
        console.log('GS1-128 barcode generated with fallback');
        return dataUrl;
      }

    } else if (type === 'DATAMATRIX') {
      // Generate DataMatrix using bwip-js
      console.log('Generating DataMatrix code with bwip-js');
      console.log('DataMatrix input data:', barcodeData.replace(/\x1D/g, '<GS>'));
      
      try {
        // bwip-js uses 'datamatrix' bcid for all DataMatrix codes
        // For GS1, the data format (with AI and GS separators) makes it GS1-compliant
        // No separate bcid needed - the FNC1 is implicit from the data structure
        
        const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
          bcid: 'datamatrix',       // Standard DataMatrix barcode type
          text: barcodeData,        // GS1 formatted data with AI codes and GS separators
          scale: 4,                 // Larger scale for better scanning
        });
        
        const dataUrl = canvas.toDataURL('image/png');
        console.log('DataMatrix code generated successfully');
        console.log('Generated as GS1 DataMatrix:', useGS1Format && !isRxTraceProduct);
        return dataUrl;
      } catch (error) {
        console.error('DataMatrix generation failed:', error);
        console.error('Error details:', error instanceof Error ? error.message : String(error));
        console.error('Input data that failed:', barcodeData);
        
        // Fallback: try with simpler parameters
        try {
          console.log('Trying simplified DataMatrix...');
          const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
            bcid: 'datamatrix',
            text: barcodeData,
          });
          const dataUrl = canvas.toDataURL('image/png');
          console.log('DataMatrix generated with simplified parameters');
          return dataUrl;
        } catch (fallbackError) {
          console.error('Simplified DataMatrix also failed:', fallbackError);
          
          // Try without special characters
          try {
            console.log('Trying DataMatrix with cleaned data...');
            const cleanData = barcodeData.replace(/[\x00-\x1F]/g, ''); // Remove control characters
            console.log('Cleaned data:', cleanData);
            const canvas = bwipjs.toCanvas(document.createElement('canvas'), {
              bcid: 'datamatrix',
              text: cleanData,
              scale: 3,
            });
            const dataUrl = canvas.toDataURL('image/png');
            console.log('DataMatrix generated with cleaned data');
            return dataUrl;
          } catch (cleanError) {
            console.error('All DataMatrix attempts failed, using QR fallback');
            
            // Final fallback: QR code
            const dataUrl = await QRCode.toDataURL(barcodeData, {
              width: 300,
              margin: 1,
              errorCorrectionLevel: 'H'
            });
            console.log('Using QR code as fallback for DataMatrix');
            return dataUrl;
          }
        }
      }
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
    // Remove parentheses for barcode encoding
    barcodeData = buildGS1String(data, true);
  } else {
    barcodeData = data.gtin;
  }

  // For GS1-128 (Code 128), add FNC1 character and proper formatting
  let code128Data = barcodeData;
  if (codeType === 'CODE128' && useGS1Format && !isRxTraceProduct) {
    // In ZPL, >8 represents FNC1 for GS1-128
    code128Data = '>8' + barcodeData;
  }

  const codeZpl = codeType === 'QR'
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
    // Remove parentheses for barcode encoding
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
