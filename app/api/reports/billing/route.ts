import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  const {
    data: { user },
    error: authError,
  } = await (await supabaseServer()).auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  let query = supabase
    .from("scan_events")
    .select("scan_level, created_at")
    .eq("company_id", companyId);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  /* ==============================
     AGGREGATE USAGE ONLY
     ============================== */

  const summary: Record<string, number> = {};

  for (const row of data || []) {
    const level = row.scan_level;
    summary[level] = (summary[level] || 0) + 1;
  }

  /* ==============================
     CSV EXPORT (NO PRICING)
     ============================== */

  const csv = [
    "Scan Level,Total Scans",
    ...Object.entries(summary).map(
      ([level, count]) => `"${level}","${count}"`
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=usage_summary.csv",
    },
  });
}
