import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUsage, getUsageLimits } from '@/lib/usage/tracking';
import { getSeatLimits } from '@/lib/usage/seats';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Company usage details
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    const company_id = params.id;

    // Get current period usage
    const usage = await getCurrentUsage(supabase, company_id);
    
    // Get limits
    const limits = await getUsageLimits(supabase, company_id);

    // Get seat limits
    const seats = await getSeatLimits(supabase, company_id);

    // Get historical usage (last 6 months)
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - 6);
    periodStart.setDate(1);

    const { data: historical, error: histError } = await supabase
      .from('usage_counters')
      .select('metric_type, period_start, used_quantity')
      .eq('company_id', company_id)
      .gte('period_start', periodStart.toISOString().split('T')[0])
      .order('period_start', { ascending: false });

    if (histError) throw histError;

    // Format usage with limits
    const usageWithLimits: Record<string, any> = {};
    Object.keys(usage).forEach((metricType) => {
      const limit = limits[metricType];
      usageWithLimits[metricType] = {
        used: usage[metricType] || 0,
        limit_value: limit?.limit_value || null,
        limit_type: limit?.limit_type || 'NONE',
        exceeded: limit?.limit_value ? (usage[metricType] || 0) > limit.limit_value : false,
      };
    });

    return NextResponse.json({
      success: true,
      current_period: {
        usage: usageWithLimits,
      },
      seats: {
        max_seats: seats.max_seats,
        used_seats: seats.used_seats,
        available_seats: seats.available_seats,
        seats_from_plan: seats.seats_from_plan,
        seats_from_addons: seats.seats_from_addons,
      },
      historical: historical || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
