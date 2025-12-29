import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  // TODO: replace with company_id from auth/session
  const companyId = "COMPANY_UUID_FROM_AUTH";

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
