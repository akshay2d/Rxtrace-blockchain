import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    const { data: wallet } = await supabase
      .from("company_wallets")
      .select("*")
      .eq("company_id", company_id)
      .single();

    const balance = Number(wallet?.balance ?? 0);
    const credit_limit = Number(wallet?.credit_limit ?? 10000);
    const status = wallet?.status ?? "ACTIVE";

    return NextResponse.json({
      success: true,
      company_id,
      balance,
      credit_limit,
      available_credit: balance + credit_limit,
      status,
      freeze: status === "FROZEN",
      updated_at: wallet?.updated_at ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
