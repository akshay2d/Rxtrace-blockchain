import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { sku_id, total_strips } = body;

  // 1. get latest packing rule for SKU
  const { data: rule, error } = await supabase
    .from("packing_rules")
    .select("*")
    .eq("sku_id", sku_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error || !rule) {
    return NextResponse.json({ error: "No packing rule found for SKU" }, { status: 400 });
  }

  // 2. calculate hierarchy numbers
  const stripsPerBox = rule.strips_per_box;
  const boxesPerCarton = rule.boxes_per_carton;
  const cartonsPerPallet = rule.cartons_per_pallet;

  const totalBoxes = Math.ceil(total_strips / stripsPerBox);
  const totalCartons = Math.ceil(totalBoxes / boxesPerCarton);
  const totalPallets = Math.ceil(totalCartons / cartonsPerPallet);

  return NextResponse.json({
    rule_version: rule.version,
    total_strips,
    totalBoxes,
    totalCartons,
    totalPallets,
    sscc_needed: totalPallets
  });
}
