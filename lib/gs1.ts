import { generateCanonicalGS1 } from './gs1Canonical';

/**
 * Generate unit GS1 payload (DEPRECATED - use generateCanonicalGS1)
 * 
 * This function is kept for backward compatibility but now uses
 * the canonical generation function which produces machine format.
 * 
 * @deprecated Use generateCanonicalGS1 from lib/gs1Canonical.ts instead
 */
export function generateUnitGS1(data: {
  gtin: string; exp: string; mfd: string;
  batch: string; serial: string;
  mrp: string; sku: string;
}) {
  // Convert YYMMDD strings to Date objects
  const expiryDate = yymmddToDate(data.exp);
  const mfgDate = yymmddToDate(data.mfd);
  
  return generateCanonicalGS1({
    gtin: data.gtin,
    expiry: expiryDate,
    mfgDate: mfgDate,
    batch: data.batch,
    serial: data.serial,
    mrp: data.mrp,
    sku: data.sku,
  });
}

/**
 * Helper to convert YYMMDD string to Date
 */
function yymmddToDate(yymmdd: string): Date {
  if (!yymmdd || yymmdd.length !== 6) {
    throw new Error(`Invalid YYMMDD format: ${yymmdd}`);
  }
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10) - 1; // Month is 0-indexed
  const dd = parseInt(yymmdd.substring(4, 6), 10);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return new Date(year, mm, dd);
}

export function generateSSCC(companyPrefix: string, serial: string) {
  return `00${companyPrefix}${serial}`;
}
