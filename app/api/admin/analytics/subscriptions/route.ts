import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Subscription analytics
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // Get all subscriptions with status breakdown
    const { data: subscriptions, error: subError } = await supabase
      .from('company_subscriptions')
      .select('status, created_at, trial_end, current_period_end');

    if (subError) throw subError;

    const statusCounts: Record<string, number> = {
      TRIAL: 0,
      ACTIVE: 0,
      PAUSED: 0,
      CANCELLED: 0,
      EXPIRED: 0,
    };

    let trialToActive = 0;
    let churned = 0;
    const now = new Date();

    (subscriptions || []).forEach((sub: any) => {
      statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;

      // Check if trial converted to active (has trial_end in past and status is ACTIVE)
      if (sub.status === 'ACTIVE' && sub.trial_end) {
        const trialEnd = new Date(sub.trial_end);
        if (trialEnd < now) {
          trialToActive++;
        }
      }

      // Check if churned (CANCELLED or EXPIRED)
      if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
        churned++;
      }
    });

    const total = subscriptions?.length || 0;
    const active = statusCounts.ACTIVE + statusCounts.TRIAL;
    const conversionRate = total > 0 ? (trialToActive / total) * 100 : 0;
    const churnRate = total > 0 ? (churned / total) * 100 : 0;

    return NextResponse.json({
      success: true,
      status_breakdown: statusCounts,
      total_subscriptions: total,
      active_subscriptions: active,
      trial_to_active_conversions: trialToActive,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      churned_subscriptions: churned,
      churn_rate: Math.round(churnRate * 100) / 100,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
