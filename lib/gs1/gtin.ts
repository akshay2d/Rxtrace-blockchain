/**
 * GTIN Normalization and Validation Helper
 * 
 * Single source of truth for GTIN handling in RxTrace.
 * All GTIN operations must use this helper to ensure consistency.
 * 
 * Rules:
 * 1. Accept GTIN lengths: 8, 12, 13, 14
 * 2. Normalize FIRST → left-pad to GTIN-14
 * 3. Validate GS1 Mod-10 ONLY AFTER normalization
 * 4. NEVER strip leading zeros
 */

export type GTINValidationResult = {
  valid: boolean;
  normalized?: string;
  error?: string;
};

/**
 * Normalize GTIN to 14 digits (GTIN-14)
 * 
 * Accepts: GTIN-8, GTIN-12, GTIN-13, GTIN-14
 * Returns: GTIN-14 (left-padded with zeros)
 * 
 * Does NOT validate check digit - use validateGTIN() for that.
 */
export function normalizeGTIN(input: string): string {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, '');
  
  // Validate length
  if (digits.length < 8 || digits.length > 14) {
    throw new Error(`Invalid GTIN length: ${digits.length}. Must be 8-14 digits (GTIN-8, GTIN-12, GTIN-13, or GTIN-14).`);
  }
  
  // Left-pad to 14 digits (NEVER strip leading zeros)
  const gtin14 = digits.padStart(14, '0');
  
  return gtin14;
}

/**
 * Validate GTIN check digit using GS1 Mod-10 algorithm
 * 
 * IMPORTANT: Input must already be normalized to 14 digits.
 * Use normalizeGTIN() first, then validate.
 */
function validateGTINCheckDigit(gtin14: string): boolean {
  if (gtin14.length !== 14) {
    return false;
  }
  
  // Check digit is the last digit
  const checkDigit = parseInt(gtin14[13], 10);
  const base = gtin14.slice(0, 13);
  
  let sum = 0;
  let multiplier = 3;
  
  // Process from right to left (excluding check digit)
  for (let i = base.length - 1; i >= 0; i--) {
    sum += parseInt(base[i], 10) * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }
  
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

/**
 * Normalize and validate GTIN
 * 
 * Process:
 * 1. Normalize to GTIN-14 (left-pad with zeros)
 * 2. Validate check digit using GS1 Mod-10 algorithm
 * 
 * Returns validation result with normalized GTIN if valid.
 */
export function validateGTIN(input: string): GTINValidationResult {
  try {
    // Step 1: Normalize FIRST
    const normalized = normalizeGTIN(input);
    
    // Step 2: Validate check digit AFTER normalization
    const isValid = validateGTINCheckDigit(normalized);
    
    if (!isValid) {
      return {
        valid: false,
        normalized,
        error: 'Invalid GTIN. Please verify the number or GTIN source. The GTIN check digit is incorrect.',
      };
    }
    
    return {
      valid: true,
      normalized,
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || 'Invalid GTIN. Please verify the number or GTIN source.',
    };
  }
}

/**
 * Check if GTIN is valid without throwing
 * Useful for UI validation
 */
export function isValidGTIN(input: string): boolean {
  const result = validateGTIN(input);
  return result.valid;
}
