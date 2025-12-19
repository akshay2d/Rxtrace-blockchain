import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const { data, error } = await supabase
      .from("company_wallets")
      .select("company_id, balance, credit_limit, status, updated_at")
      .eq("company_id", company_id)
      .single();

    if (error && error.code === "PGRST116") {
      // no row
      return NextResponse.json({ company_id, balance: 0, credit_limit: 10000, status: "ACTIVE" });
    }
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
