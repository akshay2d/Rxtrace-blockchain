// app/api/issue/route.ts - STATELESS CODE GENERATION (No database storage)
// Issue endpoint for RxTrace (Next.js App Router style)
// - accepts manual_serials[] OR (auto_count + template)
// - uses utils/gs1SerialUtil for serial generation & payload building
// - NO DATABASE INSERT - returns CSV directly
//
// Required env:
//  - API_KEY (simple internal guard)
//  - OPTIONAL: UNIQUE_CODE_SECRET (for deterministic generateUniqueSerial)

import { NextResponse } from 'next/server';
import {
  buildGs1MachinePayload,
  generateUniqueSerial,
  generateSerial,
  normalizeGtinTo14
} from '../../../utils/gs1SerialUtil';

type ManualRow = {
  gtin: string;
  mfg?: string | null;
  expiry?: string | null;
  batch?: string | null;
  serial?: string | null;
};

function requireApiKey(req: Request) {
  const key = req.headers.get('x-api-key');
  if (!key || key !== process.env.API_KEY) {
    throw new Error('Unauthorized');
  }
}

function safeEscapeCsvValue(v: any) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Record<string, any>>) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = headers.map((h) => safeEscapeCsvValue(r[h]));
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

function isValidSerialValue(s: any) {
  if (s == null) return false;
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  return /^[A-Z0-9\-]+$/i.test(trimmed);
}

function isValidGtinLike(g: any) {
  if (typeof g !== 'string') return false;
  const digits = g.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14;
}

export async function POST(req: Request) {
  try {
    requireApiKey(req);
  } catch (err: any) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    const printerIdRaw = body.printer_id || body.printerId;
    if (!printerIdRaw) return NextResponse.json({ error: 'printer_id required' }, { status: 400 });
    const printerIdentifier = String(printerIdRaw);

    const manualSerials: ManualRow[] | null = Array.isArray(body.manual_serials) ? body.manual_serials : null;
    const autoCount = typeof body.auto_count === 'number' ? Math.floor(body.auto_count) : 0;
    const template = body.template ?? null;

    if (!manualSerials && (!template || autoCount <= 0)) {
      return NextResponse.json({ error: 'Either manual_serials[] or (auto_count + template) required' }, { status: 400 });
    }

    const MAX_ROWS = 50000;
    const totalRows = manualSerials ? manualSerials.length : autoCount;
    if (totalRows <= 0 || totalRows > MAX_ROWS) {
      return NextResponse.json({ error: `row count must be 1..${MAX_ROWS}` }, { status: 400 });
    }

    // Prepare rows (no database insert)
    const csvRows: any[] = [];

    if (manualSerials) {
      for (const r of manualSerials) {
        const gtinRaw = r.gtin;
        if (!gtinRaw || !isValidGtinLike(gtinRaw)) {
          return NextResponse.json({ error: 'invalid gtin in manual_serials' }, { status: 400 });
        }
        const gtin14 = normalizeGtinTo14(String(gtinRaw));
        const mfg = r.mfg ? String(r.mfg) : null;
        const expiry = r.expiry ? String(r.expiry) : null;
        const batch = r.batch ? String(r.batch) : null;
        const serial = r.serial ? String(r.serial) : null;

        if (serial && !isValidSerialValue(serial)) {
          return NextResponse.json({ error: 'invalid serial format in manual_serials' }, { status: 400 });
        }

        // Build payload
        const payload = buildGs1MachinePayload({
          gtin: gtin14,
          expDate: expiry || undefined,
          mfgDate: mfg || undefined,
          batch: batch || undefined,
          serial: serial || undefined
        });

        csvRows.push({
          gtin: gtin14,
          batch: batch || '',
          mfg: mfg || '',
          expiry: expiry || '',
          serial: serial || '',
          gs1_payload: payload
        });
      }
    } else {
      // auto-generation using template
      if (!template || !template.gtin) return NextResponse.json({ error: 'template.gtin required' }, { status: 400 });
      const gtinRaw = String(template.gtin);
      if (!isValidGtinLike(gtinRaw)) return NextResponse.json({ error: 'invalid gtin in template' }, { status: 400 });
      const gtin14 = normalizeGtinTo14(gtinRaw);

      const mfg = template.mfg ?? null;
      const expiry = template.expiry ?? null;
      const batch = template.batch ?? null;
      const serialOpts = template.serialOpts ?? {};

      for (let i = 0; i < autoCount; i++) {
        // Prefer deterministic unique serial
        let serial = null;
        try {
          serial = generateUniqueSerial({
            gtin: gtin14,
            batch: batch ?? undefined,
            mfg: mfg ?? undefined,
            expiry: expiry ?? undefined,
            printerId: String(printerIdentifier),
            counter: i,
            length: serialOpts.length ?? 12,
            secret: serialOpts.secret
          });
        } catch (err) {
          // fallback to random serial generator
          serial = generateSerial({ prefix: serialOpts.prefix ?? undefined, randomLen: serialOpts.randomLen ?? 6 });
        }

        const payload = buildGs1MachinePayload({
          gtin: gtin14,
          expDate: expiry ?? undefined,
          mfgDate: mfg ?? undefined,
          batch: batch ?? undefined,
          serial
        });

        csvRows.push({
          gtin: gtin14,
          batch: batch || '',
          mfg: mfg || '',
          expiry: expiry || '',
          serial,
          gs1_payload: payload
        });
      }
    }

    const csv = toCsv(csvRows);

    console.log(`Generated ${csvRows.length} codes (no database storage)`);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="issued_${printerIdentifier}_${Date.now()}.csv"`
      }
    });
  } catch (err: any) {
    console.error('POST /api/issue error', err);
    const message = err?.message || 'internal_error';
    const status = err?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
