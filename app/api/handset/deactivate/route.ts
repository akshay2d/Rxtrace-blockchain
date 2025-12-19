import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function POST(req: Request) {
  try {
    const { handset_id } = await req.json();

    if (!handset_id) {
      return NextResponse.json({ error: "handset_id required" }, { status: 400 });
    }

    const { data: handset, error } = await supabase
      .from("handsets")
      .update({ status: "INACTIVE" })
      .eq("id", handset_id)
      .select()
      .single();

    if (error || !handset) {
      return NextResponse.json({ error: error?.message || "Handset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, handset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
