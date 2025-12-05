// app/api/issue/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateSerial, buildGs1MachinePayload, formatDateYYMMDD } from "@/utils/gs1SerialUtil";

// --- Supabase Server Client (service key required) ---
function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!, // NEVER expose on client side
    { auth: { persistSession: false } }
  );
}

// Simple validation
function isValidPrinterId(id: string) {
  return /^[A-Z0-9-]{2,20}$/.test(id);
}

// ----------------------------
//        POST /api/issue
// ----------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gtin, batch, mfd, exp, quantity, printer_id } = body || {};

    // ------------------
    // BASIC VALIDATIONS
    // ------------------
    if (!gtin) return NextResponse.json({ message: "GTIN required" }, { status: 400 });
    if (!batch) return NextResponse.json({ message: "Batch required" }, { status: 400 });
    if (!exp) return NextResponse.json({ message: "Expiry required" }, { status: 400 });
    if (!printer_id || !isValidPrinterId(printer_id.toUpperCase())) {
      return NextResponse.json({ message: "Valid Printer ID required" }, { status: 400 });
    }

    const qty = parseInt(quantity || "1");
    if (qty < 1) return NextResponse.json({ message: "Quantity must be >= 1" }, { status: 400 });

    const created: Array<{ serial: string; gs1: string }> = [];
    const supabase = getSupabaseClient();

    // ------------------
    // GENERATE SERIALS
    // ------------------
    for (let i = 0; i < qty; i++) {
      let serial: string | null = null;

      // Retry up to 5 times for uniqueness
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSerial({ prefix: "RX", line: "01", randomLen: 6 });

        // Try inserting into Supabase
        const { error } = await supabase.from("codes").insert([
          {
            serial: candidate,
            gtin,
            batch,
            mfd: mfd || null,
            exp,
            printed_by: printer_id.toUpperCase(),
            created_at: new Date().toISOString(),
          },
        ]);

        if (!error) {
          serial = candidate;
          break;
        }

        // If duplicate → retry
        if (error.message?.toLowerCase().includes("duplicate")) continue;

        // For any other error → return failure
        return NextResponse.json({ message: "Insert error", detail: error.message }, { status: 500 });
      }

      if (!serial) {
        return NextResponse.json({ message: "Could not generate unique serial" }, { status: 500 });
      }

      // Build GS1 machine-readable payload
      const gs1 = buildGs1MachinePayload({
        gtin,
        expDate: exp,
        batch,
        serial,
      });

      created.push({ serial, gs1 });
    }

    // ------------------
    // RETURN RESULT
    // ------------------
    return NextResponse.json(
      {
        success: true,
        count: created.length,
        items: created,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Issue API ERROR:", err);
    return NextResponse.json({ message: err?.message || "Server error" }, { status: 500 });
  }
}
