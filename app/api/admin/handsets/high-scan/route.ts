import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { resolveCompanyIdFromRequest } from '@/lib/company/resolve';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const device_fingerprint = body.device_fingerprint;
    const enabled = body.enabled;

    if (!device_fingerprint || enabled === undefined) {
      return NextResponse.json(
        { error: 'device_fingerprint and enabled are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: updated, error } = await supabase
      .from('handsets')
      .update({ high_scan_enabled: !!enabled })
      .eq('company_id', companyId)
      .eq('device_fingerprint', device_fingerprint)
      .select('id, device_fingerprint, high_scan_enabled')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: 'Handset not found' }, { status: 404 });

    return NextResponse.json({ success: true, handset: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
