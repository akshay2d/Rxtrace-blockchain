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
export function buildGs1MachinePayload(params: { gtin: string; expDate: string | Date; batch: string; serial: string }) {
  const g = params.gtin.padStart(14, '0');
  const exp = formatDateYYMMDD(params.expDate);
  // variable-length AI (10) batch: in 2D/QR it's fine to concatenate; encoder in GS1 mode will interpret
  return `01${g}17${exp}10${params.batch}21${params.serial}`;
}
