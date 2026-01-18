import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PRICING from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const system = typeof body?.system === "string" ? body.system.trim() : "";
  const apiUrl = typeof body?.apiUrl === "string" ? body.apiUrl.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : "";
  const syncMode = typeof body?.syncMode === "string" ? body.syncMode : null;

  if (!system) return NextResponse.json({ error: "system is required" }, { status: 400 });
  if (!apiUrl) return NextResponse.json({ error: "apiUrl is required" }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, subscription_plan")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });
  if (!company?.id) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const companyId = company.id as string;

  // ERP limit: 1 ERP per user_id (NOT company_id) = FREE
  // Check if user already has an ERP integration
  const { data: existing, error: existingErr } = await supabase
    .from("integrations")
    .select("system, api_key_secret_id, company_id")
    .eq("company_id", companyId)
    .eq("system", system)
    .maybeSingle();

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  // If this is a new integration (not updating existing), check user_id limit
  if (!existing) {
    // Check if user has ANY ERP integration across all companies
    // Get all companies owned by this user_id
    const { data: userCompanies, error: companiesErr } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id);

    if (companiesErr) return NextResponse.json({ error: companiesErr.message }, { status: 500 });

    const companyIds = (userCompanies || []).map((c: any) => c.id);

    if (companyIds.length > 0) {
      const { count, error: countErr } = await supabase
        .from("integrations")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds);

      if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
      
      // Limit: 1 ERP per user_id (first ERP is FREE, no additional ERPs allowed)
      const current = Number(count ?? 0);
      if (current >= 1) {
        return NextResponse.json(
          {
            error: "ERP integration limit reached. You can have only 1 ERP integration per User ID (free).",
            limit: 1,
          },
          { status: 403 }
        );
      }
    }
  }

  if (existing?.api_key_secret_id) {
    await supabase.rpc("vault.delete_secret", {
      secret_id: existing.api_key_secret_id,
    });
  }

  const { data: secret, error: vaultError } = await supabase.rpc("vault.create_secret", {
    secret: apiKey,
    name: `integration-${companyId}-${system}`,
  });

  if (vaultError) {
    return NextResponse.json({ error: vaultError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabase.from("integrations").upsert(
    {
      company_id: companyId,
      system,
      api_url: apiUrl,
      api_key_secret_id: (secret as any).id,
      sync_mode: syncMode,
      updated_at: now,
    },
    { onConflict: "company_id,system" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
