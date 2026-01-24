import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SCAN_COST: Record<string, number> = {
  unit: 0,
  box: 0.2,
  carton: 1,
  pallet: 4,
};

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const auth = req.headers.get("authorization");
    if (!auth) return NextResponse.json({ success: false, error: "No auth token" }, { status: 401 });

    const token = auth.replace("Bearer ", "");
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const { role, company_id, handset_id } = decoded;

    // Master scanning switch (separate from activation/token generation)
    const { data: headsRow } = await supabase
      .from('company_active_heads')
      .select('heads')
      .eq('company_id', company_id)
      .maybeSingle();
    const heads = (headsRow?.heads as any) ?? {};
    const scanningEnabled =
      heads?.scanner_scanning_enabled === undefined ? true : !!heads.scanner_scanning_enabled;
    if (!scanningEnabled) {
      return NextResponse.json({ success: false, error: 'Scanning disabled by admin' }, { status: 403 });
    }

    // Ensure handset is still active
    const { data: handset } = await supabase
      .from('handsets')
      .select('id, company_id, status, high_scan_enabled')
      .eq('id', handset_id)
      .maybeSingle();

    if (!handset || handset.company_id !== company_id || handset.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Handset not active' }, { status: 403 });
    }

    const { scannedValue, scanType } = await req.json();
    if (!scanType || !scannedValue)
      return NextResponse.json({ success: false, error: "scanType & scannedValue required" });

    // SSCC scanning specific check (blocks SSCC scans but allows unit scans)
    // This check happens after we know the scanType
    const ssccScanningEnabled =
      heads?.scanner_sscc_scanning_enabled === undefined ? true : !!heads.scanner_sscc_scanning_enabled;
    if (!ssccScanningEnabled && scanType !== 'unit') {
      return NextResponse.json({ 
        success: false, 
        error: 'SSCC scanning is disabled. Only unit label scanning is allowed.' 
      }, { status: 403 });
    }

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
