import Razorpay from 'razorpay';
import { normalizePlanType } from '@/lib/billing/period';
import type { PlanType } from '@/lib/billingConfig';

export type BillingCycle = 'monthly' | 'annual' | 'quarterly';

function normalizeBillingCycle(raw: unknown): BillingCycle {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'annual' || value === 'year' || value === 'yearly') return 'annual';
  if (value === 'quarterly' || value === 'quarter' || value === 'qtr') return 'quarterly';
  return 'monthly';
}

function parsePlanAndCycle(raw: unknown): { planType: PlanType; cycle: BillingCycle } {
  const value = String(raw ?? '').trim().toLowerCase();
  const parts = value.split(/[_-]/g).filter(Boolean);

  // Supported inputs:
  // - "starter" (defaults to monthly)
  // - "starter_monthly" / "starter_annual"
  // - "growth-yearly"
  const maybeCycle = parts.length > 1 ? parts[parts.length - 1] : null;
  const cycle = maybeCycle ? normalizeBillingCycle(maybeCycle) : 'monthly';
  const planPart = parts.length > 1 && cycle !== 'monthly' ? parts.slice(0, -1).join('_') : parts[0];

  const planType = normalizePlanType(planPart);
  if (!planType) throw new Error('Invalid plan');

  return { planType, cycle };
}

const ENV_BY_PLAN_AND_CYCLE: Record<PlanType, Partial<Record<BillingCycle, string>>> = {
  starter: {
    monthly: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY',
    annual: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL',
  },
  growth: {
    monthly: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY',
    annual: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL',
  },
  enterprise: {
    monthly: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY',
    quarterly: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY',
  },
};

export function razorpaySubscriptionPlanAvailability(): Record<string, boolean> {
  return {
    starter_monthly: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY),
    growth_monthly: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY),
    enterprise_monthly: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY),
    starter_annual: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL),
    growth_annual: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL),
    enterprise_quarterly: Boolean(process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY),
  };
}

/** Returns the set of valid paid plan IDs from env. Used to detect old trial plan. */
export function getValidPaidPlanIds(): Set<string> {
  const ids = new Set<string>();
  const vars = [
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY',
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL',
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY',
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL',
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY',
    'RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY',
  ];
  for (const v of vars) {
    const id = process.env[v];
    if (id && String(id).trim()) ids.add(String(id).trim());
  }
  return ids;
}

export function getRazorpayKeys(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  return { keyId, keySecret };
}

export function createRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getRazorpayKeys();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function razorpaySubscriptionPlanIdFor(planRaw: string, cycleRaw?: unknown): string {
  const parsed = cycleRaw ? { planType: normalizePlanType(planRaw), cycle: normalizeBillingCycle(cycleRaw) } : parsePlanAndCycle(planRaw);
  const planType = (parsed as any).planType as PlanType | null;
  const cycle = (parsed as any).cycle as BillingCycle;

  if (!planType) throw new Error('Invalid plan');

  const envVar = ENV_BY_PLAN_AND_CYCLE[planType][cycle];
  if (!envVar) {
    throw new Error(`Unsupported billing cycle "${cycle}" for plan "${planType}"`);
  }

  const planId = process.env[envVar];
  if (!planId) throw new Error(`Missing Razorpay plan id env var ${envVar}`);
  return planId;
}

export function parseSubscriptionPlanKey(raw: unknown): { planType: PlanType; cycle: BillingCycle; key: string } {
  const { planType, cycle } = parsePlanAndCycle(raw);
  return { planType, cycle, key: `${planType}_${cycle}` };
}
