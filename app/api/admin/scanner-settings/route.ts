import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HEAD_ACTIVATION_ENABLED = 'scanner_activation_enabled';
const HEAD_SCANNING_ENABLED = 'scanner_scanning_enabled';
const HEAD_SSCC_SCANNING_ENABLED = 'scanner_sscc_scanning_enabled';
const HEAD_REGISTRATION_ENABLED = 'scanner_registration_enabled';

type ScannerSettings = {
  activation_enabled: boolean;
  scanning_enabled: boolean;
  sscc_scanning_enabled: boolean;
  registration_enabled: boolean;
};

async function resolveCompanyIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;

  const supabase = getSupabaseAdmin();
  const accessToken = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single();

  return company?.id ?? null;
}

async function getHeads(companyId: string): Promise<Record<string, any>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('company_active_heads')
    .select('heads')
    .eq('company_id', companyId)
    .maybeSingle();

  return (data?.heads as any) ?? {};
}

async function upsertHeads(companyId: string, nextHeads: Record<string, any>) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('company_active_heads')
    .upsert({ company_id: companyId, heads: nextHeads }, { onConflict: 'company_id' });

  if (error) throw new Error(error.message);
}

function readSettingsFromHeads(heads: Record<string, any>): ScannerSettings {
  return {
    activation_enabled:
      heads[HEAD_ACTIVATION_ENABLED] === undefined ? true : !!heads[HEAD_ACTIVATION_ENABLED],
    scanning_enabled:
      heads[HEAD_SCANNING_ENABLED] === undefined ? true : !!heads[HEAD_SCANNING_ENABLED],
    sscc_scanning_enabled:
      heads[HEAD_SSCC_SCANNING_ENABLED] === undefined ? true : !!heads[HEAD_SSCC_SCANNING_ENABLED],
    registration_enabled:
      heads[HEAD_REGISTRATION_ENABLED] === undefined ? true : !!heads[HEAD_REGISTRATION_ENABLED],
  };
}

export async function GET(req: Request) {
  try {
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const heads = await getHeads(companyId);
    const settings = readSettingsFromHeads(heads);

    return NextResponse.json({ success: true, company_id: companyId, ...settings }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const activation_enabled = body.activation_enabled;
    const scanning_enabled = body.scanning_enabled;
    const sscc_scanning_enabled = body.sscc_scanning_enabled;
    const registration_enabled = body.registration_enabled;

    if (
      activation_enabled === undefined &&
      scanning_enabled === undefined &&
      sscc_scanning_enabled === undefined &&
      registration_enabled === undefined
    ) {
      return NextResponse.json(
        { error: 'Provide at least one setting: activation_enabled, scanning_enabled, sscc_scanning_enabled, or registration_enabled' },
        { status: 400 }
      );
    }

    const heads = await getHeads(companyId);
    const nextHeads = { ...heads };

    if (activation_enabled !== undefined) {
      nextHeads[HEAD_ACTIVATION_ENABLED] = !!activation_enabled;

      // When disabling activation, immediately invalidate any currently active tokens
      if (!activation_enabled) {
        const supabase = getSupabaseAdmin();
        const { error: invalidateError } = await supabase
          .from('handset_tokens')
          .update({ used: true })
          .eq('company_id', companyId)
          .or('used.is.null,used.eq.false');

        if (invalidateError) {
          return NextResponse.json({ error: invalidateError.message }, { status: 500 });
        }
      }
    }

    if (scanning_enabled !== undefined) {
      nextHeads[HEAD_SCANNING_ENABLED] = !!scanning_enabled;
    }

    if (sscc_scanning_enabled !== undefined) {
      nextHeads[HEAD_SSCC_SCANNING_ENABLED] = !!sscc_scanning_enabled;
    }

    if (registration_enabled !== undefined) {
      nextHeads[HEAD_REGISTRATION_ENABLED] = !!registration_enabled;
    }

    await upsertHeads(companyId, nextHeads);

    const settings = readSettingsFromHeads(nextHeads);
    return NextResponse.json({ success: true, company_id: companyId, ...settings }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
