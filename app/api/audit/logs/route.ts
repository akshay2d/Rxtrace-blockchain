import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const {
    data: { user },
    error: authError,
  } = await supabaseServer().auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  if (!company?.id) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const companyId = company.id as string;

  let query = supabase
    .from("audit_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (searchParams.get("action"))
    query = query.eq("action", searchParams.get("action"));

  if (searchParams.get("status"))
    query = query.eq("status", searchParams.get("status"));

  if (searchParams.get("from"))
    query = query.gte("created_at", searchParams.get("from"));

  if (searchParams.get("to"))
    query = query.lte("created_at", searchParams.get("to"));

  const { data } = await query;
  return Response.json(data || []);
}
