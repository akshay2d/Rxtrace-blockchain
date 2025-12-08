// app/api/issues/route.ts - STATELESS CODE GENERATION (No database storage)
import { NextResponse } from 'next/server';
import { generateUniqueSerial, buildGs1MachinePayload } from '@/utils/gs1SerialUtil';

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
    if (qty < 1 || qty > 50000) return NextResponse.json({ message: 'Quantity must be 1-50000' }, { status: 400 });

    // Generate codes without database storage
    const created: Array<{ serial: string; gs1: string }> = [];

    for (let i = 0; i < qty; i++) {
      // Generate deterministic unique serial
      const serial = generateUniqueSerial({
        gtin,
        batch,
        mfg: mfd || '',
        expiry: exp,
        printerId: printer_id,
        counter: i,
        length: 12
      });

      // Build GS1 payload - this contains ALL the data
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

      created.push({ serial, gs1 });
    }

    console.log(`Generated ${created.length} codes (no database storage)`);

    return NextResponse.json({
      success: true,
      count: created.length,
      items: created,
      message: 'Codes generated successfully'
    }, { status: 200 });

  } catch (err: any) {
    console.error('POST /api/issues error', err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
