import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const authCompanyId = await resolveCompanyIdFromRequest(req);
  if (!authCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { company_id: requestedCompanyId, sku_id } = await req.json();

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
