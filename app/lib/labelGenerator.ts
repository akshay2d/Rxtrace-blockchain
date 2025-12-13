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
  const zpl = [
    "^XA",
    `^PW${labelWidth}`,
    `^LH0,0`,
    // header
    `^FO20,20^A0N,36,36^FD${companyName}^FS`,
    `^FO20,64^A0N,28,28^FD${title} (${level.toUpperCase()})^FS`,
    // QR with GS1 data (FNC1 encoded)
    `^FO20,120^BQN,2,5^FDQA,${barcodeData}^FS`,
    // human readable payload with parentheses
    `^FO350,120^A0N,24,24^FD${humanReadable}^FS`,
    // footer small timestamp
    `^FO20,${labelHeight - 40}^A0N,18,18^FDGenerated:${new Date().toISOString()}^FS`,
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
    }, (err: Error | null, png: Buffer) => {
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

  // Resize QR to desired size
  const qrResized = await sharp(pngBuffer).resize(qrSize, qrSize).toBuffer();

  // Composite: place QR left, text right
  const composed = await canvas
    .composite([
      { input: qrResized, left: 20, top: 80 },
      // company name as image text via SVG
      {
        input: Buffer.from(`
          <svg width="${width - (qrSize + 60)}" height="${height}">
            <style>
              .h { font-size:28px; font-weight:700; fill:#000; font-family: Arial, sans-serif; }
              .t { font-size:18px; fill:#222; font-family: Arial, sans-serif; }
              .p { font-size:14px; fill:#333; font-family: monospace; }
            </style>
            <text x="0" y="40" class="h">${escapeXml(companyName)}</text>
            <text x="0" y="80" class="t">${escapeXml(title)} (${escapeXml(level)})</text>
            <text x="0" y="120" class="p">${escapeXml(humanReadable)}</text>
            <text x="0" y="${height - 20}" class="p">Generated: ${new Date().toISOString()}</text>
          </svg>
        `),
        left: qrSize + 40,
        top: 40,
      },
    ])
    .png()
    .toBuffer();

  return composed;
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
