import { PRICING, type PlanType } from '@/lib/billingConfig';

export function normalizePlanType(raw: unknown): PlanType | null {
  const value = String(raw ?? '').trim().toLowerCase();
  const base = value.split(/[_-]/g).filter(Boolean)[0] ?? value;

  if (base === 'starter' || base === 'free' || base === 'trial') return 'starter';
  if (base === 'professional' || base === 'pro' || base === 'growth') return 'growth';
  if (base === 'enterprise') return 'enterprise';
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
  return {
    unit_labels_quota: plan.unit_labels_quota,
    box_labels_quota: plan.box_labels_quota,
    carton_labels_quota: plan.carton_labels_quota,
    pallet_labels_quota: plan.pallet_labels_quota,
    user_seats_quota: plan.max_seats,
  };
}
