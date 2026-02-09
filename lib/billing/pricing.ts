/**
 * lib/billing/pricing.ts
 * Single source of truth for subscription pricing from database
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Cached prices to avoid repeated DB calls
let cachedPrices: PlanPricing | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 1000; // 1 minute cache

export interface PlanPricing {
  starter: { monthly: number; yearly: number };
  growth: { monthly: number; yearly: number };
}

/**
 * Fetch current subscription prices from database
 * This is the single source of truth for subscription pricing
 */
export async function getSubscriptionPrices(): Promise<PlanPricing> {
  const now = Date.now();
  
  // Return cached prices if still valid
  if (cachedPrices && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedPrices;
  }
  
  const supabase = getSupabaseAdmin();
  
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('name, billing_cycle, base_price')
    .in('name', ['Starter', 'Growth'])
    .in('billing_cycle', ['monthly', 'yearly']);
  
  if (error || !plans) {
    console.error('Failed to fetch subscription prices from DB:', error?.message);
    return {
      starter: { monthly: 9999, yearly: 99990 },
      growth: { monthly: 29999, yearly: 299990 },
    };
  }
  
  const prices: PlanPricing = {
    starter: { monthly: 0, yearly: 0 },
    growth: { monthly: 0, yearly: 0 },
  };
  
  for (const plan of plans) {
    const name = plan.name.toLowerCase();
    const cycle = plan.billing_cycle as 'monthly' | 'yearly';
    const price = Number(plan.base_price) || 0;
    
    if (name === 'starter') {
      prices.starter[cycle] = price;
    } else if (name === 'growth') {
      prices.growth[cycle] = price;
    }
  }
  
  cachedPrices = prices;
  cacheTimestamp = now;
  
  return prices;
}

/**
 * Get price for a specific plan and billing cycle
 */
export async function getPlanPrice(
  planType: 'starter' | 'growth',
  billingCycle: 'monthly' | 'yearly'
): Promise<number> {
  const prices = await getSubscriptionPrices();
  return prices[planType]?.[billingCycle] || 0;
}

/**
 * Clear the price cache (useful after admin updates pricing)
 */
export function clearPriceCache(): void {
  cachedPrices = null;
  cacheTimestamp = 0;
}
