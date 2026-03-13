import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/auth/admin";
import { errorResponse, successResponse } from "@/lib/admin/responses";
import { getOrGenerateCorrelationId } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const correlationId = getOrGenerateCorrelationId(headersList, "admin");

  const auth = await requireAdminRole(["super_admin", "billing_admin", "support_admin"]);
  if (auth.error) {
    return errorResponse(403, "FORBIDDEN", "Admin access required", correlationId);
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get("page_size") || "20")));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from("companies")
    .select(
      "id, user_id, company_name, gst_number:gst, contact_email:email, contact_phone:phone, address, subscription_status, subscription_plan, trial_started_at, trial_expires_at, extra_user_seats, is_frozen, freeze_reason, deleted_at, created_at, updated_at",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("company_name", { ascending: true })
    .range(from, to);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", error.message, correlationId);
  }

  return successResponse(
    200,
    {
      success: true,
      page,
      page_size: pageSize,
      total: count || 0,
      companies: data || [],
    },
    correlationId
  );
}
