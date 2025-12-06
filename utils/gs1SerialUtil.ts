// utils/gs1SerialUtil.ts
import crypto from 'crypto';

export type SerialOptions = { prefix?: string; line?: string; randomLen?: number; maxAttempts?: number };

/** format Date to YYMMDD */
export function formatDateYYMMDD(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** simple Mod10-like check digit for alphanumeric core */
function computeCheckDigit(core: string): string {
  const val = (ch: string) => {
    if (/[0-9]/.test(ch)) return parseInt(ch, 10);
    const c = ch.toUpperCase();
    if (/[A-Z]/.test(c)) return c.charCodeAt(0) - 55;
    return 0;
  };
  let sum = 0;
  let weight = 3;
  for (let i = core.length - 1; i >= 0; i--) {
    sum += val(core[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const mod = sum % 10;
  return String((10 - mod) % 10);
}

/** small base36 random */
function randomBase36(len: number) {
  const bytes = crypto.randomBytes(Math.ceil((len * Math.log2(36)) / 8) + 1);
  const n = BigInt('0x' + bytes.toString('hex'));
  const s = n.toString(36).toUpperCase();
  return s.slice(-len).padStart(len, '0').toUpperCase();
}

/** generate single serial (safe chars, <=20 chars typical) */
export function generateSerial(opts: SerialOptions = {}) {
  const prefix = (opts.prefix || 'RX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const line = (opts.line || '01').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const randomLen = opts.randomLen ?? 6;
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;
  const rand = randomBase36(randomLen);
  const core = `${prefix}${datePart}${line}${rand}`;
  const cd = computeCheckDigit(core);
  return `${core}${cd}`;
}

/** build canonical GS1 machine payload for 2D encoding (no parentheses) */
export function buildGs1MachinePayload(params: { 
  gtin: string; 
  expDate?: string | Date; 
  mfgDate?: string | Date; 
  batch?: string; 
  serial?: string;
  mrp?: string;
  sku?: string;
  company?: string;
}) {
  const GS = String.fromCharCode(29); // Group Separator (ASCII 29)
  const g = params.gtin.padStart(14, '0');
  
  let payload = `01${g}`;
  
  // AI 17 - Expiry date (YYMMDD) - Fixed length
  if (params.expDate) {
    const exp = formatDateYYMMDD(params.expDate);
    payload += `17${exp}`;
  }
  
  // AI 11 - Manufacturing date (YYMMDD) - Fixed length
  if (params.mfgDate) {
    const mfg = formatDateYYMMDD(params.mfgDate);
    payload += `11${mfg}`;
  }
  
  // AI 10 - Batch/Lot (variable length) - requires GS separator
  if (params.batch) {
    payload += `10${params.batch}${GS}`;
  }
  
  // AI 21 - Serial number (variable length) - requires GS separator
  if (params.serial) {
    payload += `21${params.serial}${GS}`;
  } else {
    // Auto-generate serial if not provided
    const autoSerial = generateSerial({ prefix: 'RX', randomLen: 6 });
    payload += `21${autoSerial}${GS}`;
  }
  
  // AI 91 - MRP (variable length) - requires GS separator
  if (params.mrp) {
    payload += `91${params.mrp}${GS}`;
  }
  
  // AI 92 - SKU (variable length) - requires GS separator
  if (params.sku) {
    payload += `92${params.sku}${GS}`;
  }
  
  // AI 93 - Company/Internal info (variable length) - last field, GS optional but included for consistency
  if (params.company) {
    payload += `93${params.company}${GS}`;
  }
  
  return payload;
}

/** Normalize GTIN to 14 digits */
export function normalizeGtinTo14(gtin: string): string {
  const digits = gtin.replace(/\D/g, '');
  return digits.padStart(14, '0');
}

/** Generate deterministic unique serial using HMAC */
export function generateUniqueSerial(opts: {
  gtin: string;
  batch?: string;
  mfg?: string;
  expiry?: string;
  printerId: string;
  counter: number;
  length?: number;
  secret?: string;
}): string {
  const secret = opts.secret || process.env.UNIQUE_CODE_SECRET || 'rxtrace-default-secret';
  const length = opts.length || 12;
  
  // Build input string from all parameters
  const input = [
    opts.gtin,
    opts.batch || '',
    opts.mfg || '',
    opts.expiry || '',
    opts.printerId,
    opts.counter.toString()
  ].join('|');
  
  // Generate HMAC
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(input);
  const hash = hmac.digest('hex');
  
  // Convert to base36 and take required length
  const serial = BigInt('0x' + hash.slice(0, 16))
    .toString(36)
    .toUpperCase()
    .slice(0, length)
    .padStart(length, '0');
  
  return serial;
}
