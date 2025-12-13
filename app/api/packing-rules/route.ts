import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function POST(req: Request) {
  const body = await req.json();

  const { sku_id, strips_per_box, boxes_per_carton, cartons_per_pallet,
          sscc_extension_digit, sscc_company_prefix, created_by } = body;

  // Validate required field - accepts any text string
  if (!sku_id || sku_id.trim() === "") {
    return NextResponse.json({ error: "sku_id is required" }, { status: 400 });
  }

  // version auto-handled: use version = max(existing)+1
  const { data: existing } = await supabase
    .from("packing_rules")
    .select("version")
    .eq("sku_id", sku_id)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

  const insertData: any = {
    sku_id,
    version: nextVersion,
    strips_per_box,
    boxes_per_carton,
    cartons_per_pallet,
    sscc_extension_digit: sscc_extension_digit || 0,
    sscc_company_prefix,
    sscc_sequence_key: sscc_company_prefix
  };

  // Only add created_by if it's a valid UUID
  if (created_by && created_by !== "") {
    insertData.created_by = created_by;
  }

  const { data, error } = await supabase
    .from("packing_rules")
    .insert([insertData])
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ success: true, rule: data });
}
