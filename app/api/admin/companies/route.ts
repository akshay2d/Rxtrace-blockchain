import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeApiErrorMessage } from "@/lib/api-error";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const dynamic = "force-dynamic";

function normalizeRole(role: unknown): string {
  return String(role ?? "").trim().toLowerCase();
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('could not find the') ||
    (message.includes('column') && message.includes('schema cache'))
  );
}

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

    if (adminError) {
      return NextResponse.json(
        { error: `Failed to verify admin role: ${adminError.message}` },
        { status: 500 }
      );
    }

    if (!adminRow || normalizeRole(adminRow.role) !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden: superadmin access required" },
        { status: 403 }
      );
    }

    let data: any[] | null = null;
    let error: any = null;

    // Preferred query (supports legacy trial columns if present)
    ({ data, error } = await admin
      .from("companies")
      .select(
        `
          id,
          company_name,
          trial_status,
          trial_end_date,
          trial_ends_at,
          company_trials!left(ends_at)
        `
      )
      .order("company_name", { ascending: true }));

    // Fallback for production schemas where one or more legacy columns are missing.
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await admin
        .from("companies")
        .select(
          `
            id,
            company_name,
            company_trials!left(ends_at)
          `
        )
        .order("company_name", { ascending: true }));
    }

    if (error) {
      throw error;
    }

    const companies = (data || []).map((company: any) => {
      const trialRow = Array.isArray(company.company_trials) ? company.company_trials[0] : null;
      const legacyEnd =
        (company as any).trial_ends_at || (company as any).trial_end_date || null;
      const computedTrialEnd = trialRow?.ends_at || legacyEnd || null;
      let trial_status: "Not Used" | "Active" | "Expired" = "Not Used";
      let trial_end = computedTrialEnd;

      if (computedTrialEnd) {
        trial_status = new Date(computedTrialEnd) > new Date() ? "Active" : "Expired";
      } else if ((company as any).trial_status) {
        const rawStatus = String((company as any).trial_status).toLowerCase();
        if (["trial", "trialing", "active"].includes(rawStatus)) {
          trial_status = "Active";
        } else if (["expired", "cancelled", "ended"].includes(rawStatus)) {
          trial_status = "Expired";
        }
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
