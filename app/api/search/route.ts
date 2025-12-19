import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  // 1) Pallet
  const { data: pallet } = await supabase
    .from("pallets")
    .select("*, cartons(*)")
    .eq("sscc", code)
    .single();
  if (pallet) return NextResponse.json({ type: "pallet", data: pallet });

  // 2) Carton
  const { data: carton } = await supabase
    .from("cartons")
    .select("*, pallet:pallets(*)")
    .eq("code", code)
    .single();
  if (carton) return NextResponse.json({ type: "carton", data: carton });

  // 3) Box/Unit not yet implemented
  return NextResponse.json({ error: "Not found (Box/Unit level not yet implemented)" }, { status: 404 });
}
