// lib/grf-converter.ts
// PNG to GRF (Zebra Graphics Format) converter for EPL printers
import sharp from "sharp";

/**
 * Convert PNG buffer to Zebra GRF format (monochrome bitmap)
 * GRF is used for printing graphics on Zebra/Eltron printers via EPL
 * 
 * @param pngBuffer - PNG image buffer
 * @param threshold - Grayscale threshold for binarization (0-255)
 * @returns GRF format string
 */
export async function pngToGrf(pngBuffer: Buffer, threshold = 128): Promise<string> {
  // Convert to grayscale and get metadata
  const { data, info } = await sharp(pngBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  
  // Calculate bytes per row (must be multiple of 8)
  const bytesPerRow = Math.ceil(width / 8);
  
  // Binarize image (convert grayscale to 1-bit black/white)
  const binaryData: number[] = [];
  
  for (let y = 0; y < height; y++) {
    let currentByte = 0;
    let bitPosition = 7;
    
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const pixelValue = data[pixelIndex];
      
      // Set bit if pixel is below threshold (darker = 1, lighter = 0)
      if (pixelValue < threshold) {
        currentByte |= (1 << bitPosition);
      }
      
      bitPosition--;
      
      // When byte is complete or end of row
      if (bitPosition < 0 || x === width - 1) {
        binaryData.push(currentByte);
        currentByte = 0;
        bitPosition = 7;
      }
    }
    
    // Pad row to bytesPerRow if needed
    while (binaryData.length % bytesPerRow !== 0) {
      binaryData.push(0);
    }
  }
  
  // Build GRF format: GW{width},{height},{binaryData}
  const grfHeader = `GW0,0,${bytesPerRow},${height},`;
  const grfData = binaryData.map(b => String.fromCharCode(b)).join("");
  
  return grfHeader + grfData;
}

/**
 * Generate EPL command to print GRF image
 * 
 * @param grf - GRF format string from pngToGrf()
 * @param x - X position on label (dots)
 * @param y - Y position on label (dots)
 * @returns EPL command string
 */
export function eplPrintGrf(grf: string, x = 0, y = 0): string {
  return `GW${x},${y},${grf.substring(grf.indexOf(',') + 1)}`;
}

/**
 * Generate complete EPL label with GRF barcode image
 * 
 * @param pngBuffer - PNG barcode image
 * @param options - Label options
 * @returns Complete EPL string
 */
export async function generateEplWithImage(
  pngBuffer: Buffer,
  options: {
    companyName?: string;
    title?: string;
    payload?: string;
    x?: number;
    y?: number;
    labelWidth?: number;
    labelHeight?: number;
  } = {}
): Promise<string> {
  const {
    companyName = "",
    title = "",
    payload = "",
    x = 20,
    y = 120,
    labelWidth = 812,
    labelHeight = 400
  } = options;

  // Convert PNG to GRF
  const grf = await pngToGrf(pngBuffer);
  
  // Build EPL commands - ONLY barcode image, no text
  const epl = [
    "N", // Clear buffer
    `q${labelWidth}`, // Set label width
    `Q${labelHeight},16`, // Set label height and gap
    "S4", // Set speed
    "D8", // Set density
    "ZT", // Print top of form backup
    "",
    // GRF barcode image only (centered)
    eplPrintGrf(grf, Math.floor((labelWidth - 400) / 2), Math.floor((labelHeight - 400) / 2)),
    "",
    "P1", // Print 1 label
    ""
  ].join("\r\n");

  return epl;
}

/**
 * Helper: Test if GRF conversion is working
 */
export async function testGrfConversion(pngBuffer: Buffer): Promise<{ success: boolean; grfSize: number; error?: string }> {
  try {
    const grf = await pngToGrf(pngBuffer);
    return { success: true, grfSize: grf.length };
  } catch (err: any) {
    return { success: false, grfSize: 0, error: err.message };
  }
}
