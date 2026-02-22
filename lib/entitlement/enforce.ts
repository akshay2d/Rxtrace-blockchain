import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeQuotaBalance, refundQuotaBalance } from "@/lib/billing/quota";
import { assertCompanyCanOperate, ensureActiveBillingUsage } from "@/lib/billing/usage";
import { checkUsageLimits, trackUsage, type MetricType } from "@/lib/usage/tracking";
import { QuotaKind, UsageType } from "@/lib/entitlement/usageTypes";

export type EntitlementDecision = {
  allow: boolean;
  reason_code: string;
  remaining: number;
  consumed: number;
  fallback_used: "base" | "bonus" | "wallet" | null;
};

const usageTypeToQuotaKind: Record<UsageType, QuotaKind> = {
  [UsageType.UNIT_LABEL]: "unit",
  [UsageType.SSCC_LABEL]: "sscc",
  [UsageType.PALLET_LABEL]: "sscc",
  [UsageType.BOX_LABEL]: "sscc",
  [UsageType.CARTON_LABEL]: "sscc",
  [UsageType.LABEL_PREVIEW]: "sscc",
  [UsageType.BULK_GENERATION]: "sscc",
  [UsageType.ERP_INGEST]: "sscc",
};

const usageTypeToMetricType: Record<UsageType, MetricType> = {
  [UsageType.UNIT_LABEL]: "UNIT",
  [UsageType.SSCC_LABEL]: "SSCC",
  [UsageType.PALLET_LABEL]: "SSCC",
  [UsageType.BOX_LABEL]: "BOX",
  [UsageType.CARTON_LABEL]: "CARTON",
  [UsageType.LABEL_PREVIEW]: "SSCC",
  [UsageType.BULK_GENERATION]: "SSCC",
  [UsageType.ERP_INGEST]: "SSCC",
};

const nonConsumingUsageTypes: Set<UsageType> = new Set([
  UsageType.LABEL_PREVIEW,
  UsageType.ERP_INGEST,
]);

function mapErrorToReasonCode(error?: string): EntitlementDecision["reason_code"] {
  const value = (error || "").toLowerCase();
  if (value.includes("trial")) return "TRIAL_EXPIRED";
  if (value.includes("no active subscription")) return "NO_ACTIVE_SUBSCRIPTION";
  if (value.includes("past_due") || value.includes("inactive") || value.includes("subscription")) {
    return "SUBSCRIPTION_INACTIVE";
  }
  if (value.includes("limit")) return "PLAN_LIMIT_REACHED";
  if (value.includes("insufficient") || value.includes("quota")) return "QUOTA_EXCEEDED";
  return "QUOTA_EXCEEDED";
}

function toRemaining(kind: QuotaKind, result: {
  unitBalance?: number;
  ssccBalance?: number;
  unitAddonBalance?: number;
  ssccAddonBalance?: number;
}): number {
  if (kind === "unit") {
    return Math.max(0, Number(result.unitBalance || 0) + Number(result.unitAddonBalance || 0));
  }
  return Math.max(0, Number(result.ssccBalance || 0) + Number(result.ssccAddonBalance || 0));
}

export async function enforceEntitlement({
  companyId,
  usageType,
  quantity,
  metadata,
}: {
  companyId: string;
  usageType: UsageType;
  quantity: number;
  metadata?: Record<string, any>;
}): Promise<EntitlementDecision> {
  if (!companyId || typeof companyId !== "string") {
    return {
      allow: false,
      reason_code: "INVALID_USAGE_TYPE",
      remaining: 0,
      consumed: 0,
      fallback_used: null,
    };
  }
  if (!Object.values(UsageType).includes(usageType)) {
    return {
      allow: false,
      reason_code: "INVALID_USAGE_TYPE",
      remaining: 0,
      consumed: 0,
      fallback_used: null,
    };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      allow: false,
      reason_code: "INVALID_USAGE_TYPE",
      remaining: 0,
      consumed: 0,
      fallback_used: null,
    };
  }

  if (nonConsumingUsageTypes.has(usageType)) {
    return {
      allow: true,
      reason_code: "NON_CONSUMING",
      remaining: -1,
      consumed: 0,
      fallback_used: null,
    };
  }

  const supabase = getSupabaseAdmin();
  const quotaKind = usageTypeToQuotaKind[usageType];
  const metricType = usageTypeToMetricType[usageType];

  try {
    await assertCompanyCanOperate({ supabase, companyId });
    await ensureActiveBillingUsage({ supabase, companyId });
  } catch (error: any) {
    return {
      allow: false,
      reason_code: mapErrorToReasonCode(error?.code || error?.message),
      remaining: 0,
      consumed: 0,
      fallback_used: null,
    };
  }

  const limitCheck = await checkUsageLimits(supabase, companyId, metricType, quantity);
  if (!limitCheck.allowed) {
    const hardRemaining =
      typeof limitCheck.limit_value === "number"
        ? Math.max(0, limitCheck.limit_value - limitCheck.current_usage)
        : 0;
    return {
      allow: false,
      reason_code: "PLAN_LIMIT_REACHED",
      remaining: hardRemaining,
      consumed: 0,
      fallback_used: null,
    };
  }

  const consume = await consumeQuotaBalance(companyId, quotaKind, quantity);
  if (!consume.ok) {
    return {
      allow: false,
      reason_code: mapErrorToReasonCode(consume.error),
      remaining: toRemaining(quotaKind, consume),
      consumed: 0,
      fallback_used: null,
    };
  }

  trackUsage(supabase, {
    company_id: companyId,
    metric_type: metricType,
    quantity,
    source: "api",
    reference_id: metadata?.source ? String(metadata.source) : undefined,
  }).catch(() => undefined);

  return {
    allow: true,
    reason_code: "ALLOWED",
    remaining: toRemaining(quotaKind, consume),
    consumed: quantity,
    fallback_used: "base",
  };
}

export async function refundEntitlement(params: {
  companyId: string;
  usageType: UsageType;
  quantity: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { companyId, usageType, quantity } = params;
  if (!companyId || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "invalid_refund_input" };
  }
  if (!Object.values(UsageType).includes(usageType)) {
    return { ok: false, error: "invalid_usage_type" };
  }
  if (nonConsumingUsageTypes.has(usageType)) {
    return { ok: true };
  }
  const kind = usageTypeToQuotaKind[usageType];
  return refundQuotaBalance(companyId, kind, quantity);
}
