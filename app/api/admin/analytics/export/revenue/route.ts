import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Export revenue data as CSV
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const months = parseInt(searchParams.get('months') || '12', 10);

    // Get subscriptions with plans
    const { data: subscriptions, error: subError } = await supabase
      .from('company_subscriptions')
      .select(`
        id,
        status,
        created_at,
        subscription_plans!inner(
          name,
          billing_cycle,
          base_price
        ),
        companies!inner(company_name)
      `)
      .in('status', ['ACTIVE', 'TRIAL', 'PAUSED', 'CANCELLED']);

    if (subError) throw subError;

    // Calculate monthly revenue for each subscription
    const revenueRows: Array<{
      company_name: string;
      plan_name: string;
      billing_cycle: string;
      monthly_revenue: number;
      status: string;
      created_at: string;
    }> = [];

    (subscriptions || []).forEach((sub: any) => {
      const plan = sub.subscription_plans;
      if (!plan) return;

      const price = Number(plan.base_price || 0);
      let monthlyRevenue = 0;
      if (plan.billing_cycle === 'monthly') {
        monthlyRevenue = price;
      } else if (plan.billing_cycle === 'yearly') {
        monthlyRevenue = price / 12;
      }

      revenueRows.push({
        company_name: sub.companies?.company_name || '',
        plan_name: plan.name || '',
        billing_cycle: plan.billing_cycle || '',
        monthly_revenue: monthlyRevenue,
        status: sub.status || '',
        created_at: sub.created_at || '',
      });
    });

    if (format === 'csv') {
      const headers = ['Company Name', 'Plan Name', 'Billing Cycle', 'Monthly Revenue', 'Status', 'Created At'];
      const rows = revenueRows.map((row) => [
        row.company_name,
        row.plan_name,
        row.billing_cycle,
        row.monthly_revenue.toFixed(2),
        row.status,
        row.created_at,
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((r: any[]) => r.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="revenue_export_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: revenueRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
