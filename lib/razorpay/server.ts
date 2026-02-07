import Razorpay from 'razorpay';
import { normalizePlanType } from '@/lib/billing/period';
import type { PlanType } from '@/lib/billingConfig';

// Razorpay only supports monthly and yearly billing cycles
export type BillingCycle = 'monthly' | 'yearly';

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

function normalizeBillingCycle(raw: unknown): BillingCycle {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'annual' || value === 'year' || value === 'yearly') return 'yearly';
  // Quarterly is not supported by Razorpay - default to monthly
  return 'monthly';
}

function parsePlanAndCycle(raw: unknown): { planType: PlanType; cycle: BillingCycle } {
  const value = String(raw ?? '').trim().toLowerCase();
  const parts = value.split(/[_-]/g).filter(Boolean);

  const maybeCycle = parts.length > 1 ? parts[parts.length - 1] : null;
  const cycle = maybeCycle ? normalizeBillingCycle(maybeCycle) : 'monthly';
  const planPart =
    parts.length > 1 && cycle !== 'monthly' ? parts.slice(0, -1).join('_') : parts[0];

  const planType = normalizePlanType(planPart);
  if (!planType) throw new Error('Invalid plan');

  return { planType, cycle };
}

/* ---------------------------------- */
/* Razorpay Plan IDs (FROM ENV)        */
/* ---------------------------------- */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const APPROVED_RAZORPAY_PLAN_IDS: Record<
  'starter' | 'growth',
  Record<BillingCycle, string>
> = {
  starter: {
    monthly: requiredEnv('RAZORPAY_PLAN_STARTER_MONTHLY'),
    yearly: requiredEnv('RAZORPAY_PLAN_STARTER_YEARLY'),
  },
  growth: {
    monthly: requiredEnv('RAZORPAY_PLAN_GROWTH_MONTHLY'),
    yearly: requiredEnv('RAZORPAY_PLAN_GROWTH_YEARLY'),
  },
};

const APPROVED_PLAN_ID_SET = new Set<string>(
  Object.values(APPROVED_RAZORPAY_PLAN_IDS)
    .flatMap((p) => Object.values(p))
);

/* ---------------------------------- */
/* Plan Normalizers                    */
/* ---------------------------------- */

function normalizePlanTypeFromName(name: unknown): PlanType | null {
  const value = String(name ?? '').trim().toLowerCase();
  if (value.includes('starter')) return 'starter';
  if (value.includes('growth')) return 'growth';
  return null;
}

function normalizeBillingCycleFromName(name: unknown): BillingCycle {
  const value = String(name ?? '').trim().toLowerCase();
  if (value.includes('year') || value.includes('yearly')) return 'yearly';
  // Quarterly not supported - default to monthly
  return 'monthly';
}

/* ---------------------------------- */
/* Public APIs                         */
/* ---------------------------------- */

export function razorpaySubscriptionPlanAvailability(): Record<string, boolean> {
  return {
    starter_monthly: true,
    starter_yearly: true,
    growth_monthly: true,
    growth_yearly: true,
  };
}

export function getValidPaidPlanIds(): Set<string> {
  return new Set(APPROVED_PLAN_ID_SET);
}

export function isApprovedRazorpayPlanId(planId: unknown): boolean {
  const value = String(planId ?? '').trim();
  return value.length > 0 && APPROVED_PLAN_ID_SET.has(value);
}

export function approvedRazorpayPlanIdForName(
  name: unknown,
  billingCycle?: unknown
): string | null {
  const planType = normalizePlanTypeFromName(name);
  if (!planType) return null;

  const cycle = billingCycle
    ? normalizeBillingCycle(billingCycle)
    : normalizeBillingCycleFromName(name);

  return APPROVED_RAZORPAY_PLAN_IDS[planType]?.[cycle] ?? null;
}

/* ---------------------------------- */
/* Razorpay Client                     */
/* ---------------------------------- */

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

/* ---------------------------------- */
/* Subscription Resolution             */
/* ---------------------------------- */

export function razorpaySubscriptionPlanIdFor(
  planRaw: string,
  cycleRaw?: unknown
): string {
  const parsed = cycleRaw
    ? { planType: normalizePlanType(planRaw), cycle: normalizeBillingCycle(cycleRaw) }
    : parsePlanAndCycle(planRaw);

  const { planType, cycle } = parsed as { planType: PlanType | null; cycle: BillingCycle };

  if (!planType) throw new Error('Invalid plan');

  const planId = APPROVED_RAZORPAY_PLAN_IDS[planType]?.[cycle];
  if (!planId) {
    throw new Error(`Missing approved Razorpay plan id for ${planType} ${cycle}`);
  }

  return planId;
}

export function parseSubscriptionPlanKey(
  raw: unknown
): { planType: PlanType; cycle: BillingCycle; key: string } {
  const { planType, cycle } = parsePlanAndCycle(raw);
  return { planType, cycle, key: `${planType}_${cycle}` };
}


