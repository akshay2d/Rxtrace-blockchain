import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeApiErrorMessage } from "@/lib/api-error";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: adminRow, error: adminError } = await admin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError || !adminRow || adminRow.role !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden: superadmin access required" },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from("companies")
      .select(
        `
          id,
          company_name,
          company_trials!left(ends_at)
        `
      )
      .order("company_name", { ascending: true });

    if (error) {
      throw error;
    }

    const companies = (data || []).map((company: any) => {
      const trialRow = Array.isArray(company.company_trials) ? company.company_trials[0] : null;
      let trial_status: "Not Used" | "Active" | "Expired" = "Not Used";
      let trial_end = null;

      if (trialRow?.ends_at) {
        trial_end = trialRow.ends_at;
        trial_status = new Date(trialRow.ends_at) > new Date() ? "Active" : "Expired";
      }

      return {
        id: company.id,
        company_name: company.company_name,
        trial_status,
        trial_end,
      };
    });

    return NextResponse.json({ companies });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to load companies") },
      { status: 500 }
    );
  }
}
