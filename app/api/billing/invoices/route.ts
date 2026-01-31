import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 100);
    const status = url.searchParams.get('status');

    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }
    if (!company?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    let query = supabase
      .from('billing_invoices')
      .select('id, company_id, plan, period_start, period_end, amount, currency, status, paid_at, reference, created_at, updated_at, tax_rate, tax_amount, has_gst, gst_number, discount_type, discount_value, discount_amount, billing_cycle')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
