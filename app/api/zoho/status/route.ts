import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/zoho/status
 * 
 * Returns Zoho Books integration status
 */
export async function GET() {
  try {
    const { data: { user }, error: authErr } = await supabaseServer().auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Check for Zoho configuration
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const envConfigured = Boolean(clientId && clientSecret);

    // Check for stored OAuth tokens
    const { data: tokens, error: tokenErr } = await admin
      .from('zoho_oauth_tokens')
      .select('organization_id, expires_at, api_domain, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check for organization config
    const { data: orgConfig } = await admin
      .from('zoho_organization_config')
      .select('organization_id, organization_name, currency_code, sync_enabled, updated_at')
      .eq('sync_enabled', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasTokens = Boolean(tokens?.organization_id);
    const isExpired = tokens?.expires_at ? new Date(tokens.expires_at).getTime() < Date.now() : true;

    return NextResponse.json({
      configured: envConfigured,
      connected: hasTokens && !isExpired,
      organization: orgConfig ? {
        id: orgConfig.organization_id,
        name: orgConfig.organization_name,
        currency: orgConfig.currency_code,
        syncEnabled: orgConfig.sync_enabled,
      } : null,
      tokenStatus: hasTokens ? (isExpired ? 'expired' : 'valid') : 'missing',
      lastUpdated: tokens?.updated_at ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
