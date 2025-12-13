import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

/**
 * Query params:
 *  - company_id (required)
 *  - limit (optional, default 50)
 *  - offset (optional, default 0)
 *  - status (optional)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const status = url.searchParams.get("status") ?? null;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    let query = supabase
      .from("generation_jobs")
      .select("id, request_id, sku_id, packing_rule_id, total_strips, expected_boxes, expected_cartons, expected_pallets, status, error_text, created_at, updated_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = (query as any).eq("status", status);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error }, { status: 500 });

    // total count (lightweight)
    const { count, error: cErr } = await supabase
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);

    if (cErr) {
      // not fatal — return data without total
      return NextResponse.json({ jobs: data, total: null });
    }

    return NextResponse.json({ jobs: data, total: Number(count) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
