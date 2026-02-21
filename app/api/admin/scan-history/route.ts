// app/api/admin/scan-history/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const requestedCompanyId = url.searchParams.get("company_id") ?? undefined;
    if (requestedCompanyId && requestedCompanyId !== companyIdFromAuth) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const company_id = companyIdFromAuth;

    let query = supabase
      .from("billing_transactions")
      .select("*")
      .eq("type", "scan")
      .order("created_at", { ascending: false })
      .limit(limit);
    query = query.eq("company_id", company_id);
    const { data: rows, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, events: rows ?? [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
