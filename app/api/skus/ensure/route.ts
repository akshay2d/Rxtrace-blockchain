import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } }
);

function normalizeSkuCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeText(value: unknown) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

async function requireCompanyId() {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (error || !company?.id) {
    return { error: NextResponse.json({ error: "Company profile not found" }, { status: 400 }) };
  }

  return { companyId: company.id, userId: user.id };
}

// Idempotent SKU ensure endpoint for user flows (manual generation + CSV)
export async function POST(req: Request) {
  const auth = await requireCompanyId();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const sku_code = normalizeSkuCode(body.sku_code);
  const sku_name = normalizeText(body.sku_name);

  if (!sku_code) {
    return NextResponse.json({ error: "sku_code is required" }, { status: 400 });
  }

  const { data: sku, error } = await supabaseAdmin
    .from("skus")
    .upsert(
      {
        company_id: auth.companyId,
        sku_code,
        sku_name,
        deleted_at: null,
      },
      { onConflict: "company_id,sku_code" }
    )
    .select("id, company_id, sku_code, sku_name, category, description, created_at, updated_at")
    .single();

  if (error || !sku) {
    return NextResponse.json({ error: error?.message ?? "Failed to ensure SKU" }, { status: 400 });
  }

  return NextResponse.json({ sku });
}
