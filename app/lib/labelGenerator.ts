// app/lib/labelGenerator.ts
import bwipjs from "bwip-js";
import sharp from "sharp";

const FNC1 = String.fromCharCode(29); // ASCII GS (Group Separator)

// Fixed-length AIs that don't require trailing FNC1
const FIXED_LENGTH_AIS = new Set([
  "00", "01", "02", "03", "04", // SSCC, GTIN, Content
  "11", "12", "13", "15", "17", // Dates
  "20", // Variant
  "31", "32", "33", "34", "35", "36", // Measurements
]);

/**
 * Convert human-readable GS1 format (with parentheses) to barcode format (with FNC1).
 * Input: "(01)12345678901234(10)BATCH123(17)250630"
 * Output: "\x1D0112345678901234\x1D10BATCH123\x1D17250630"
 */
export function convertToFNC1(humanReadable: string): string {
  // Remove all parentheses and split by AI pattern
  const aiPattern = /\((\d{2,4})\)([^(]+)/g;
  let result = "";
  let match;
  
  while ((match = aiPattern.exec(humanReadable)) !== null) {
    const ai = match[1];
    const value = match[2];
    
    // Add FNC1 before AI (except first one - FNC1 is implicit at start for GS1)
    if (result.length > 0) {
      result += FNC1;
    }
    
    result += ai + value;
    
    // Add trailing FNC1 for variable-length AIs
    if (!FIXED_LENGTH_AIS.has(ai)) {
      result += FNC1;
    }
  }
  
  // Remove trailing FNC1 if present
  if (result.endsWith(FNC1)) {
    result = result.slice(0, -1);
  }
  
  return result;
}

/**
 * Build a GS1 payload string. Keep AIs in parentheses for human-readability.
 * Example inputs:
 *  - level='box', payload: { "01": "01234567890128", "10": "BATCH01", "17": "250101" }
 *  - sscc example: { "00": "000123456789012345" }
 */
export function buildGs1Payload(aiValues: Record<string,string>, useFNC1 = false) {
  // Build human-readable format with parentheses
  const humanReadable = Object.entries(aiValues).map(([ai, val]) => `(${ai})${val}`).join("");
  
  // If useFNC1 is true, convert to barcode format
  if (useFNC1) {
    return convertToFNC1(humanReadable);
  }
  
  return humanReadable;
}

/**
 * ZPL generator — returns a ZPL string for given level and GS1 payload.
 * You can tune sizes (labelWidth,labelHeight) and positions.
 */
export function generateZpl({
  companyName = "",
  title = "",
  aiValues,
  level = "box",
  labelWidth = 812, // dots (203dpi ~ 4")
  labelHeight = 600,
}: {
  companyName?: string;
  title?: string;
  aiValues: Record<string,string>;
  level?: string;
  labelWidth?: number;
  labelHeight?: number;
}) {
  // Barcode data with FNC1 for GS1 compliance
  const barcodeData = buildGs1Payload(aiValues, true);
  // Human-readable with parentheses
  const humanReadable = buildGs1Payload(aiValues, false);
  
  // Use ZPL QR code (Zebra): ^BQN,2,10 -> model 2, magnification 10 (tune as needed)
  // ^FNC1 enables GS1 mode in ZPL
  // Label contains ONLY QR/DataMatrix code - no human-readable text
  const zpl = [
    "^XA",
    `^PW${labelWidth}`,
    `^LH0,0`,
    // QR/DataMatrix code only (centered)
    `^FO${Math.floor((labelWidth - 400) / 2)},${Math.floor((labelHeight - 400) / 2)}^BQN,2,10^FDQA,${barcodeData}^FS`,
    "^XZ",
  ].join("\n");
  return zpl;
}

/**
 * Generate PNG label. Returns Buffer (PNG).
 * - Creates QR or DataMatrix image for the payload via bwip-js.
 * - Composes it into a simple label with text using sharp.
 */
export async function generatePng({
  aiValues,
  companyName = "",
  title = "",
  level = "box",
  format = "qrcode", // 'qrcode' | 'datamatrix'
  qrSize = 400,
  width = 800,
  height = 600,
}: {
  aiValues: Record<string,string>;
  companyName?: string;
  title?: string;
  level?: string;
  format?: "qrcode"|"datamatrix";
  qrSize?: number;
  width?: number;
  height?: number;
}) {
  // Barcode data with FNC1 for GS1 compliance
  const barcodeData = buildGs1Payload(aiValues, true);
  // Human-readable with parentheses
  const humanReadable = buildGs1Payload(aiValues, false);

  // generate barcode PNG buffer using bwip-js with FNC1 encoded data
  const bcid = format === "datamatrix" ? "datamatrix" : "qrcode";
  const pngBuffer: Buffer = await new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid,
      text: barcodeData,
      scale: 5,
      includetext: false,
      parsefnc: true,
    }, (err: string | Error, png: Buffer) => {
      if (err) reject(err);
      else resolve(png);
    });
  });

  // Compose final label with sharp
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Return ONLY QR/DataMatrix code - no text
  return pngBuffer;
}

function escapeXml(str: string) {
  return (str || "").replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}
