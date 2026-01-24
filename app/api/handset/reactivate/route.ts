import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Reactivate an inactive handset.
 * Requires auth; verifies handset belongs to user's company.
 */
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { handset_id } = await req.json();

    if (!handset_id) {
      return NextResponse.json({ error: "handset_id required" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("handsets")
      .select("id, company_id, status")
      .eq("id", handset_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Handset not found" }, { status: 404 });
    }

    if (existing.company_id !== company.id) {
      return NextResponse.json({ error: "Handset does not belong to your company" }, { status: 403 });
    }

    if (existing.status === "ACTIVE") {
      return NextResponse.json({
        success: true,
        handset: existing,
        message: "Handset is already active",
      });
    }

    const { data: handset, error } = await supabase
      .from("handsets")
      .update({ status: "ACTIVE" })
      .eq("id", handset_id)
      .select()
      .single();

    if (error || !handset) {
      return NextResponse.json({ error: error?.message || "Failed to reactivate" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      handset,
      message: "Handset reactivated successfully",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
