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
    .select("id, subscription_plan, extra_erp_integrations")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });
  if (!company?.id) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const companyId = company.id as string;
  const planType = normalizePlanType((company as any).subscription_plan);
  const baseAllowed = planType ? PRICING.plans[planType].max_integrations : 1;
  const extraAllowed = Number((company as any).extra_erp_integrations ?? 0);
  const allowed = baseAllowed + Math.max(0, extraAllowed);

  const { data: existing, error: existingErr } = await supabase
    .from("integrations")
    .select("system, api_key_secret_id")
    .eq("company_id", companyId)
    .eq("system", system)
    .maybeSingle();

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  if (!existing) {
    const { count, error: countErr } = await supabase
      .from("integrations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    const current = Number(count ?? 0);
    if (current >= allowed) {
      return NextResponse.json(
        {
          error: "ERP integration limit reached. Please purchase Additional ERP integration add-on.",
          requires_addon: true,
          addon: "erp",
          limit: allowed,
        },
        { status: 403 }
      );
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
