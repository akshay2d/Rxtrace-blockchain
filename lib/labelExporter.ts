/**
 * Unified label export utility for unit and SSCC labels
 * Supports: PDF, PNG, ZPL, EPL, ZIP, and Print dialog
 */

import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

export type CodeType = 'QR' | 'DATAMATRIX';
export type ExportFormat = 'PDF' | 'PNG' | 'ZPL' | 'EPL' | 'ZIP' | 'PRINT';

export interface LabelData {
  id: string;
  payload: string;
  codeType: CodeType;
  displayText?: string; // For labels like "SSCC: 123456" or "GTIN: 890..."
  metadata?: Record<string, any>; // Additional data for rendering
}

/**
 * Export labels to PDF with print dialog option
 */
export async function exportToPDF(
  labels: LabelData[],
  filename: string = 'labels.pdf',
  options: {
    openPrintDialog?: boolean;
    labelsPerPage?: number;
    pageSize?: 'a4' | 'letter';
  } = {}
): Promise<void> {
  const { openPrintDialog = false, labelsPerPage = 6, pageSize = 'a4' } = options;

  if (labels.length === 0) {
    throw new Error('No labels to export');
  }

  const qrcode = (await import('qrcode')).default;
  const bwipjs = (await import('bwip-js')).default;

  const doc = new jsPDF({ unit: 'pt', format: pageSize });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const cols = 2;
  const rows = Math.ceil(labelsPerPage / cols);
  const labelWidth = pageWidth / cols;
  const labelHeight = pageHeight / rows;
  const padding = 20;
  const codeSize = Math.min(labelWidth, labelHeight) - padding * 2;

  let labelIndex = 0;

  for (const label of labels) {
    const col = labelIndex % cols;
    const row = Math.floor((labelIndex % labelsPerPage) / cols);
    
    // Add new page if needed
    if (labelIndex > 0 && labelIndex % labelsPerPage === 0) {
      doc.addPage();
    }

    const x = col * labelWidth + padding;
    const y = row * labelHeight + padding;

    try {
      let dataUrl: string;

      if (label.codeType === 'QR') {
        dataUrl = await qrcode.toDataURL(label.payload, {
          margin: 1,
          width: codeSize,
        });
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = codeSize;
        canvas.height = codeSize;
        
        await bwipjs.toCanvas(canvas, {
          bcid: 'datamatrix',
          text: label.payload,
          scale: 3,
          includetext: false,
        });
        
        dataUrl = canvas.toDataURL('image/png');
      }

      // Add code image
      doc.addImage(dataUrl, 'PNG', x, y, codeSize, codeSize);

      // Add display text if provided
      if (label.displayText) {
        doc.setFontSize(8);
        doc.text(label.displayText, x + codeSize / 2, y + codeSize + 15, {
          align: 'center',
          maxWidth: codeSize,
        });
      }
    } catch (error) {
      console.error(`Failed to generate code for label ${label.id}:`, error);
    }

    labelIndex++;
  }

  if (openPrintDialog) {
    // Open print dialog in browser
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up URL after print dialog closes
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      };
    } else {
      // Fallback to download if popup blocked
      saveAs(pdfBlob, filename);
    }
  } else {
    saveAs(doc.output('blob'), filename);
  }
}

/**
 * Export labels to PNG (single) or ZIP (multiple)
 */
export async function exportToPNG(
  labels: LabelData[],
  filename: string = 'label.png'
): Promise<void> {
  if (labels.length === 0) {
    throw new Error('No labels to export');
  }

  if (labels.length === 1) {
    // Single PNG
    const dataUrl = await generateCodeImage(labels[0]);
    const blob = await (await fetch(dataUrl)).blob();
    saveAs(blob, filename);
  } else {
    // Multiple PNGs as ZIP
    await exportToZIP(labels, filename.replace('.png', '.zip'));
  }
}

/**
 * Export labels to ZPL format (Zebra printers)
 */
export async function exportToZPL(
  labels: LabelData[],
  filename: string = 'labels.zpl'
): Promise<void> {
  if (labels.length === 0) {
    throw new Error('No labels to export');
  }

  let zpl = '';

  for (const label of labels) {
    zpl += '^XA\n'; // Start format
    zpl += `^FX Label ${label.id}\n`; // Comment

    // Add display text if available
    if (label.displayText) {
      zpl += `^FO50,50^A0N,30,30^FD${label.displayText}^FS\n`;
    }

    // Add barcode/QR code
    if (label.codeType === 'QR') {
      zpl += `^FO50,100^BQN,2,6^FDQA,${label.payload}^FS\n`;
    } else {
      zpl += `^FO50,100^BXN,8,200^FD${label.payload}^FS\n`;
    }

    zpl += '^XZ\n\n'; // End format
  }

  saveAs(new Blob([zpl], { type: 'text/plain' }), filename);
}

/**
 * Export labels to EPL format (Eltron printers)
 */
export async function exportToEPL(
  labels: LabelData[],
  filename: string = 'labels.epl'
): Promise<void> {
  if (labels.length === 0) {
    throw new Error('No labels to export');
  }

  let epl = '';

  for (const label of labels) {
    epl += 'N\n'; // Clear buffer

    // Add display text if available
    if (label.displayText) {
      epl += `A50,50,0,3,1,1,N,"${label.displayText}"\n`;
    }

    // EPL has limited barcode support, add as text
    epl += `A50,100,0,2,1,1,N,"${label.payload.substring(0, 40)}"\n`;
    
    epl += 'P1\n\n'; // Print
  }

  saveAs(new Blob([epl], { type: 'text/plain' }), filename);
}

/**
 * Export labels as ZIP of PNG images
 */
export async function exportToZIP(
  labels: LabelData[],
  filename: string = 'labels.zip'
): Promise<void> {
  if (labels.length === 0) {
    throw new Error('No labels to export');
  }

  const zip = new JSZip();

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    try {
      const dataUrl = await generateCodeImage(label);
      const blob = await (await fetch(dataUrl)).blob();
      zip.file(`label_${i + 1}_${label.id}.png`, blob);
    } catch (error) {
      console.error(`Failed to generate image for label ${label.id}:`, error);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, filename);
}

/**
 * Helper: Generate code image as data URL
 */
async function generateCodeImage(label: LabelData): Promise<string> {
  if (label.codeType === 'QR') {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toDataURL(label.payload, {
      margin: 1,
      width: 300,
    });
  } else {
    const bwipjs = (await import('bwip-js')).default;
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    
    await bwipjs.toCanvas(canvas, {
      bcid: 'datamatrix',
      text: label.payload,
      scale: 3,
      includetext: false,
    });
    
    return canvas.toDataURL('image/png');
  }
}

/**
 * Main export function - routes to appropriate handler
 */
export async function exportLabels(
  labels: LabelData[],
  format: ExportFormat,
  filename?: string
): Promise<void> {
  switch (format) {
    case 'PDF':
      await exportToPDF(labels, filename || 'labels.pdf');
      break;
    case 'PNG':
      await exportToPNG(labels, filename || 'label.png');
      break;
    case 'ZPL':
      await exportToZPL(labels, filename || 'labels.zpl');
      break;
    case 'EPL':
      await exportToEPL(labels, filename || 'labels.epl');
      break;
    case 'ZIP':
      await exportToZIP(labels, filename || 'labels.zip');
      break;
    case 'PRINT':
      await exportToPDF(labels, filename || 'labels.pdf', { openPrintDialog: true });
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
