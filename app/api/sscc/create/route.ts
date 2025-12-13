import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: Request) {
  const { sku_id, packing_rule_id, company_id, pallet_count } = await req.json();

  // 1) Get packing rule
  const { data: rule, error: ruleErr } = await supabase
    .from("packing_rules")
    .select("*")
    .eq("id", packing_rule_id)
    .single();

  if (ruleErr || !rule) {
    return NextResponse.json({ error: "Packing rule not found" }, { status: 400 });
  }

  const prefix = rule.sscc_company_prefix;
  const ext = rule.sscc_extension_digit;

  // 2) Reserve serial numbers (atomic allocator)
  const { data: alloc } = await supabase.rpc("allocate_sscc_serials", {
    p_sequence_key: prefix,
    p_count: pallet_count,
  });

  const firstSerial = alloc;

  // 3) Generate all SSCCs using serials
  const ssccList = [];
  for (let i = 0; i < pallet_count; i++) {
    const serial = firstSerial + i;

    const { data: ssccGen } = await supabase.rpc("make_sscc", {
      p_extension_digit: ext,
      p_company_prefix: prefix,
      p_serial: serial,
    });

    ssccList.push(ssccGen);
  }

  // 4) Insert pallets
  const rows = ssccList.map((sscc) => ({
    company_id,
    sku_id,
    packing_rule_id,
    sscc,
    sscc_with_ai: `(00)${sscc}`,
  }));

  const { data: inserted, error } = await supabase
    .from("pallets")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ pallets: inserted });
}
