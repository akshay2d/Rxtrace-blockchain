import { PRICING, type PlanType } from '@/lib/billingConfig';

export function normalizePlanType(raw: unknown): PlanType | null {
  const value = String(raw ?? '').trim().toLowerCase();
  const base = value.split(/[_-]/g).filter(Boolean)[0] ?? value;

  if (base === 'free' || base === 'trial') return 'trial';
  if (base === 'starter') return 'starter';
  if (base === 'professional' || base === 'pro' || base === 'growth') return 'growth';
  // Enterprise plan removed
  return null;
}

export function monthAfter(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export function resolvePaidPeriod(opts: { trialEnd: Date; now: Date }): { start: Date; end: Date } {
  const { trialEnd, now } = opts;

  let start = new Date(trialEnd);
  // Find the monthly period containing now, anchored to trialEnd.
  while (true) {
    const end = monthAfter(start);
    if (now < end) return { start, end };
    start = end;
  }
}

export function quotasForPlan(planType: PlanType) {
  const plan = PRICING.plans[planType];
  // SSCC quota is the sum of box + carton + pallet quotas (consolidated)
  // For trial plans, quotas are unlimited (null)
  const sscc_labels_quota = plan.box_labels_quota && plan.carton_labels_quota && plan.pallet_labels_quota
    ? plan.box_labels_quota + plan.carton_labels_quota + plan.pallet_labels_quota
    : null;
  
  return {
    unit_labels_quota: plan.unit_labels_quota,
    box_labels_quota: plan.box_labels_quota,
    carton_labels_quota: plan.carton_labels_quota,
    pallet_labels_quota: plan.pallet_labels_quota,
    sscc_labels_quota, // null for trials (unlimited)
    user_seats_quota: plan.max_seats,
  };
}

/**
 * Check if a plan has unlimited quotas (trial plan)
 */
export function isUnlimitedPlan(planType: PlanType | null): boolean {
  return planType === 'trial';
}

/**
 * Check if a quota value represents unlimited
 */
export function isUnlimitedQuota(quota: number | null): boolean {
  return quota === null;
}
