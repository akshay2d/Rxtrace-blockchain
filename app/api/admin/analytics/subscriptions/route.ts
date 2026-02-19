import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import {
  getOrGenerateCorrelationId,
  logWithContext,
  recordRouteMetric,
} from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'unknown';
  const lower = status.toLowerCase();
  if (lower === 'active') return 'active';
  if (lower === 'trial' || lower === 'trialing') return 'trial';
  if (lower === 'cancelled' || lower === 'expired') return 'churned';
  if (lower === 'paused' || lower === 'past_due' || lower === 'suspended') return lower;
  return lower;
}

export async function GET() {
  const startTime = Date.now();
  let correlationId: string | null = null;
  let userId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const adminResult = await requireAdmin();
    userId = adminResult.userId || null;
    if (adminResult.error) {
      logWithContext('warn', 'Admin analytics subscriptions access denied', {
        correlationId,
        route: '/api/admin/analytics/subscriptions',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/analytics/subscriptions', 'GET', false, Date.now() - startTime);
      return adminResult.error;
    }

    const supabase = getSupabaseAdmin();
    const { data: subscriptions, error } = await supabase
      .from('company_subscriptions')
      .select('id, status');

    if (error) throw error;

    const statusBreakdown: Record<string, number> = {};
    let activeSubscriptions = 0;
    let trialSubscriptions = 0;
    let churnedSubscriptions = 0;

    for (const subscription of subscriptions || []) {
      const normalized = normalizeStatus(subscription.status);
      statusBreakdown[normalized] = (statusBreakdown[normalized] || 0) + 1;

      if (normalized === 'active') activeSubscriptions += 1;
      if (normalized === 'trial') trialSubscriptions += 1;
      if (normalized === 'churned') churnedSubscriptions += 1;
    }

    const totalSubscriptions = subscriptions?.length || 0;
    const conversionBase = activeSubscriptions + trialSubscriptions;
    const conversionRate =
      conversionBase > 0
        ? Math.round((activeSubscriptions / conversionBase) * 10000) / 100
        : 0;
    const churnRate =
      totalSubscriptions > 0
        ? Math.round((churnedSubscriptions / totalSubscriptions) * 10000) / 100
        : 0;

    const duration = Date.now() - startTime;
    logWithContext('info', 'Admin analytics subscriptions completed', {
      correlationId,
      route: '/api/admin/analytics/subscriptions',
      method: 'GET',
      userId,
      duration,
      totalSubscriptions,
    });
    recordRouteMetric('/api/admin/analytics/subscriptions', 'GET', true, duration);

    return NextResponse.json({
      success: true,
      status_breakdown: statusBreakdown,
      total_subscriptions: totalSubscriptions,
      active_subscriptions: activeSubscriptions,
      trial_to_active_conversions: activeSubscriptions,
      conversion_rate: conversionRate,
      churned_subscriptions: churnedSubscriptions,
      churn_rate: churnRate,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin analytics subscriptions failed', {
      correlationId,
      route: '/api/admin/analytics/subscriptions',
      method: 'GET',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/analytics/subscriptions', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
