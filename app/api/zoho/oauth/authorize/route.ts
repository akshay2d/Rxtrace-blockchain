import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/zoho/oauth/authorize
 * 
 * Redirects admin user to Zoho OAuth consent screen.
 * After consent, Zoho redirects back to /api/zoho/oauth/callback
 */
export async function GET(req: Request) {
  try {
    // Only allow authenticated admins
    const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (you may want to verify admin role here)
    // For now, we allow any authenticated user for initial setup

    const clientId = process.env.ZOHO_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: 'ZOHO_CLIENT_ID not configured' }, { status: 500 });
    }

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/zoho/oauth/callback`;

    const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'https://accounts.zoho.in';

    const authUrl = new URL('/oauth/v2/auth', accountsDomain);
    authUrl.searchParams.set('scope', 'ZohoBooks.fullaccess.all');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return NextResponse.redirect(authUrl.toString());
  } catch (err) {
    console.error('Zoho OAuth authorize error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
