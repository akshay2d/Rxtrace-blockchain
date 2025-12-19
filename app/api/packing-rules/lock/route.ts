import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const { company_id, sku_id } = await req.json();

  if (!company_id || !sku_id) {
    return NextResponse.json(
      { error: "company_id and sku_id required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("packaging_rules")
    .update({ is_locked: true })
    .eq("company_id", company_id)
    .eq("sku_id", sku_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ locked: true });
}
