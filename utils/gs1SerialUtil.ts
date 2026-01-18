// utils/gs1SerialUtil.ts
import crypto from "crypto";

/* ---------------------------------------------------
   TYPES
--------------------------------------------------- */
export type SerialOptions = {
  prefix?: string;
  line?: string;
  randomLen?: number;
  maxAttempts?: number;
};

/* ---------------------------------------------------
   DATE HELPERS
--------------------------------------------------- */
export function formatDateYYMMDD(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/* ---------------------------------------------------
   GS1 MOD-10 (NUMERIC ONLY — FOR SSCC)
--------------------------------------------------- */
function computeGS1Mod10(input: string): string {
  let sum = 0;
  let even = true;

  for (let i = input.length - 1; i >= 0; i--) {
    sum += parseInt(input[i], 10) * (even ? 3 : 1);
    even = !even;
  }

  return String((10 - (sum % 10)) % 10);
}

/* ---------------------------------------------------
   INTERNAL SERIAL HELPERS (PRODUCT)
--------------------------------------------------- */
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

  return String((10 - (sum % 10)) % 10);
}

function randomBase36(len: number) {
  const bytes = crypto.randomBytes(
    Math.ceil((len * Math.log2(36)) / 8) + 1
  );
  const n = BigInt("0x" + bytes.toString("hex"));
  const s = n.toString(36).toUpperCase();
  return s.slice(-len).padStart(len, "0");
}

/* ---------------------------------------------------
   PRODUCT SERIAL GENERATION (UNCHANGED)
--------------------------------------------------- */
export function generateSerial(opts: SerialOptions = {}) {
  const prefix = (opts.prefix || "RX").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const line = (opts.line || "01").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const randomLen = opts.randomLen ?? 6;

  const d = new Date();
  const datePart = formatDateYYMMDD(d);
  const rand = randomBase36(randomLen);

  const core = `${prefix}${datePart}${line}${rand}`;
  const cd = computeCheckDigit(core);
  return `${core}${cd}`;
}

/* ---------------------------------------------------
   PRODUCT GS1 MACHINE PAYLOAD
   Now uses canonical generation function
--------------------------------------------------- */
import { generateCanonicalGS1 } from '@/lib/gs1Canonical';

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
  // Validate mandatory fields
  if (!params.gtin) {
    throw new Error("GTIN is required");
  }
  if (!params.expDate) {
    throw new Error("Expiry date is required");
  }
  if (!params.mfgDate) {
    throw new Error("Manufacturing date is required");
  }
  if (!params.batch) {
    throw new Error("Batch number is required");
  }
  
  // Generate serial if not provided
  const serial = params.serial || generateSerial({ prefix: "RX", randomLen: 6 });

  return generateCanonicalGS1({
    gtin: params.gtin,
    expiry: params.expDate,
    mfgDate: params.mfgDate,
    batch: params.batch,
    serial: serial,
    mrp: params.mrp,
    sku: params.sku,
    company: params.company,
  });
}

/* ---------------------------------------------------
   🔥 SSCC (AI-00) — NEW, LOGISTICS ONLY
--------------------------------------------------- */
export function buildSSCCMachinePayload(input: {
  companyPrefix: string; // GS1 assigned
  extensionDigit?: number; // 0-9
  serialRef: string; // numeric
}) {
  const ext = String(input.extensionDigit ?? 0);

  if (!/^\d+$/.test(input.companyPrefix)) {
    throw new Error("Invalid GS1 company prefix");
  }

  if (!/^\d+$/.test(input.serialRef)) {
    throw new Error("SSCC serial reference must be numeric");
  }

  const base =
    ext + input.companyPrefix + input.serialRef;

  if (base.length !== 17) {
    throw new Error(
      "SSCC base must be 17 digits (extension + prefix + serial)"
    );
  }

  const checkDigit = computeGS1Mod10(base);
  return `00${base}${checkDigit}`; // GS1 machine format
}

/* ---------------------------------------------------
   HELPERS
--------------------------------------------------- */
export function normalizeGtinTo14(gtin: string): string {
  return gtin.replace(/\D/g, "").padStart(14, "0");
}

/* ---------------------------------------------------
   UNIQUE SERIAL (UNCHANGED)
--------------------------------------------------- */
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
  const secret =
    opts.secret ||
    process.env.UNIQUE_CODE_SECRET ||
    "rxtrace-default-secret";

  const length = opts.length || 12;
  const timestamp = Date.now().toString();

  const input = [
    opts.gtin,
    opts.batch || "",
    opts.mfg || "",
    opts.expiry || "",
    opts.printerId,
    opts.counter.toString(),
    timestamp,
  ].join("|");

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(input);

  const hash = hmac.digest("hex");

  return BigInt("0x" + hash.slice(0, 16))
    .toString(36)
    .toUpperCase()
    .slice(0, length)
    .padStart(length, "0");
}
