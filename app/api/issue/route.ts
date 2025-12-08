// app/api/issue/route.ts
// Issue endpoint for RxTrace (Next.js App Router style)
// - accepts manual_serials[] OR (auto_count + template)
// - uses utils/gs1SerialUtil for serial generation & payload building
// - inserts into 'codes' table (via Supabase service role client) and returns CSV
//
// Required env:
//  - SUPABASE_URL
//  - SUPABASE_SERVICE_KEY
//  - API_KEY (simple internal guard)
//  - OPTIONAL: UNIQUE_CODE_SECRET (for deterministic generateUniqueSerial)
//
// NOTE: adjust import path to your utils file location if necessary.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildGs1MachinePayload,
  generateUniqueSerial,
  generateSerial,
  normalizeGtinTo14
} from '../../../utils/gs1SerialUtil'; // path from app/api/issue -> project root utils
// If your utils live elsewhere, adjust the relative path accordingly

type ManualRow = {
  gtin: string;
  mfg?: string | null;
  expiry?: string | null;
  batch?: string | null;
  serial?: string | null;
};

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

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

    const MAX_ROWS = 5000;
    const totalRows = manualSerials ? manualSerials.length : autoCount;
    if (totalRows <= 0 || totalRows > MAX_ROWS) {
      return NextResponse.json({ error: `row count must be 1..${MAX_ROWS}` }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Find printer row: try id OR printer_id column (covers both designs)
    let printerRow: any = null;
    {
      const { data: rows1, error: e1 } = await supabase
        .from('printers')
        .select('*')
        .eq('id', printerIdentifier)
        .limit(1);
      if (e1) {
        console.error('Supabase error finding printer by id', e1);
        return NextResponse.json({ error: 'printer lookup failed' }, { status: 500 });
      }
      if (rows1 && rows1.length > 0) printerRow = rows1[0];
    }
    if (!printerRow) {
      const { data: rows2, error: e2 } = await supabase
        .from('printers')
        .select('*')
        .eq('printer_id', printerIdentifier)
        .limit(1);
      if (e2) {
        console.error('Supabase error finding printer by printer_id', e2);
        return NextResponse.json({ error: 'printer lookup failed' }, { status: 500 });
      }
      if (rows2 && rows2.length > 0) printerRow = rows2[0];
    }

    if (!printerRow) {
      return NextResponse.json({ error: 'printer not found' }, { status: 404 });
    }
    if (printerRow.is_active === false) {
      return NextResponse.json({ error: 'printer inactive' }, { status: 403 });
    }

    // Prepare rows
    const nowIso = new Date().toISOString();
    const rowsToInsert: any[] = [];

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

        // Build payload; if serial not provided, buildGs1MachinePayload will auto-generate only if we pass serial undefined
        const payload = buildGs1MachinePayload({
          gtin: gtin14,
          expDate: expiry || undefined,
          mfgDate: mfg || undefined,
          batch: batch || undefined,
          serial: serial || undefined
        });

        rowsToInsert.push({
          gtin: gtin14,
          batch: batch || null,
          mfg: mfg || null,
          expiry: expiry || null,
          serial: serial || null,
          gs1_payload: payload,
          printer_id: printerRow.printer_id,
          issued_by: 'api',
          issued_at: nowIso,
          manual: !!serial
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
        // Prefer deterministic unique serial; fallback to random generateSerial if secret missing/throws
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
            secret: serialOpts.secret // optional override
          });
        } catch (err) {
          // fallback to random serial generator (non-secret)
          serial = generateSerial({ prefix: serialOpts.prefix ?? undefined, randomLen: serialOpts.randomLen ?? 6 });
        }

        const payload = buildGs1MachinePayload({
          gtin: gtin14,
          expDate: expiry ?? undefined,
          mfgDate: mfg ?? undefined,
          batch: batch ?? undefined,
          serial
        });

        rowsToInsert.push({
          gtin: gtin14,
          batch: batch || null,
          mfg: mfg || null,
          expiry: expiry || null,
          serial,
          gs1_payload: payload,
          printer_id: printerRow.printer_id,
          issued_by: 'api',
          issued_at: nowIso,
          manual: false,
          status: 'issued'
        });
      }
    }

    // Bulk insert into codes
    const { data: inserted, error: insertErr } = await supabase.from('codes').insert(rowsToInsert).select();

    if (insertErr) {
      console.error('Insert error', insertErr);
      // If FK type mismatch, show hint (helpful)
      if (insertErr.message && insertErr.message.includes('invalid input syntax for type')) {
        return NextResponse.json({ error: 'insert_failed', detail: 'Possible type mismatch between printers.id and codes.printer_ref. Check schema.' }, { status: 500 });
      }
      return NextResponse.json({ error: 'insert_failed', detail: insertErr.message }, { status: 500 });
    }

    const csvRows = (inserted || []).map((r: any) => ({
      gtin: r.gtin,
      mfg: r.mfg,
      expiry: r.expiry,
      batch: r.batch,
      serial: r.serial,
      gs1_payload: r.gs1_payload
    }));

    const csv = toCsv(csvRows);

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
