import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { apiKey } = await req.json();

  // TODO: replace with real company_id from auth/session
  const companyId = "COMPANY_UUID_FROM_AUTH";

  /* 1️⃣ Fetch existing integration */
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("api_key_secret_id, system")
    .eq("company_id", companyId)
    .single();

  if (error || !integration) {
    return Response.json({ error: "Integration not found" }, { status: 404 });
  }

  /* 2️⃣ Delete old secret */
  await supabase.rpc("vault.delete_secret", {
    secret_id: integration.api_key_secret_id,
  });

  /* 3️⃣ Create new secret */
  const { data: secret, error: vaultError } =
    await supabase.rpc("vault.create_secret", {
      secret: apiKey,
      name: `integration-${companyId}-${integration.system}`,
    });

  if (vaultError) {
    return Response.json({ error: vaultError.message }, { status: 500 });
  }

  /* 4️⃣ Update DB reference */
  await supabase
    .from("integrations")
    .update({
      api_key_secret_id: secret.id,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);

  return Response.json({ success: true });
}
