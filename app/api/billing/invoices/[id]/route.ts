import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(supabase, user.id, 'id');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const { data: invoice, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('id', id)
      .eq('company_id', resolved.companyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
