import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizePlanType, quotasForPlan, resolvePaidPeriod } from '@/lib/billing/period';
import type { PlanType } from '@/lib/billingConfig';

export type ActiveUsageRow = {
  id: string;
  company_id: string;
  billing_period_start: string;
  billing_period_end: string;
  plan: string;
  unit_labels_quota: number;
  box_labels_quota: number;
  carton_labels_quota: number;
  pallet_labels_quota: number;
  sscc_labels_quota?: number; // Consolidated SSCC quota
  user_seats_quota: number;
  unit_labels_used: number;
  box_labels_used: number;
  carton_labels_used: number;
  pallet_labels_used: number;
  sscc_labels_used?: number; // Consolidated SSCC usage
  user_seats_used: number;
};

export async function getCompanyBillingContext(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  companyId: string;
}) {
  const { supabase, companyId } = opts;

  const { data: companyRow, error } = await supabase
    .from('companies')
    .select('id, subscription_status, subscription_plan, trial_start_date, trial_end_date, extra_user_seats, extra_erp_integrations')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!companyRow) throw new Error('Company not found');

  const planRaw = (companyRow as any).subscription_plan;
  const planType = normalizePlanType(planRaw);

  return {
    company: companyRow as any,
    planType,
  } as {
    company: any;
    planType: PlanType | null;
  };
}

export async function ensureActiveBillingUsage(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  companyId: string;
  now?: Date;
}): Promise<ActiveUsageRow | null> {
  const { supabase, companyId } = opts;
  const now = opts.now ?? new Date();

  // 1) Try find active row
  const { data: active, error: activeErr } = await supabase
    .from('billing_usage')
    .select('*')
    .eq('company_id', companyId)
    .lte('billing_period_start', now.toISOString())
    .gt('billing_period_end', now.toISOString())
    .order('billing_period_start', { ascending: false })
    .limit(1);

  if (activeErr) throw new Error(activeErr.message);
  if (active && active.length > 0) return active[0] as any;

  // 2) Create one based on company status/plan
  const { company, planType } = await getCompanyBillingContext({ supabase, companyId });
  if (!planType) return null;

  const status = String(company.subscription_status ?? '').toLowerCase();
  const trialEndRaw = company.trial_end_date ? String(company.trial_end_date) : null;

  let periodStart: Date;
  let periodEnd: Date;

  if (status === 'trial') {
    if (!trialEndRaw) return null;
    periodStart = now;
    periodEnd = new Date(trialEndRaw);
  } else {
    if (!trialEndRaw) return null;
    const paid = resolvePaidPeriod({ trialEnd: new Date(trialEndRaw), now });
    periodStart = paid.start;
    periodEnd = paid.end;
  }

  const quotas = quotasForPlan(planType);
  const planStored = String(company.subscription_plan ?? planType);

  // Calculate consolidated SSCC quota
  const sscc_labels_quota = quotas.box_labels_quota + quotas.carton_labels_quota + quotas.pallet_labels_quota;

  const insertRow = {
    company_id: companyId,
    billing_period_start: periodStart.toISOString(),
    billing_period_end: periodEnd.toISOString(),
    plan: planStored,
    unit_labels_quota: quotas.unit_labels_quota,
    box_labels_quota: quotas.box_labels_quota,
    carton_labels_quota: quotas.carton_labels_quota,
    pallet_labels_quota: quotas.pallet_labels_quota,
    sscc_labels_quota, // Consolidated SSCC quota
    user_seats_quota: quotas.user_seats_quota,
    unit_labels_used: 0,
    box_labels_used: 0,
    carton_labels_used: 0,
    pallet_labels_used: 0,
    sscc_labels_used: 0, // Consolidated SSCC usage
    user_seats_used: quotas.user_seats_quota,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data: created, error: createErr } = await supabase
    .from('billing_usage')
    .upsert(insertRow, { onConflict: 'company_id,billing_period_start' })
    .select('*')
    .single();

  if (createErr) throw new Error(createErr.message);
  return created as any;
}

export async function assertCompanyCanOperate(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  companyId: string;
}) {
  const { supabase, companyId } = opts;
  const { company } = await getCompanyBillingContext({ supabase, companyId });
  const status = String(company.subscription_status ?? '').toLowerCase();

  if (status === 'past_due') {
    const e: any = new Error('Subscription is past due. Please top-up / settle payment.');
    e.code = 'PAST_DUE';
    throw e;
  }
  if (status === 'cancelled' || status === 'expired') {
    const e: any = new Error('Subscription is not active.');
    e.code = 'SUBSCRIPTION_INACTIVE';
    throw e;
  }
}
