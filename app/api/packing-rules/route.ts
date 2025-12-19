import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const sku_id = searchParams.get("sku_id");

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    let q = supabaseAdmin
      .from("packing_rules")
      .select(
        "id, company_id, sku_id, version, strips_per_box, boxes_per_carton, cartons_per_pallet, sscc_company_prefix, sscc_extension_digit, created_at"
      )
      .eq("company_id", company_id)
      .order("version", { ascending: false });

    if (sku_id) {
      q = q.eq("sku_id", sku_id);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rules: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to load packing rules" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      company_id,
      sku_id,
      strips_per_box,
      boxes_per_carton,
      cartons_per_pallet,
      sscc_company_prefix,
      sscc_extension_digit,
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    if (
      !sku_id ||
      !strips_per_box ||
      !boxes_per_carton ||
      !cartons_per_pallet
    ) {
      return NextResponse.json(
        { error: "SKU ID and all packaging quantities are required" },
        { status: 400 }
      );
    }

    // Use default SSCC values if not provided
    const prefix = sscc_company_prefix || "1234567";
    const ext = sscc_extension_digit !== undefined ? sscc_extension_digit : 0;

    // Check existing rule for this SKU
    const { data: existing } = await supabaseAdmin
      .from("packing_rules")
      .select("version")
      .eq("company_id", company_id)
      .eq("sku_id", sku_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = existing ? (existing.version || 0) + 1 : 1;

    // Insert new version of rule
    const { data: inserted, error } = await supabaseAdmin.from("packing_rules").insert({
      sku_id,
      version,
      strips_per_box: parseInt(strips_per_box),
      boxes_per_carton: parseInt(boxes_per_carton),
      cartons_per_pallet: parseInt(cartons_per_pallet),
      sscc_company_prefix: prefix,
      sscc_extension_digit: ext,
      sscc_sequence_key: prefix,
      company_id,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, rule: inserted });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
