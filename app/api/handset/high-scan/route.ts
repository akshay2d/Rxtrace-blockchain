import { NextResponse } from "next/server";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const payload = (await req.json().catch(() => ({}))) as {
      handset_id?: string;
      enabled?: boolean;
    };
    const { handset_id, enabled } = payload;

    if (!handset_id || enabled === undefined) {
      return NextResponse.json(
        { success: false, error: "handset_id and enabled are required" },
        { status: 400 }
      );
    }

    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: handset, error: handsetError } = await supabase
      .from("handsets")
      .select("id, company_id")
      .eq("id", handset_id)
      .maybeSingle();
    if (handsetError) {
      return NextResponse.json({ success: false, error: handsetError.message }, { status: 500 });
    }
    if (!handset || handset.company_id !== companyId) {
      return NextResponse.json({ success: false, error: "Handset not found" }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("handsets")
      .update({ high_scan_enabled: Boolean(enabled) })
      .eq("id", handset_id)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, handset: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update handset" },
      { status: 500 }
    );
  }
}
