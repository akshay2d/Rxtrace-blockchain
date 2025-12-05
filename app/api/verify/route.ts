// app/api/verify/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseGS1, type GS1Data } from '@/lib/parseGS1';

// Supabase service role client (server-side only)
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// If VERIFY_API_KEY is set, require it in header x-api-key — otherwise allow public
function requireApiKeyIfConfigured(req: Request) {
  const required = process.env.VERIFY_API_KEY;
  if (!required) return;
  const provided = req.headers.get('x-api-key') || '';
  if (provided !== required) throw new Error('Unauthorized');
}

export async function POST(req: Request) {
  try {
    // optional api-key guard
    requireApiKeyIfConfigured(req);

    const supabase = getSupabase();

    const body = await req.json().catch(() => ({}));
    // Accept different possible property names
    const rawInput = (body.gs1_raw || body.raw || body.code || body.qr || '').toString();
    if (!rawInput) return NextResponse.json({ status: 'INVALID', message: 'No payload provided' }, { status: 400 });

    // Parse GS1 data
    let parsed: GS1Data | null = null;
    let parseError: string | null = null;
    
    try {
      parsed = parseGS1(rawInput);
    } catch (e: any) {
      parseError = e?.message || 'Parse error';
      parsed = null;
    }

    const serial = parsed?.serialNo;
    const gtin = parsed?.gtin;
    const batch = parsed?.batchNo;
    const expiry = parsed?.expiryDate;

    // For logging: keep parsed object even if null
    const parsedForLog = parsed || { parseError };

    if (!serial) {
      // cannot identify serial -> invalid scan
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'INVALID', reason: 'no_serial' }
      }]);
      return NextResponse.json({ status: 'INVALID', message: 'Serial not found in payload', parsed }, { status: 200 });
    }

    // find code by serial (most reliable); also allow fallback on gs1_payload exact match
    const { data: codes, error: codeErr } = await supabase
      .from('codes')
      .select('*')
      .or(`serial.eq.${serial},gs1_payload.eq.${rawInput}`)
      .limit(1);

    if (codeErr) {
      console.error('verify: codes lookup error', codeErr);
      // log as error
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'ERROR', detail: codeErr.message }
      }]);
      return NextResponse.json({ status: 'ERROR', message: 'Server error during code lookup' }, { status: 500 });
    }

    if (!codes || codes.length === 0) {
      // not found -> INVALID (not issued)
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'INVALID', reason: 'not_issued', serial }
      }]);
      return NextResponse.json({ status: 'INVALID', message: 'Code not issued', parsed }, { status: 200 });
    }

    const code = codes[0];

    // check blacklist flag(s) - support multiple possible column names
    const isBlacklisted = Boolean(code.blacklisted || code.is_blacklisted || code.blocked || code.is_blocked);
    if (isBlacklisted) {
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: code.id,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'BLACKLIST', reason: 'code_blacklisted' }
      }]);
      return NextResponse.json({ status: 'BLACKLIST', message: 'This code is blacklisted', parsed, code: { id: code.id, gtin: code.gtin, serial: code.serial } }, { status: 200 });
    }

    // check product disabled/discontinued flags (support multiple names)
    const isDisabled = Boolean(code.product_disabled || code.is_disabled || code.disabled || code.product_inactive);
    if (isDisabled) {
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: code.id,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'DISCONTINUED', reason: 'product_disabled' }
      }]);
      return NextResponse.json({ status: 'DISCONTINUED', message: 'Product discontinued', parsed, code: { id: code.id, gtin: code.gtin, serial: code.serial } }, { status: 200 });
    }

    // Check if code was scanned earlier (duplicate)
    const { data: priorScans, error: logErr } = await supabase
      .from('scan_logs')
      .select('id, scanned_at')
      .eq('code_id', code.id)
      .limit(1);

    if (logErr) {
      console.error('verify: scan_logs lookup error', logErr);
    }

    if (priorScans && priorScans.length > 0) {
      // Log this duplicate scan
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: code.id,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'DUPLICATE', first_scanned_at: priorScans[0].scanned_at }
      }]);
      return NextResponse.json({ status: 'DUPLICATE', message: 'Code already scanned', parsed, code: { id: code.id, gtin: code.gtin, serial: code.serial } }, { status: 200 });
    }

    // Otherwise first-time valid scan -> insert log and return VALID
    await supabase.from('scan_logs').insert([{
      raw_scan: rawInput,
      parsed: parsedForLog,
      code_id: code.id,
      scanner_printer_id: req.headers.get('x-printer-id') || null,
      scanned_at: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || null,
      metadata: { status: 'VALID' }
    }]);

    return NextResponse.json({ status: 'VALID', message: 'Code is valid', parsed, code: { id: code.id, gtin: code.gtin, serial: code.serial }, firstScan: true }, { status: 200 });

  } catch (err: any) {
    console.error('verify route error', err);
    const msg = err?.message || 'internal_error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ status: 'ERROR', message: msg }, { status });
  }
}
