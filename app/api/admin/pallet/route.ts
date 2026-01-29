import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    const { data: pallets, error: palletErr } = await supabase
      .from("pallets")
      .select("id, sscc, sscc_with_ai, sku_id, created_at, meta")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (palletErr) {
      return NextResponse.json(
        { success: false, error: palletErr.message ?? "Failed to load pallets" },
        { status: 500 }
      );
    }

    const palletIds = (pallets ?? []).map((p: any) => p.id).filter(Boolean);
    if (palletIds.length === 0) {
      return NextResponse.json({ success: true, pallets: [] });
    }

    const { data: cartons, error: cartonErr } = await supabase
      .from("cartons")
      .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
      .in("pallet_id", palletIds)
      .order("created_at", { ascending: true });

    if (cartonErr) {
      return NextResponse.json(
        { success: false, error: cartonErr.message ?? "Failed to load cartons" },
        { status: 500 }
      );
    }

    const cartonIds = (cartons ?? []).map((c: any) => c.id).filter(Boolean);
    const { data: boxes, error: boxErr } = cartonIds.length
      ? await supabase
          .from("boxes")
          .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
          .in("carton_id", cartonIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null as any };

    if (boxErr) {
      return NextResponse.json(
        { success: false, error: boxErr.message ?? "Failed to load boxes" },
        { status: 500 }
      );
    }

    const boxIds = (boxes ?? []).map((b: any) => b.id).filter(Boolean);
    const { data: units, error: unitErr } = boxIds.length
      ? await supabase
          .from("labels_units")
          .select("id, box_id, serial, created_at")
          .in("box_id", boxIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null as any };

    if (unitErr) {
      return NextResponse.json(
        { success: false, error: unitErr.message ?? "Failed to load units" },
        { status: 500 }
      );
    }

    const unitsByBox = new Map<string, any[]>();
    for (const u of units ?? []) {
      const key = (u as any).box_id;
      if (!key) continue;
      const list = unitsByBox.get(key) ?? [];
      list.push({
        uid: (u as any).serial,
        id: (u as any).id,
        created_at: (u as any).created_at,
      });
      unitsByBox.set(key, list);
    }

    const boxesByCarton = new Map<string, any[]>();
    for (const b of boxes ?? []) {
      const key = (b as any).carton_id;
      if (!key) continue;
      const list = boxesByCarton.get(key) ?? [];
      list.push({
        ...(b as any),
        units: unitsByBox.get((b as any).id) ?? [],
      });
      boxesByCarton.set(key, list);
    }

    const cartonsByPallet = new Map<string, any[]>();
    for (const c of cartons ?? []) {
      const key = (c as any).pallet_id;
      if (!key) continue;
      const list = cartonsByPallet.get(key) ?? [];
      list.push({
        ...(c as any),
        boxes: boxesByCarton.get((c as any).id) ?? [],
      });
      cartonsByPallet.set(key, list);
    }

    const output = (pallets ?? []).map((p: any) => ({
      ...(p as any),
      cartons: cartonsByPallet.get((p as any).id) ?? [],
    }));

    return NextResponse.json({ success: true, pallets: output });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
