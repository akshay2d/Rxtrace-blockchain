// lib/parseGS1.ts

/**
 * Parsed GS1 barcode data interface
 * Contains extracted Application Identifier (AI) fields from GS1 barcodes
 */
export interface GS1Data {
  /** AI (01) - Global Trade Item Number (14 digits) */
  gtin?: string;
  
  /** AI (17) - Expiration Date in DD-MM-YYYY format (converted from YYMMDD) */
  expiryDate?: string;
  
  /** AI (10) - Batch/Lot Number (variable length) */
  batchNo?: string;
  
  /** AI (11) - Manufacturing/Production Date in DD-MM-YYYY format (converted from YYMMDD) */
  mfgDate?: string;
  
  /** AI (21) - Serial Number (variable length) */
  serialNo?: string;
  
  /** Original scanned barcode data before parsing */
  raw: string;
  
  /** Whether the GS1 parsing was successful */
  parsed: boolean;
}

/**
 * Parse GS1-compliant barcode data and extract Application Identifier (AI) fields
 * 
 * Supports two input formats:
 * 1. Barcode format (without parentheses): `01GTIN17YYMMDD10BATCH<GS>11YYMMDD`
 * 2. Human-readable format (with parentheses): `(01)GTIN(17)YYMMDD(10)BATCH(11)YYMMDD`
 * 
 * Handles GS1 standards:
 * - Fixed-length fields (GTIN, dates)
 * - Variable-length fields with GS (Group Separator, ASCII 29) delimiters
 * - FNC1 character removal
 * 
 * @param data - Raw GS1 barcode string from scanner
 * @returns Parsed GS1 data object with extracted fields
 * 
 * @example
 * // Parse barcode format
 * const result = parseGS1('0108901234567890172512311011251129');
 * // result.gtin = '08901234567890'
 * // result.expiryDate = '31-12-2025'
 * // result.batchNo = '1011'
 * // result.mfgDate = '29-11-2025'
 * 
 * @example
 * // Parse human-readable format
 * const result = parseGS1('(01)08901234567890(17)251231(10)BATCH001(11)251129');
 * // result.gtin = '08901234567890'
 * // result.expiryDate = '31-12-2025'
 * // result.batchNo = 'BATCH001'
 * // result.mfgDate = '29-11-2025'
 */
export function parseGS1(data: string): GS1Data {
  const result: GS1Data = {
    raw: data,
    parsed: false,
  };

  if (!data) {
    return result;
  }

  console.log('Parsing GS1 data:', data);
  console.log('Data with visible GS:', data.replace(/\x1D/g, '<GS>'));

  // Remove any FNC1 characters that might be at the start
  let cleanData = data.replace(/^[\u00F1\xF1]/, '');
  
  // Check if data has parentheses (display format) or not (barcode format)
  const hasParentheses = cleanData.includes('(01)') || cleanData.includes('(10)') || cleanData.includes('(17)');

  if (hasParentheses) {
    // Format with parentheses: (01)12345(17)250101(10)BATCH(11)241201
    return parseGS1WithParentheses(cleanData);
  } else {
    // Format without parentheses: 01123456789012341725010110BATCH<GS>11241201
    return parseGS1WithoutParentheses(cleanData);
  }
}

/**
 * Parse GS1 data in human-readable format (with parentheses)
 * Format: (01)GTIN(17)YYMMDD(10)BATCH(11)YYMMDD
 * 
 * @param data - GS1 string with parentheses around Application Identifiers
 * @returns Parsed GS1 data object
 * @internal
 */
function parseGS1WithParentheses(data: string): GS1Data {
  const result: GS1Data = {
    raw: data,
    parsed: true,
  };

  // Extract (01) GTIN - 14 digits
  const gtinMatch = data.match(/\(01\)(\d{14})/);
  if (gtinMatch) {
    result.gtin = gtinMatch[1];
    console.log('Extracted GTIN:', result.gtin);
  }

  // Extract (17) Expiry Date - 6 digits YYMMDD
  const expiryMatch = data.match(/\(17\)(\d{6})/);
  if (expiryMatch) {
    const yymmdd = expiryMatch[1];
    result.expiryDate = formatGS1Date(yymmdd);
    console.log('Extracted Expiry:', result.expiryDate, 'from', yymmdd);
  }

  // Extract (10) Batch/Lot Number - variable length
  const batchMatch = data.match(/\(10\)([^\(]+)/);
  if (batchMatch) {
    result.batchNo = batchMatch[1].trim();
    console.log('Extracted Batch:', result.batchNo);
  }

  // Extract (11) MFG Date - 6 digits YYMMDD
  const mfgMatch = data.match(/\(11\)(\d{6})/);
  if (mfgMatch) {
    const yymmdd = mfgMatch[1];
    result.mfgDate = formatGS1Date(yymmdd);
    console.log('Extracted MFG Date:', result.mfgDate, 'from', yymmdd);
  }

  // Extract (21) Serial Number - variable length
  const serialMatch = data.match(/\(21\)([^\(]+)/);
  if (serialMatch) {
    result.serialNo = serialMatch[1].trim();
    console.log('Extracted Serial:', result.serialNo);
  }

  return result;
}

/**
 * Parse GS1 data in barcode format (without parentheses)
 * Format: 01GTIN17YYMMDD10BATCH<GS>11YYMMDD
 * 
 * Uses sequential parsing with 2-digit Application Identifiers:
 * - Fixed-length AIs: Read exact number of characters
 * - Variable-length AIs: Read until GS (Group Separator, ASCII 29) or next AI
 * 
 * @param data - GS1 string without parentheses (raw barcode data)
 * @returns Parsed GS1 data object
 * @internal
 */
function parseGS1WithoutParentheses(data: string): GS1Data {
  const result: GS1Data = {
    raw: data,
    parsed: true,
  };

  let position = 0;
  const GS = String.fromCharCode(29); // Group Separator

  console.log('Parsing without parentheses, length:', data.length);

  while (position < data.length) {
    // Read AI (2 digits)
    const ai = data.substring(position, position + 2);
    position += 2;

    console.log('Found AI:', ai, 'at position', position - 2);

    switch (ai) {
      case '01': // GTIN - 14 digits (fixed length)
        result.gtin = data.substring(position, position + 14);
        position += 14;
        console.log('Extracted GTIN:', result.gtin);
        break;

      case '17': // Expiry Date - 6 digits YYMMDD (fixed length)
        const expiryYYMMDD = data.substring(position, position + 6);
        result.expiryDate = formatGS1Date(expiryYYMMDD);
        position += 6;
        console.log('Extracted Expiry:', result.expiryDate, 'from', expiryYYMMDD);
        break;

      case '10': // Batch Number - variable length (ends with GS or end of string)
        const batchEnd = data.indexOf(GS, position);
        if (batchEnd !== -1) {
          result.batchNo = data.substring(position, batchEnd);
          position = batchEnd + 1; // Skip GS character
        } else {
          // No GS found, take rest of string or until next AI
          const nextAI = findNextAI(data, position);
          if (nextAI !== -1) {
            result.batchNo = data.substring(position, nextAI);
            position = nextAI;
          } else {
            result.batchNo = data.substring(position);
            position = data.length;
          }
        }
        console.log('Extracted Batch:', result.batchNo);
        break;

      case '11': // MFG Date - 6 digits YYMMDD (fixed length)
        const mfgYYMMDD = data.substring(position, position + 6);
        result.mfgDate = formatGS1Date(mfgYYMMDD);
        position += 6;
        console.log('Extracted MFG Date:', result.mfgDate, 'from', mfgYYMMDD);
        break;

      case '21': // Serial Number - variable length (ends with GS or end of string)
        const serialEnd = data.indexOf(GS, position);
        if (serialEnd !== -1) {
          result.serialNo = data.substring(position, serialEnd);
          position = serialEnd + 1;
        } else {
          result.serialNo = data.substring(position);
          position = data.length;
        }
        console.log('Extracted Serial:', result.serialNo);
        break;

      default:
        // Unknown AI, try to skip it
        console.warn('Unknown AI:', ai, '- stopping parse');
        position = data.length; // Stop parsing
        break;
    }
  }

  return result;
}

/**
 * Find the position of the next GS1 Application Identifier in the data string
 * 
 * Application Identifiers are:
 * - Always 2 digits
 * - Commonly: 01 (GTIN), 10 (Batch), 11 (MFG), 17 (Expiry), 21 (Serial), etc.
 * 
 * @param data - GS1 data string
 * @param startPos - Position to start searching from
 * @returns Position of next AI, or -1 if not found
 * @internal
 */
function findNextAI(data: string, startPos: number): number {
  for (let i = startPos; i < data.length - 1; i++) {
    const twoChars = data.substring(i, i + 2);
    // Check if it looks like an AI (two digits)
    if (/^\d{2}$/.test(twoChars)) {
      // Common GS1 AIs start with 01, 10, 11, 17, 21, etc.
      if (['01', '10', '11', '17', '21', '30', '37'].includes(twoChars)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Convert GS1 date format (YYMMDD) to human-readable format (DD-MM-YYYY)
 * 
 * GS1 dates are encoded as 6 digits: YYMMDD
 * - YY: Two-digit year (00-49 = 2000-2049, 50-99 = 1950-1999)
 * - MM: Month (01-12)
 * - DD: Day (01-31)
 * 
 * @param yymmdd - GS1 date string in YYMMDD format (6 digits)
 * @returns Formatted date string in DD-MM-YYYY format
 * 
 * @example
 * formatGS1Date('251231') // Returns '31-12-2025'
 * formatGS1Date('001225') // Returns '25-12-2000'
 * 
 * @internal
 */
function formatGS1Date(yymmdd: string): string {
  if (yymmdd.length !== 6) {
    return yymmdd;
  }

  const yy = yymmdd.substring(0, 2);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // Convert YY to YYYY (assuming 20YY for dates 00-99)
  const yyyy = parseInt(yy) < 50 ? `20${yy}` : `19${yy}`;

  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Format parsed GS1 data into a human-readable display string
 * 
 * Combines all extracted GS1 fields into a pipe-separated string
 * suitable for display in scanner apps or verification interfaces
 * 
 * @param data - Parsed GS1 data object
 * @returns Formatted string with all available fields
 * 
 * @example
 * const gs1Data = parseGS1('(01)08901234567890(17)251231(10)BATCH001');
 * formatGS1ForDisplay(gs1Data);
 * // Returns: "GTIN: 08901234567890 | Expiry: 31-12-2025 | Batch: BATCH001"
 */
export function formatGS1ForDisplay(data: GS1Data): string {
  if (!data.parsed) {
    return `Raw data: ${data.raw}`;
  }

  const parts: string[] = [];
  
  if (data.gtin) parts.push(`GTIN: ${data.gtin}`);
  if (data.expiryDate) parts.push(`Expiry: ${data.expiryDate}`);
  if (data.batchNo) parts.push(`Batch: ${data.batchNo}`);
  if (data.mfgDate) parts.push(`MFG: ${data.mfgDate}`);
  if (data.serialNo) parts.push(`Serial: ${data.serialNo}`);

  return parts.join(' | ');
}
