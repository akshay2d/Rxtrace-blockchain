import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { billingConfig } from "@/app/lib/billingConfig";
import { parseGS1 } from "@/lib/parseGS1";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function POST(req: Request) {
  try {
    const { raw, handset_id, company_id } = await req.json();

    if (!raw || !handset_id || !company_id) {
      return NextResponse.json(
        { success: false, error: "Missing raw | handset_id | company_id" },
        { status: 400 }
      );
    }

    /* ------------------------------------------------
       1️⃣ Validate handset
    ------------------------------------------------ */
    const { data: handset } = await supabase
      .from("handsets")
      .select("*")
      .eq("id", handset_id)
      .single();

    if (!handset || handset.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Handset not active" },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       2️⃣ Check company paid scan module
    ------------------------------------------------ */
    const { data: headsRow } = await supabase
      .from("company_active_heads")
      .select("*")
      .eq("company_id", company_id)
      .single();

    const heads = headsRow?.heads as any;
    if (!heads || heads.high_scan !== true) {
      return NextResponse.json(
        { success: false, error: "Scan module not enabled" },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       3️⃣ Parse GS1 payload
    ------------------------------------------------ */
    const data = parseGS1(raw);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "Invalid GS1 payload" },
        { status: 400 }
      );
    }

    /* ------------------------------------------------
       4️⃣ Enforce HIGH-SCAN for SSCC (AI 00)
    ------------------------------------------------ */
    if (data.sscc && !handset.high_scan_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "High-scan permission required for box/carton/pallet"
        },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       5️⃣ Resolve hierarchy
    ------------------------------------------------ */
    let level: "unit" | "box" | "carton" | "pallet" | null = null;
    let result: any = null;

    if (data.sscc) {
      // Check pallets
      const { data: pallet } = await supabase
        .from("pallets")
        .select("*, cartons(*)")
        .eq("sscc", data.sscc)
        .single();
      
      if (pallet) {
        result = pallet;
        level = "pallet";
      }

      // Check cartons if not found
      if (!result) {
        const { data: carton } = await supabase
          .from("cartons")
          .select("*, pallet:pallets(*)")
          .eq("code", data.sscc)
          .single();
        
        if (carton) {
          result = carton;
          level = "carton";
        }
      }

      // Boxes and units not implemented yet
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Box/Unit level not yet implemented" },
          { status: 501 }
        );
      }
    }

    if (!result && data.uid) {
      return NextResponse.json(
        { success: false, error: "Unit level not yet implemented" },
        { status: 501 }
      );
    }

    if (!result || !level) {
      return NextResponse.json(
        { success: false, error: "Code not found in hierarchy" },
        { status: 404 }
      );
    }

    /* ------------------------------------------------
       6️⃣ Billing
    ------------------------------------------------ */
    const price =
      level === "carton"
        ? billingConfig.pricing.scan.carton
        : level === "pallet"
        ? billingConfig.pricing.scan.pallet
        : 0; // unit/box scan free (not implemented yet)

    if (price > 0) {
      const billingRes = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/billing/charge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            company_id,
            type: "scan",
            subtype: level,
            count: 1
          })
        }
      );

      const billingJson = await billingRes.json();
      if (!billingJson.success) {
        return NextResponse.json(
          { success: false, error: billingJson.error },
          { status: 402 }
        );
      }
    }

    /* ------------------------------------------------
       7️⃣ Log scan
    ------------------------------------------------ */
    await supabase.from("scan_logs").insert({
      company_id,
      handset_id,
      raw_scan: raw,
      parsed: data,
      metadata: { level },
      status: "SUCCESS"
    });

    /* ------------------------------------------------
       8️⃣ Success
    ------------------------------------------------ */
    return NextResponse.json({
      success: true,
      level,
      data: result
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}
