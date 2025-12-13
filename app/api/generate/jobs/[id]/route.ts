import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "job id required" }, { status: 400 });

    // fetch job
    const { data: job, error: jobErr } = await supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (jobErr || !job) return NextResponse.json({ error: "job not found" }, { status: 404 });

    // fetch pallets created for this job by matching packing_rule_id and created_at time window
    // (we didn't link job id to pallets table; use packing_rule + created_at approx)
    const { data: pallets } = await supabase
      .from("pallets")
      .select("id, sscc, sscc_with_ai, created_at")
      .eq("packing_rule_id", job.packing_rule_id)
      .gte("created_at", job.created_at)
      .lte("created_at", job.updated_at);

    // fetch counts for cartons/boxes/strips by job's SKUs and time range
    const { data: cartonsCount } = await supabase
      .from("cartons")
      .select("count", { count: "exact", head: true })
      .eq("sku_id", job.sku_id)
      .gte("created_at", job.created_at)
      .lte("created_at", job.updated_at);

    const { data: boxesCount } = await supabase
      .from("boxes")
      .select("count", { count: "exact", head: true })
      .eq("company_id", job.company_id)
      .gte("created_at", job.created_at)
      .lte("created_at", job.updated_at);

    const { data: stripsCount } = await supabase
      .from("strips_map")
      .select("count", { count: "exact", head: true })
      .eq("sku_id", job.sku_id)
      .gte("created_at", job.created_at)
      .lte("created_at", job.updated_at);

    return NextResponse.json({
      job,
      pallets: pallets ?? [],
      counts: {
        cartons: cartonsCount ? Number(cartonsCount) : null,
        boxes: boxesCount ? Number(boxesCount) : null,
        strips: stripsCount ? Number(stripsCount) : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
