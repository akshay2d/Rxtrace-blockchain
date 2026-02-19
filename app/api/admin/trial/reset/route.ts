import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const dynamic = "force-dynamic";

type ResetBody = {
  company_id?: string;
  reason?: string;
};

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

    const forbid = !adminRow || adminRow.role !== "superadmin";
    console.log("[trial-reset] authz decision", {
      forbid,
      reason: !adminRow ? "missing_admin_row" : `role_${adminRow.role}`,
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

    if (!companyId || !UUID_REGEX.test(companyId)) {
      return NextResponse.json(
        { error: "Valid company_id is required" },
        { status: 400 }
      );
    }

    const { data: companyRow, error: companyError } = await admin
      .from("companies")
      .select("id")
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

    if (!trialRows || trialRows.length === 0) {
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
