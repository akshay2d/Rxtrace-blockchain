import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Export usage data as CSV
export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const company_id = searchParams.get('company_id');
    const metric_type = searchParams.get('metric_type');
    const months = parseInt(searchParams.get('months') || '6', 10);

    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - months);
    periodStart.setDate(1);

    let query = supabase
      .from('usage_counters')
      .select(`
        metric_type,
        period_start,
        used_quantity,
        companies!inner(company_name)
      `)
      .gte('period_start', periodStart.toISOString().split('T')[0])
      .order('period_start', { ascending: false });

    if (company_id) {
      query = query.eq('company_id', company_id);
    }
    if (metric_type) {
      query = query.eq('metric_type', metric_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Company Name', 'Metric Type', 'Period Start', 'Used Quantity'];
      const rows = (data || []).map((row: any) => [
        row.companies?.company_name || '',
        row.metric_type || '',
        row.period_start || '',
        row.used_quantity || 0,
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((r: any[]) => r.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="usage_export_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
