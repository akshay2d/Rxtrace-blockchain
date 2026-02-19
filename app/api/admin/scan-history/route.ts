// app/api/admin/scan-history/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const company_id = url.searchParams.get("company_id") ?? undefined;

    let query = supabase
      .from("billing_transactions")
      .select("*")
      .eq("type", "scan")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (company_id) {
      query = query.eq("company_id", company_id);
    }
    const { data: rows, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, events: rows ?? [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
