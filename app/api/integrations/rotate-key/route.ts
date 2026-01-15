import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();

  const {
    data: { user },
    error: authError,
  } = await (await supabaseServer()).auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : "";

  if (!apiKey) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  if (!company?.id) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const companyId = company.id as string;

  /* 1️⃣ Fetch existing integration */
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("api_key_secret_id, system")
    .eq("company_id", companyId)
    .single();

  if (error || !integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
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
    return NextResponse.json({ error: vaultError.message }, { status: 500 });
  }

  /* 4️⃣ Update DB reference */
  await supabase
    .from("integrations")
    .update({
      api_key_secret_id: secret.id,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);

  return NextResponse.json({ success: true });
}
