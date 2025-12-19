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
  const { data: { user } } = await supabaseServer().auth.getUser();
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

  return { companyId: company.id };
}

export async function POST(req: Request) {
  const auth = await requireCompanyId();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  if (rows.length > 5000) {
    return NextResponse.json({ error: "Too many rows (max 5000)" }, { status: 400 });
  }

  const payload = rows
    .map((r: any) => {
      const sku_code = normalizeSkuCode(r.sku_code ?? r.SKU_CODE);
      const sku_name = normalizeText(r.sku_name ?? r.SKU_NAME);
      if (!sku_code || !sku_name) return null;
      return {
        company_id: auth.companyId,
        sku_code,
        sku_name,
        category: normalizeText(r.category ?? r.CATEGORY),
        description: normalizeText(r.description ?? r.DESCRIPTION),
      };
    })
    .filter(Boolean) as Array<any>;

  if (payload.length === 0) {
    return NextResponse.json({ error: "No valid rows (need sku_code and sku_name)" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("skus")
    .upsert(payload, { onConflict: "company_id,sku_code", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const imported = (data ?? []).length;
  const skipped = rows.length - imported;

  return NextResponse.json({ imported, skipped });
}
