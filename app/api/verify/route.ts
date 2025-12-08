// app/api/verify/route.ts - STATELESS VERIFICATION (No database lookup)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseGS1, type GS1Data } from '@/lib/parseGS1';

// Supabase service role client (server-side only) - only for logging scans
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

// Helper: Check if date is expired (format: YYMMDD or YYYY-MM-DD)
function isExpired(expiryStr: string): boolean {
  try {
    let year: number, month: number, day: number;
    
    if (expiryStr.includes('-')) {
      // Format: YYYY-MM-DD
      const parts = expiryStr.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    } else if (expiryStr.length === 6) {
      // Format: YYMMDD
      year = 2000 + parseInt(expiryStr.substring(0, 2));
      month = parseInt(expiryStr.substring(2, 4));
      day = parseInt(expiryStr.substring(4, 6));
    } else {
      return false; // Unknown format, assume not expired
    }

    const expiryDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return expiryDate < today;
  } catch {
    return false;
  }
}

// Helper: Validate GTIN format (should be 8, 12, 13, or 14 digits)
function isValidGTIN(gtin: string): boolean {
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(gtin);
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

    // Validation 1: Must have serial number
    if (!serial || !gtin) {
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'INVALID', reason: 'missing_required_fields' }
      }]);
      return NextResponse.json({ 
        status: 'INVALID', 
        message: 'Invalid QR code: Missing serial or GTIN', 
        parsed 
      }, { status: 200 });
    }

    // Validation 2: GTIN format check
    if (!isValidGTIN(gtin)) {
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'INVALID', reason: 'invalid_gtin_format' }
      }]);
      return NextResponse.json({ 
        status: 'INVALID', 
        message: 'Invalid GTIN format', 
        parsed 
      }, { status: 200 });
    }

    // Validation 3: Check expiry date
    if (expiry && isExpired(expiry)) {
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { status: 'EXPIRED', reason: 'past_expiry_date', expiry }
      }]);
      return NextResponse.json({ 
        status: 'EXPIRED', 
        message: 'Product has expired', 
        parsed,
        expiryDate: expiry
      }, { status: 200 });
    }

    // Check for duplicate scans (same serial scanned before)
    const { data: priorScans } = await supabase
      .from('scan_logs')
      .select('id, scanned_at, metadata')
      .eq('parsed->>serialNo', serial)
      .order('scanned_at', { ascending: true })
      .limit(1);

    if (priorScans && priorScans.length > 0) {
      // Log duplicate scan
      await supabase.from('scan_logs').insert([{
        raw_scan: rawInput,
        parsed: parsedForLog,
        code_id: null,
        scanner_printer_id: req.headers.get('x-printer-id') || null,
        scanned_at: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || null,
        metadata: { 
          status: 'DUPLICATE', 
          first_scanned_at: priorScans[0].scanned_at,
          serial 
        }
      }]);
      return NextResponse.json({ 
        status: 'DUPLICATE', 
        message: 'Code already scanned', 
        parsed,
        firstScanAt: priorScans[0].scanned_at
      }, { status: 200 });
    }

    // All validations passed - VALID scan
    await supabase.from('scan_logs').insert([{
      raw_scan: rawInput,
      parsed: parsedForLog,
      code_id: null,
      scanner_printer_id: req.headers.get('x-printer-id') || null,
      scanned_at: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || null,
      metadata: { status: 'VALID', serial, gtin, batch, expiry }
    }]);

    return NextResponse.json({ 
      status: 'VALID', 
      message: 'Authentic product', 
      parsed,
      product: {
        gtin,
        serial,
        batch,
        expiry
      },
      firstScan: true 
    }, { status: 200 });

  } catch (err: any) {
    console.error('verify route error', err);
    const msg = err?.message || 'internal_error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ status: 'ERROR', message: msg }, { status });
  }
}
