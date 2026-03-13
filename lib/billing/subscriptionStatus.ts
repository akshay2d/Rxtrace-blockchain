import type { SupabaseClient } from "@supabase/supabase-js";

export type UnifiedSubscriptionStatus = {
  status: "active" | "pending" | "expired" | "cancelled";
  trialExpiresAt?: Date;
  subscription?: Record<string, any>;
};

function normalizeSubscriptionStatus(value: unknown): UnifiedSubscriptionStatus["status"] {
  const parsed = String(value || "").trim().toLowerCase();
  if (["active", "authenticated", "activated", "charged"].includes(parsed)) return "active";
  if (["cancelled", "canceled"].includes(parsed)) return "cancelled";
  if (["pending", "trial", "trialing"].includes(parsed)) return "pending";
  return "expired";
}

export async function getUnifiedSubscriptionStatus(params: {
  supabase: SupabaseClient;
  companyId: string;
  now?: Date;
}): Promise<UnifiedSubscriptionStatus> {
  const now = params.now ?? new Date();

  const { data: companyRow, error: companyError } = await params.supabase
    .from("companies")
    .select("trial_expires_at")
    .eq("id", params.companyId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);

  const { data: activeSub, error: subError } = await params.supabase
    .from("company_subscriptions")
    .select(
      `
      id,
      status,
      cancel_at_period_end,
      current_period_start,
      current_period_end,
      next_billing_at,
      start_date,
      renewal_date,
      plan_template_id,
      plan_version_id,
      billing_cycle,
      unit_subscription_quota,
      box_subscription_quota,
      carton_subscription_quota,
      pallet_subscription_quota,
      seat_limit,
      plant_limit,
      handset_limit,
      subscription_plan_templates (
        name,
        description,
        billing_cycle,
        plan_price
      )
    `
    )
    .eq("company_id", params.companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subError) throw new Error(subError.message);

  if (activeSub) {
    const normalized = normalizeSubscriptionStatus((activeSub as any).status);
    return {
      status: normalized,
      subscription: activeSub as any,
    };
  }

  const trialExpiresAtIso = (companyRow as any)?.trial_expires_at ?? null;
  const trialExpiresAt = trialExpiresAtIso ? new Date(trialExpiresAtIso) : null;
  if (trialExpiresAt && !Number.isNaN(trialExpiresAt.getTime()) && trialExpiresAt.getTime() > now.getTime()) {
    return { status: "pending", trialExpiresAt };
  }

  return { status: "expired" };
}
