import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(req: Request) {
  try {
    const adminResult = await requireAdmin();
    if (adminResult.error) return adminResult.error;

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'csv').toLowerCase();
    if (format !== 'csv') {
      return NextResponse.json({ success: false, error: 'Only csv format is supported' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('company_subscriptions')
      .select(
        `
          id,
          company_id,
          status,
          started_at,
          current_period_start,
          current_period_end,
          created_at,
          updated_at
        `
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = data || [];
    const headers = [
      'id',
      'company_id',
      'status',
      'started_at',
      'current_period_start',
      'current_period_end',
      'created_at',
      'updated_at',
    ];

    const csvLines = [
      headers.join(','),
      ...rows.map((row: any) =>
        headers.map((key) => escapeCsv(row[key])).join(',')
      ),
    ];

    const csv = csvLines.join('\n');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="subscriptions-${timestamp}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to export subscriptions' },
      { status: 500 }
    );
  }
}
