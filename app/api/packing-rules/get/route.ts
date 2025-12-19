import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sku_id = searchParams.get("sku_id");
  const company_id = searchParams.get("company_id");

  if (!sku_id || !company_id) {
    return NextResponse.json(
      { error: "sku_id and company_id required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("packaging_rules")
    .select("*")
    .eq("sku_id", sku_id)
    .eq("company_id", company_id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
