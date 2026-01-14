import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/zoho/oauth/callback
 * 
 * Handles Zoho OAuth callback after user consents.
 * Exchanges authorization code for tokens and stores them.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${url.origin}/admin/billing?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${url.origin}/admin/billing?error=no_code`);
    }

    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${url.origin}/admin/billing?error=zoho_not_configured`);
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/zoho/oauth/callback`;
    const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'https://accounts.zoho.in';

    // Exchange code for tokens
    const tokenUrl = new URL('/oauth/v2/token', accountsDomain);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('grant_type', 'authorization_code');

    const tokenResp = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const tokenJson = (await tokenResp.json().catch(() => null)) as any;

    if (!tokenResp.ok || !tokenJson?.access_token) {
      const errMsg = tokenJson?.error ?? tokenJson?.message ?? 'token_exchange_failed';
      return NextResponse.redirect(`${url.origin}/admin/billing?error=${encodeURIComponent(errMsg)}`);
    }

    const accessToken = String(tokenJson.access_token);
    const refreshToken = String(tokenJson.refresh_token ?? '');
    const expiresIn = Number(tokenJson.expires_in ?? 3600);
    const apiDomain = String(tokenJson.api_domain ?? 'https://www.zohoapis.in');

    if (!refreshToken) {
      return NextResponse.redirect(`${url.origin}/admin/billing?error=no_refresh_token`);
    }

    // Fetch organization info from Zoho Books
    const orgsResp = await fetch(`${apiDomain}/books/v3/organizations`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    const orgsJson = (await orgsResp.json().catch(() => null)) as any;

    const organizations = Array.isArray(orgsJson?.organizations) ? orgsJson.organizations : [];
    if (organizations.length === 0) {
      return NextResponse.redirect(`${url.origin}/admin/billing?error=no_organizations`);
    }

    // Use the first (or primary) organization
    const primaryOrg = organizations.find((o: any) => o.is_default_org) ?? organizations[0];
    const organizationId = String(primaryOrg.organization_id);
    const organizationName = String(primaryOrg.name ?? 'RxTrace Organization');
    const currencyCode = String(primaryOrg.currency_code ?? 'INR');
    const currencySymbol = String(primaryOrg.currency_symbol ?? '₹');

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const admin = getSupabaseAdmin();

    // Upsert OAuth tokens
    const { error: tokenErr } = await admin
      .from('zoho_oauth_tokens')
      .upsert({
        organization_id: organizationId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        api_domain: apiDomain,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' });

    if (tokenErr) {
      console.error('Failed to store Zoho tokens:', tokenErr);
      return NextResponse.redirect(`${url.origin}/admin/billing?error=db_error`);
    }

    // Upsert organization config
    const { error: orgErr } = await admin
      .from('zoho_organization_config')
      .upsert({
        organization_id: organizationId,
        organization_name: organizationName,
        currency_code: currencyCode,
        currency_symbol: currencySymbol,
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' });

    if (orgErr) {
      console.error('Failed to store Zoho org config:', orgErr);
    }

    return NextResponse.redirect(`${url.origin}/admin/billing?zoho=connected&org=${encodeURIComponent(organizationName)}`);
  } catch (err) {
    console.error('Zoho OAuth callback error:', err);
    const url = new URL(req.url);
    return NextResponse.redirect(`${url.origin}/admin/billing?error=${encodeURIComponent(String(err))}`);
  }
}
