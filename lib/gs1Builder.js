// lib/gs1Builder.js
// GS1 Element String Builder (JavaScript version)
// Compatible with Node.js and your roundtrip script.

// ASCII FNC1 (Group Separator)
const FNC1 = String.fromCharCode(29);

// Pads GTIN to 14 digits
function padLeftDigits(value, length) {
  const digits = (value || "").toString().replace(/\D/g, "");
  return digits.padStart(length, "0").slice(-length);
}

// Normalize MRP → rupees with two decimals (e.g., "30.00")
function normalizeMrpForEncoding(raw) {
  if (!raw) return undefined;
  let s = raw.trim();
  s = s.replace(/[^\d.,\-]/g, ""); // keep digits, dot, comma

  if (!/[0-9]/.test(s)) return undefined;

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
  if (!Number.isFinite(num)) return undefined;

  return num.toFixed(2); // rupees format
}

/**
 * Build GS1 element string:
 * Order: 01 GTIN → 17 Expiry → 11 MFD → 10 Batch → 91 MRP → 92 SKU → 93 Company
 */
function buildGs1ElementString(fields) {
  if (!fields || !fields.gtin) {
    throw new Error("gtin is required for GS1 payload");
  }

  let out = "";

  // 01 — GTIN fixed 14 digits
  out += "01" + padLeftDigits(fields.gtin, 14);

  // 17 — Expiry
  if (fields.expiryYYMMDD) {
    out += "17" + fields.expiryYYMMDD;
  }

  // 11 — MFD
  if (fields.mfdYYMMDD) {
    out += "11" + fields.mfdYYMMDD;
  }

  // 10 — Batch (variable, FNC1)
  if (fields.batch) {
    out += "10" + fields.batch + FNC1;
  }

  // 21 — Serial Number (variable, FNC1)
  if (fields.serial) {
    out += "21" + fields.serial + FNC1;
  }

  // 91 — MRP (variable, rupees with 2 decimals)
  if (fields.mrp) {
    const norm = normalizeMrpForEncoding(fields.mrp);
    if (norm) out += "91" + norm + FNC1;
    else out += "91" + fields.mrp.trim() + FNC1;
  }

  // 92 — SKU
  if (fields.sku) {
    out += "92" + fields.sku + FNC1;
  }

  // 93 — Company
  if (fields.company) {
    out += "93" + fields.company + FNC1;
  }

  // Remove trailing FNC1 if exists
  if (out.endsWith(FNC1)) {
    out = out.slice(0, -1);
  }

  return out;
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
