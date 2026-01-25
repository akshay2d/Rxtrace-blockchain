import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Usage analytics
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get('company_id');
    const metric_type = searchParams.get('metric_type');
    const months = parseInt(searchParams.get('months') || '6', 10);

    // Usage by company
    if (company_id) {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - months);
      periodStart.setDate(1);

      let query = supabase
        .from('usage_counters')
        .select('metric_type, period_start, used_quantity, companies!inner(company_name)')
        .eq('company_id', company_id)
        .gte('period_start', periodStart.toISOString().split('T')[0])
        .order('period_start', { ascending: false });

      if (metric_type) {
        query = query.eq('metric_type', metric_type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return NextResponse.json({
        success: true,
        usage: data || [],
      });
    }

    // Aggregate usage across all companies
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - months);
    periodStart.setDate(1);

    let query = supabase
      .from('usage_counters')
      .select('metric_type, period_start, used_quantity, company_id')
      .gte('period_start', periodStart.toISOString().split('T')[0]);

    if (metric_type) {
      query = query.eq('metric_type', metric_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Aggregate by metric type and period
    const aggregated: Record<string, Record<string, number>> = {};
    (data || []).forEach((row: any) => {
      const key = `${row.metric_type}_${row.period_start}`;
      if (!aggregated[key]) {
        aggregated[key] = { metric_type: row.metric_type, period_start: row.period_start, total: 0, companies: 0 };
      }
      aggregated[key].total += row.used_quantity || 0;
      aggregated[key].companies += 1;
    });

    // Get top companies by usage (current period)
    const now = new Date();
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: topCompaniesData } = await supabase
      .from('usage_counters')
      .select(`
        company_id,
        used_quantity,
        companies!inner(company_name)
      `)
      .eq('period_start', currentPeriodStart.toISOString().split('T')[0])
      .order('used_quantity', { ascending: false })
      .limit(20);

    // Aggregate by company
    const companyUsage: Record<string, { company_name: string; total_usage: number }> = {};
    (topCompaniesData || []).forEach((row: any) => {
      const companyId = row.company_id;
      if (!companyUsage[companyId]) {
        companyUsage[companyId] = {
          company_name: row.companies?.company_name || '',
          total_usage: 0,
        };
      }
      companyUsage[companyId].total_usage += row.used_quantity || 0;
    });

    const topCompanies = Object.values(companyUsage)
      .sort((a, b) => b.total_usage - a.total_usage)
      .slice(0, 20);

    return NextResponse.json({
      success: true,
      aggregated: Object.values(aggregated),
      total_events: data?.length || 0,
      top_companies: topCompanies,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
