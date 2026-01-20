/**
 * Quota Balance & Rollover Management
 * 
 * Handles quota balance tracking and rollover accumulation for yearly plans.
 * Monthly plans reset quota each month, yearly plans accumulate unused quota.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { PlanType } from '@/lib/billingConfig';
import { normalizePlanType } from '@/lib/billing/period';

export type QuotaRolloverResult = {
  ok: boolean;
  unitBalance: number;
  ssccBalance: number;
  monthsElapsed: number;
  error?: string;
};

export type QuotaConsumeResult = {
  ok: boolean;
  unitBalance: number;
  ssccBalance: number;
  unitAddonBalance: number;
  ssccAddonBalance: number;
  error?: string;
};

/**
 * Apply quota rollover for yearly plans
 * 
 * For yearly plans: accumulates unused quota month-to-month
 * For monthly plans: no rollover (quota resets each month)
 * 
 * This function is idempotent and safe for concurrent calls.
 */
export async function applyQuotaRollover(
  companyId: string,
  now?: Date
): Promise<QuotaRolloverResult> {
  const supabase = getSupabaseAdmin();
  const nowDate = now || new Date();

  const { data, error } = await supabase.rpc('apply_quota_rollover', {
    p_company_id: companyId,
    p_now: nowDate.toISOString(),
  });

  if (error) {
    return {
      ok: false,
      unitBalance: 0,
      ssccBalance: 0,
      monthsElapsed: 0,
      error: error.message,
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.ok) {
    return {
      ok: false,
      unitBalance: 0,
      ssccBalance: 0,
      monthsElapsed: 0,
      error: result?.error || 'Failed to apply quota rollover',
    };
  }

  return {
    ok: true,
    unitBalance: result.unit_balance || 0,
    ssccBalance: result.sscc_balance || 0,
    monthsElapsed: result.months_elapsed || 0,
  };
}

/**
 * Consume quota from balance
 * 
 * Deducts from base balance first, then from addon balance.
 * Automatically applies rollover before consumption.
 */
export async function consumeQuotaBalance(
  companyId: string,
  kind: 'unit' | 'sscc',
  quantity: number,
  now?: Date
): Promise<QuotaConsumeResult> {
  const supabase = getSupabaseAdmin();
  const nowDate = now || new Date();

  if (quantity <= 0) {
    return {
      ok: false,
      unitBalance: 0,
      ssccBalance: 0,
      unitAddonBalance: 0,
      ssccAddonBalance: 0,
      error: 'Quantity must be positive',
    };
  }

  const { data, error } = await supabase.rpc('consume_quota_balance', {
    p_company_id: companyId,
    p_kind: kind,
    p_qty: quantity,
    p_now: nowDate.toISOString(),
  });

  if (error) {
    return {
      ok: false,
      unitBalance: 0,
      ssccBalance: 0,
      unitAddonBalance: 0,
      ssccAddonBalance: 0,
      error: error.message,
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.ok) {
    return {
      ok: false,
      unitBalance: result?.unit_balance || 0,
      ssccBalance: result?.sscc_balance || 0,
      unitAddonBalance: result?.unit_addon_balance || 0,
      ssccAddonBalance: result?.sscc_addon_balance || 0,
      error: result?.error || 'Failed to consume quota',
    };
  }

  return {
    ok: true,
    unitBalance: result.unit_balance || 0,
    ssccBalance: result.sscc_balance || 0,
    unitAddonBalance: result.unit_addon_balance || 0,
    ssccAddonBalance: result.sscc_addon_balance || 0,
  };
}

/**
 * Refund quota to balance
 * 
 * Refunds quota back to addon balance (preferred) or base balance.
 */
export async function refundQuotaBalance(
  companyId: string,
  kind: 'unit' | 'sscc',
  quantity: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  if (quantity <= 0) {
    return { ok: false, error: 'Quantity must be positive' };
  }

  const { data, error } = await supabase.rpc('refund_quota_balance', {
    p_company_id: companyId,
    p_kind: kind,
    p_qty: quantity,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.ok) {
    return { ok: false, error: result?.error || 'Failed to refund quota' };
  }

  return { ok: true };
}

/**
 * Get current quota balances
 */
export async function getQuotaBalances(companyId: string): Promise<{
  unitBalance: number;
  ssccBalance: number;
  unitAddonBalance: number;
  ssccAddonBalance: number;
  lastRolloverAt: string | null;
} | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('companies')
    .select('unit_quota_balance, sscc_quota_balance, add_on_unit_balance, add_on_sscc_balance, last_quota_rollover_at')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    unitBalance: data.unit_quota_balance || 0,
    ssccBalance: data.sscc_quota_balance || 0,
    unitAddonBalance: data.add_on_unit_balance || 0,
    ssccAddonBalance: data.add_on_sscc_balance || 0,
    lastRolloverAt: data.last_quota_rollover_at,
  };
}
