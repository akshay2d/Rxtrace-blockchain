import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Export subscription status report as CSV
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';

    // Get all subscriptions with company and plan info
    const { data: subscriptions, error: subError } = await supabase
      .from('company_subscriptions')
      .select(`
        id,
        status,
        trial_end,
        current_period_end,
        created_at,
        subscription_plans!inner(
          name,
          billing_cycle,
          base_price
        ),
        companies!inner(company_name)
      `)
      .order('created_at', { ascending: false });

    if (subError) throw subError;

    const reportRows: Array<{
      company_name: string;
      plan_name: string;
      billing_cycle: string;
      status: string;
      trial_end: string | null;
      current_period_end: string | null;
      created_at: string;
    }> = [];

    (subscriptions || []).forEach((sub: any) => {
      const plan = sub.subscription_plans;
      reportRows.push({
        company_name: sub.companies?.company_name || '',
        plan_name: plan?.name || '',
        billing_cycle: plan?.billing_cycle || '',
        status: sub.status || '',
        trial_end: sub.trial_end || null,
        current_period_end: sub.current_period_end || null,
        created_at: sub.created_at || '',
      });
    });

    if (format === 'csv') {
      const headers = [
        'Company Name',
        'Plan Name',
        'Billing Cycle',
        'Status',
        'Trial End',
        'Current Period End',
        'Created At',
      ];
      const rows = reportRows.map((row) => [
        row.company_name,
        row.plan_name,
        row.billing_cycle,
        row.status,
        row.trial_end || '',
        row.current_period_end || '',
        row.created_at,
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((r: any[]) => r.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="subscriptions_export_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: reportRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
