import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id: requestedCompanyId, head, enabled } = body;
    if (requestedCompanyId && requestedCompanyId !== companyIdFromAuth) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const company_id = companyIdFromAuth;
    if (!head) return NextResponse.json({ success: false, error: "head is required" }, { status: 400 });

    // fetch existing heads
    const { data: existing, error: existingError } = await supabase
      .from("company_active_heads")
      .select("company_id, heads")
      .eq("company_id", company_id)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
    }
    const currentHeads = (existing?.heads as Record<string, boolean>) ?? {};

    currentHeads[head] = !!enabled;

    const { data: row, error: upsertError } = await supabase
      .from("company_active_heads")
      .upsert({ company_id, heads: currentHeads }, { onConflict: "company_id" })
      .select("heads")
      .single();
    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Head updated", company_id, head, enabled: !!enabled, heads: row.heads });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
