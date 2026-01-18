// lib/gs1Builder.js
// GS1 Element String Builder (JavaScript version)
// This is the JavaScript version for Node.js scripts and roundtrip tests.
// For TypeScript code, use lib/gs1Canonical.ts::generateCanonicalGS1()

// ASCII FNC1 (Group Separator)
const FNC1 = String.fromCharCode(29);

// Maximum lengths for variable-length AIs
const MAX_LENGTHS = {
  batch: 20,
  serial: 20,
  mrp: 20,
  sku: 20,
  company: 20,
};

// Validate GTIN check digit
function validateGTINCheckDigit(gtin) {
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return false;
  
  const checkDigit = parseInt(digits[digits.length - 1], 10);
  const base = digits.slice(0, -1);
  
  let sum = 0;
  let multiplier = 3;
  
  for (let i = base.length - 1; i >= 0; i--) {
    sum += parseInt(base[i], 10) * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }
  
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

// Normalize GTIN to 14 digits and validate
function normalizeAndValidateGTIN(gtin) {
  const digits = gtin.replace(/\D/g, "");
  
  if (digits.length < 8 || digits.length > 14) {
    throw new Error(`Invalid GTIN length: ${digits.length}. Must be 8-14 digits.`);
  }
  
  const gtin14 = digits.padStart(14, "0");
  
  if (!validateGTINCheckDigit(gtin14)) {
    throw new Error(`Invalid GTIN check digit: ${gtin14}`);
  }
  
  return gtin14;
}

// Validate variable-length AI
function validateVariableLengthAI(value, aiName, aiCode) {
  if (!value || value.trim().length === 0) {
    throw new Error(`AI ${aiCode} (${aiName}) is required but was empty`);
  }
  
  const trimmed = value.trim();
  
  if (trimmed.length > MAX_LENGTHS[aiName]) {
    throw new Error(
      `AI ${aiCode} (${aiName}) exceeds maximum length of ${MAX_LENGTHS[aiName]} characters: ${trimmed.length}`
    );
  }
  
  if (trimmed.includes(FNC1)) {
    throw new Error(`AI ${aiCode} (${aiName}) contains invalid FNC1 character`);
  }
  
  return trimmed;
}

// Normalize MRP
function normalizeMRP(raw) {
  if (typeof raw === "number") {
    return raw.toFixed(2);
  }
  
  let s = raw.trim();
  s = s.replace(/[^\d.,\-]/g, "");
  
  if (!/[0-9]/.test(s)) {
    throw new Error(`Invalid MRP format: ${raw}`);
  }
  
  const dotCount = (s.match(/\./g) || []).length;
  const commaCount = (s.match(/,/g) || []).length;
  
  let value = s;
  
  if (dotCount > 0 && commaCount > 0) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot > lastComma) {
      value = s.replace(/,/g, "");
    } else {
      value = s.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      value = parts[0] + "." + parts[1];
    } else {
      value = s.replace(/,/g, "");
    }
  } else if (dotCount > 1) {
    value = s.replace(/\./g, "");
  }
  
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid MRP value: ${raw}`);
  }
  
  return num.toFixed(2);
}

/**
 * Build GS1 element string (canonical machine format)
 * Order: 01 GTIN → 17 Expiry → 11 MFD → 10 Batch → 21 Serial → 91 MRP → 92 SKU → 93 Company
 */
function buildGs1ElementString(fields) {
  if (!fields || !fields.gtin) {
    throw new Error("gtin is required for GS1 payload");
  }

  // Validate mandatory fields
  if (!fields.expiryYYMMDD) {
    throw new Error("expiryYYMMDD (17) is required");
  }
  if (!fields.mfdYYMMDD) {
    throw new Error("mfdYYMMDD (11) is required");
  }
  if (!fields.batch) {
    throw new Error("batch (10) is required");
  }
  if (!fields.serial) {
    throw new Error("serial (21) is required");
  }

  // Normalize and validate GTIN
  const gtin14 = normalizeAndValidateGTIN(fields.gtin);
  
  // Validate dates are 6 digits YYMMDD
  if (!/^\d{6}$/.test(fields.expiryYYMMDD)) {
    throw new Error(`Invalid expiryYYMMDD format: ${fields.expiryYYMMDD}. Must be 6 digits YYMMDD.`);
  }
  if (!/^\d{6}$/.test(fields.mfdYYMMDD)) {
    throw new Error(`Invalid mfdYYMMDD format: ${fields.mfdYYMMDD}. Must be 6 digits YYMMDD.`);
  }

  // Validate variable-length AIs
  const batch = validateVariableLengthAI(fields.batch, "batch", "10");
  const serial = validateVariableLengthAI(fields.serial, "serial", "21");

  // Build payload: Fixed-length AIs first
  let payload = `01${gtin14}`;
  payload += `17${fields.expiryYYMMDD}`;
  payload += `11${fields.mfdYYMMDD}`;
  
  // Variable-length AIs with FNC1
  payload += `10${batch}${FNC1}`;
  payload += `21${serial}${FNC1}`;
  
  // Optional internal AIs
  if (fields.mrp !== undefined) {
    const mrp = normalizeMRP(fields.mrp);
    const mrpValidated = validateVariableLengthAI(mrp, "mrp", "91");
    payload += `91${mrpValidated}${FNC1}`;
  }
  
  if (fields.sku) {
    const sku = validateVariableLengthAI(fields.sku, "sku", "92");
    payload += `92${sku}${FNC1}`;
  }
  
  if (fields.company) {
    const company = validateVariableLengthAI(fields.company, "company", "93");
    payload += `93${company}${FNC1}`;
  }
  
  // Remove trailing FNC1
  if (payload.endsWith(FNC1)) {
    payload = payload.slice(0, -1);
  }
  
  return payload;
}

/**
 * Build GS1 Element String for SSCC (AI 00) container labels
 * Format: (00)SSCC18DIGITS
 * @param {string} sscc - 18-digit SSCC code
 * @returns {string} GS1 element string with AI(00)
 */
function buildSsccGs1String(sscc) {
  if (!sscc || sscc.length !== 18) {
    throw new Error("SSCC must be exactly 18 digits");
  }
  // AI(00) + 18-digit SSCC (fixed length, no GS needed)
  return "00" + sscc;
}

// Export for Node and browser bundlers
module.exports = {
  buildGs1ElementString,
  buildSsccGs1String
};
