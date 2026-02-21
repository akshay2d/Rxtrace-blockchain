import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const authCompanyId = await resolveCompanyIdFromRequest(req);
  if (!authCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sku_id = searchParams.get("sku_id");
  const requestedCompanyId = searchParams.get("company_id");

  if (!sku_id) {
    return NextResponse.json(
      { error: "sku_id required" },
      { status: 400 }
    );
  }

  if (requestedCompanyId && requestedCompanyId !== authCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company_id = authCompanyId;

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
