import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const { system, apiUrl, apiKey, syncMode } = await req.json();

  // TODO: replace with real company_id from session
  const companyId = "COMPANY_UUID_FROM_AUTH";

  // 1. Store secret in Vault
  const { data: secret, error: vaultError } =
    await supabase.rpc("vault.create_secret", {
      secret: apiKey,
      name: `integration-${companyId}-${system}`,
    });

  if (vaultError) {
    return Response.json({ error: vaultError.message }, { status: 500 });
  }

  // 2. Save reference only
  const { error } = await supabase
    .from("integrations")
    .upsert({
      company_id: companyId,
      system,
      api_url: apiUrl,
      api_key_secret_id: secret.id,
      sync_mode: syncMode,
    });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
