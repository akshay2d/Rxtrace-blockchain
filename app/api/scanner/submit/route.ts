import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const SCAN_COST: Record<string, number> = {
  unit: 0,
  box: 0.2,
  carton: 1,
  pallet: 4,
};

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return NextResponse.json({ success: false, error: "No auth token" }, { status: 401 });

    const token = auth.replace("Bearer ", "");
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const { role, company_id, handset_id } = decoded;

    const { scannedValue, scanType } = await req.json();
    if (!scanType || !scannedValue)
      return NextResponse.json({ success: false, error: "scanType & scannedValue required" });

    // 🔒 Permission enforcement
    if (role === "UNIT_ONLY" && scanType !== "unit") {
      return NextResponse.json({
        success: false,
        error: "Activation required for box/carton/pallet scanning",
      }, { status: 403 });
    }

    const amount = SCAN_COST[scanType] ?? 0;

    // Use billing API for wallet operations
    if (amount > 0) {
      const billingRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/billing/charge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id,
          type: "scan",
          subtype: scanType,
          count: 1,
          amount,
        }),
      });

      const billingJson = await billingRes.json();
      if (!billingJson.success) {
        return NextResponse.json({ success: false, error: billingJson.error }, { status: 400 });
      }
    }

    // Store scan log
    await supabase.from("scan_logs").insert({
      company_id,
      handset_id,
      raw_scan: scannedValue,
      parsed: { scanType },
      metadata: { scanType },
      status: "SUCCESS"
    });

    return NextResponse.json({
      success: true,
      scanType,
      charged: amount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 400 }
    );
  }
}
