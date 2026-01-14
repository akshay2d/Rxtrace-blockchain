import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type ZohoOrgId = string;

type ZohoTokenRow = {
  organization_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  api_domain: string;
};

function accountsDomain(): string {
  return process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'https://accounts.zoho.in';
}

function getZohoClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Zoho not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET)');
  }
  return { clientId, clientSecret };
}

function getZohoEnvRefreshToken(): string | null {
  const t = process.env.ZOHO_REFRESH_TOKEN;
  return t ? String(t) : null;
}

async function refreshZohoAccessTokenWithRefreshToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
  apiDomain: string;
}> {
  const { clientId, clientSecret } = getZohoClientCreds();
  const tokenUrl = new URL('/oauth/v2/token', accountsDomain());
  tokenUrl.searchParams.set('refresh_token', refreshToken);
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('grant_type', 'refresh_token');

  const resp = await fetch(tokenUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const json = (await resp.json().catch(() => null)) as any;

  if (!resp.ok || !json?.access_token) {
    throw new Error(`Zoho token refresh failed: ${json?.error ?? json?.message ?? resp.statusText}`);
  }

  const expiresInSeconds = Number(json.expires_in ?? 3600);
  const expiresAt = new Date(Date.now() + Math.max(60, expiresInSeconds) * 1000).toISOString();
  const apiDomain =
    typeof json.api_domain === 'string' && json.api_domain
      ? String(json.api_domain)
      : String(process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.in');

  return { accessToken: String(json.access_token), expiresAt, apiDomain };
}

export async function getDefaultZohoOrganizationId(): Promise<ZohoOrgId | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('zoho_organization_config')
    .select('organization_id, sync_enabled, created_at')
    .eq('sync_enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data?.organization_id) return String(data.organization_id);

  const envOrgId = process.env.ZOHO_ORGANIZATION_ID ?? process.env.ZOHO_BOOKS_ORGANIZATION_ID;
  return envOrgId ? String(envOrgId) : null;
}

async function loadZohoTokenRow(admin: any, organizationId: ZohoOrgId): Promise<ZohoTokenRow | null> {
  const { data, error } = await admin
    .from('zoho_oauth_tokens')
    .select('organization_id, access_token, refresh_token, expires_at, api_domain')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    organization_id: String((data as any).organization_id),
    access_token: String((data as any).access_token),
    refresh_token: String((data as any).refresh_token),
    expires_at: String((data as any).expires_at),
    api_domain: String((data as any).api_domain ?? 'https://www.zohoapis.in'),
  };
}

async function refreshZohoAccessTokenIfNeeded(admin: any, row: ZohoTokenRow): Promise<ZohoTokenRow> {
  const now = Date.now();
  const expiresAt = new Date(row.expires_at).getTime();
  const safetyWindowMs = 60_000;

  if (Number.isFinite(expiresAt) && expiresAt - now > safetyWindowMs) {
    return row;
  }

  const { clientId, clientSecret } = getZohoClientCreds();
  const tokenUrl = new URL('/oauth/v2/token', accountsDomain());
  tokenUrl.searchParams.set('refresh_token', row.refresh_token);
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('grant_type', 'refresh_token');

  const resp = await fetch(tokenUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const json = (await resp.json().catch(() => null)) as any;

  if (!resp.ok || !json?.access_token) {
    throw new Error(`Zoho token refresh failed: ${json?.error ?? json?.message ?? resp.statusText}`);
  }

  const expiresInSeconds = Number(json.expires_in ?? 3600);
  const nextExpiresAt = new Date(Date.now() + Math.max(60, expiresInSeconds) * 1000).toISOString();
  const nextApiDomain = typeof json.api_domain === 'string' && json.api_domain ? json.api_domain : row.api_domain;

  const { error: updErr } = await admin
    .from('zoho_oauth_tokens')
    .update({ access_token: json.access_token, expires_at: nextExpiresAt, api_domain: nextApiDomain })
    .eq('organization_id', row.organization_id);

  if (updErr) throw new Error(updErr.message);

  return {
    ...row,
    access_token: String(json.access_token),
    expires_at: nextExpiresAt,
    api_domain: String(nextApiDomain),
  };
}

export async function zohoBooksFetch(opts: {
  organizationId: ZohoOrgId;
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: any;
  headers?: Record<string, string>;
}): Promise<Response> {
  const admin = getSupabaseAdmin();
  const row = await loadZohoTokenRow(admin, opts.organizationId);

  let accessToken: string;
  let apiBase: string;

  if (row) {
    const token = await refreshZohoAccessTokenIfNeeded(admin, row);
    accessToken = token.access_token;
    apiBase = token.api_domain || 'https://www.zohoapis.in';
  } else {
    const refreshToken = getZohoEnvRefreshToken();
    if (!refreshToken) {
      throw new Error(
        `Zoho OAuth tokens not configured for organization_id=${opts.organizationId}. ` +
          `Create a row in zoho_oauth_tokens or set ZOHO_REFRESH_TOKEN (+ ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET).`
      );
    }

    const refreshed = await refreshZohoAccessTokenWithRefreshToken(refreshToken);
    accessToken = refreshed.accessToken;
    apiBase = refreshed.apiDomain;
  }
  const url = new URL(`/books/v3${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`,
    apiBase
  );

  url.searchParams.set('organization_id', opts.organizationId);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    ...(opts.headers ?? {}),
  };

  const method = (opts.method ?? 'GET').toUpperCase();
  let body: any = undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    body = headers['Content-Type'] === 'application/json' ? JSON.stringify(opts.body) : opts.body;
  }

  return fetch(url.toString(), { method, headers, body });
}
