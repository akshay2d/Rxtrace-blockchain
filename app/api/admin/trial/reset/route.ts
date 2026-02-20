import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ResetBody = {
  company_id?: string;
  reason?: string;
};

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[trial-reset] auth.getUser()", {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      authError: authError?.message ?? null,
    });

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: adminRow, error: adminError } = await admin
      .from("admin_users")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("[trial-reset] admin_users lookup", {
      lookupUserId: user.id,
      adminError: adminError
        ? { message: adminError.message, code: adminError.code }
        : null,
      adminRow: adminRow ?? null,
      idMatch: adminRow ? String(adminRow.user_id) === String(user.id) : false,
    });

    if (adminError) {
      return NextResponse.json(
        { error: `Failed to verify admin role: ${adminError.message}` },
        { status: 500 }
      );
    }

    const role = normalizeRole(adminRow?.role);
    const forbid = !adminRow || role !== "superadmin";
    console.log("[trial-reset] authz decision", {
      forbid,
      reason: !adminRow ? "missing_admin_row" : `role_${role || 'empty'}`,
    });

    if (forbid) {
      return NextResponse.json(
        { error: "Forbidden: superadmin access required" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as ResetBody;
    const companyId = (body.company_id ?? "").trim();
    const reason = body.reason?.trim() || null;

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const { data: companyRow, error: companyError } = await admin
      .from("companies")
      .select("id, company_name")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      throw companyError;
    }
    if (!companyRow) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { data: trialRows, error: deleteError } = await admin
      .from("company_trials")
      .delete()
      .eq("company_id", companyId)
      .select("id");

    if (deleteError) {
      throw deleteError;
    }

    let hadLegacyTrialData = false;
    const { data: legacyTrialData, error: legacyReadError } = await admin
      .from("companies")
      .select(
        "trial_status, trial_start_date, trial_end_date, trial_started_at, trial_ends_at, trial_activated_at"
      )
      .eq("id", companyId)
      .maybeSingle();

    if (!legacyReadError && legacyTrialData) {
      hadLegacyTrialData =
        !!legacyTrialData.trial_status ||
        !!legacyTrialData.trial_start_date ||
        !!legacyTrialData.trial_end_date ||
        !!legacyTrialData.trial_started_at ||
        !!legacyTrialData.trial_ends_at ||
        !!legacyTrialData.trial_activated_at;
    }

    const { error: legacyResetError } = await admin
      .from("companies")
      .update({
        trial_status: null,
        trial_start_date: null,
        trial_end_date: null,
        trial_started_at: null,
        trial_ends_at: null,
        trial_activated_at: null,
      })
      .eq("id", companyId);

    // Ignore missing-column errors for legacy fields in production schema variants.
    if (legacyResetError && legacyResetError.code !== "42703") {
      throw legacyResetError;
    }

    const deletedTrialsCount = trialRows?.length ?? 0;

    console.log("[trial-reset] reset result", {
      companyId,
      deletedTrialsCount,
      hadLegacyTrialData,
    });

    if (deletedTrialsCount === 0 && !hadLegacyTrialData) {
      return NextResponse.json(
        { error: "No trial found for this company" },
        { status: 404 }
      );
    }

    const { error: logError } = await admin.from("trial_reset_logs").insert({
      company_id: companyId,
      reset_by: user.id,
      reason,
    });

    if (logError) {
      throw logError;
    }

    return NextResponse.json({
      success: true,
      message: "Trial reset successfully",
      company_id: companyId,
      deleted_trials: deletedTrialsCount,
      legacy_trial_cleared: hadLegacyTrialData,
    });
  } catch (error: any) {
    console.error("[trial-reset] route error", {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
    });
    return NextResponse.json(
      { error: error?.message || "Failed to reset trial" },
      { status: 500 }
    );
  }
}
