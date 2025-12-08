// app/api/issues/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateUniqueSerial, buildGs1MachinePayload } from '@/utils/gs1SerialUtil';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Environment check:', { 
      hasUrl: !!process.env.SUPABASE_URL, 
      hasPublicUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    });
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gtin, batch, mfd, exp, quantity, printer_id, mrp, sku, company } = body || {};

    // Validations
    if (!gtin) return NextResponse.json({ message: 'GTIN required' }, { status: 400 });
    if (!batch) return NextResponse.json({ message: 'Batch required' }, { status: 400 });
    if (!exp) return NextResponse.json({ message: 'Expiry required' }, { status: 400 });
    if (!printer_id) return NextResponse.json({ message: 'Printer ID required' }, { status: 400 });

    const qty = parseInt(quantity || '1');
    if (qty < 1 || qty > 5000) return NextResponse.json({ message: 'Quantity must be 1-5000' }, { status: 400 });

    const supabase = getSupabaseClient();

    // Find printer
    const { data: printerRows } = await supabase
      .from('printers')
      .select('*')
      .eq('printer_id', printer_id)
      .limit(1);

    if (!printerRows || printerRows.length === 0) {
      return NextResponse.json({ message: 'Printer not found' }, { status: 404 });
    }

    const printerRow = printerRows[0];

    // Generate serials with deterministic HMAC approach
    const created: Array<{ serial: string; gs1: string }> = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < qty; i++) {
      // Generate deterministic unique serial
      const serial = generateUniqueSerial({
        gtin,
        batch,
        mfg: mfd || '',
        expiry: exp,
        printerId: printerRow.printer_id,
        counter: i,
        length: 12
      });

      // Build GS1 payload
      const gs1 = buildGs1MachinePayload({
        gtin,
        expDate: exp,
        mfgDate: mfd || undefined,
        batch,
        serial,
        mrp,
        sku,
        company
      });

      // Single insert - no retry needed (deterministic = unique)
      const insertData = {
        gtin,
        batch,
        mfg: mfd || null,
        expiry: exp,
        serial,
        gs1_payload: gs1,
        printer_id: printerRow.printer_id,
        issued_by: 'dashboard',
        issued_at: nowIso,
        manual: false,
        status: 'issued'
      };
      
      console.log(`Attempting insert #${i + 1}:`, insertData);
      
      const { error, data: insertedData } = await supabase.from('codes').insert([insertData]).select();

      if (error) {
        console.error('Insert error for serial', serial, error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json({ 
          message: 'Database insert failed', 
          detail: error.message,
          hint: error.hint || 'Check if codes table exists and has correct columns',
          code: error.code
        }, { status: 500 });
      }
      
      console.log(`Successfully inserted serial ${serial}`, insertedData);

      created.push({ serial, gs1 });
    }

    return NextResponse.json({
      success: true,
      count: created.length,
      items: created
    }, { status: 200 });

  } catch (err: any) {
    console.error('POST /api/issues error', err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
