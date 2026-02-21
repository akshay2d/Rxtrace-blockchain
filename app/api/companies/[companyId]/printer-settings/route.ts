import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyIdFromRequest } from '@/lib/company/resolve';

export async function GET(
  req: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (params.companyId !== companyIdFromAuth) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data: company } = await admin
      .from('companies')
      .select('print_format, printer_type, printer_identifier')
      .eq('id', companyIdFromAuth)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({
      print_format: company.print_format || 'PDF',
      printer_type: company.printer_type || 'thermal',
      printer_identifier: company.printer_identifier || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load printer settings' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (params.companyId !== companyIdFromAuth) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { print_format, printer_type, printer_identifier } = body;

    if (!print_format || !['PDF', 'EPL', 'ZPL'].includes(print_format)) {
      return NextResponse.json({ error: 'Invalid print_format. Must be PDF, EPL, or ZPL' }, { status: 400 });
    }

    if (printer_type && !['thermal', 'laser', 'generic'].includes(printer_type)) {
      return NextResponse.json({ error: 'Invalid printer_type. Must be thermal, laser, or generic' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('companies')
      .update({
        print_format,
        printer_type: printer_type || 'thermal',
        printer_identifier: printer_identifier || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyIdFromAuth);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to save printer settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save printer settings' }, { status: 500 });
  }
}
