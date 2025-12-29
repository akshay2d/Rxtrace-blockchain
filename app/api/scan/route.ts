import { NextResponse } from "next/server";
import { billingConfig } from "@/app/lib/billingConfig";
import { parseGS1 } from "@/lib/parseGS1";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function buildHierarchyForPallet(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  palletId: string;
}) {
  const { supabase, palletId } = opts;

  const { data: pallet } = await supabase
    .from("pallets")
    .select("id, sscc, sscc_with_ai, sku_id, created_at, meta")
    .eq("id", palletId)
    .maybeSingle();
  if (!pallet?.id) return null;

  const { data: cartons } = await supabase
    .from("cartons")
    .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
    .eq("pallet_id", palletId)
    .order("created_at", { ascending: true });

  const cartonIds = (cartons ?? []).map((c: any) => c.id).filter(Boolean);
  const { data: boxes } = cartonIds.length
    ? await supabase
        .from("boxes")
        .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
        .in("carton_id", cartonIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };

  const boxIds = (boxes ?? []).map((b: any) => b.id).filter(Boolean);
  const { data: units } = boxIds.length
    ? await supabase
        .from("labels_units")
        .select("id, box_id, serial, created_at")
        .in("box_id", boxIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };

  const unitsByBox = new Map<string, any[]>();
  for (const u of units ?? []) {
    const key = (u as any).box_id;
    if (!key) continue;
    const list = unitsByBox.get(key) ?? [];
    list.push({ uid: (u as any).serial, id: (u as any).id, created_at: (u as any).created_at });
    unitsByBox.set(key, list);
  }

  const boxesByCarton = new Map<string, any[]>();
  for (const b of boxes ?? []) {
    const key = (b as any).carton_id;
    if (!key) continue;
    const list = boxesByCarton.get(key) ?? [];
    list.push({ ...(b as any), units: unitsByBox.get((b as any).id) ?? [] });
    boxesByCarton.set(key, list);
  }

  const cartonsWithChildren = (cartons ?? []).map((c: any) => ({
    ...(c as any),
    boxes: boxesByCarton.get((c as any).id) ?? [],
  }));

  return { ...(pallet as any), cartons: cartonsWithChildren };
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { raw, handset_id, company_id } = await req.json();

    if (!raw || !handset_id || !company_id) {
      return NextResponse.json(
        { success: false, error: "Missing raw | handset_id | company_id" },
        { status: 400 }
      );
    }

    /* ------------------------------------------------
       1️⃣ Validate handset
    ------------------------------------------------ */
    const { data: handset } = await supabase
      .from("handsets")
      .select("*")
      .eq("id", handset_id)
      .single();

    if (!handset || handset.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Handset not active" },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       2️⃣ Check company paid scan module
    ------------------------------------------------ */
    const { data: headsRow } = await supabase
      .from("company_active_heads")
      .select("*")
      .eq("company_id", company_id)
      .single();

    const heads = headsRow?.heads as any;
    if (!heads || heads.high_scan !== true) {
      return NextResponse.json(
        { success: false, error: "Scan module not enabled" },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       2️⃣b Master switch: scanning_enabled
       This is separate from activation/token generation.
    ------------------------------------------------ */
    const scanningEnabled =
      heads?.scanner_scanning_enabled === undefined ? true : !!heads.scanner_scanning_enabled;
    if (!scanningEnabled) {
      return NextResponse.json(
        { success: false, error: 'Scanning disabled by admin' },
        { status: 403 }
      );
    }

     /* ------------------------------------------------
       3️⃣ Parse GS1 payload
     ------------------------------------------------ */
    const data = parseGS1(raw);
    const hasIdentifiers = !!data?.sscc || !!data?.serialNo;
    if (!hasIdentifiers) {
      return NextResponse.json(
        { success: false, error: "Invalid GS1 payload (missing SSCC/Serial)" },
        { status: 400 }
      );
    }

    /* ------------------------------------------------
       4️⃣ Enforce HIGH-SCAN for SSCC (AI 00)
    ------------------------------------------------ */
    if (data.sscc && !handset.high_scan_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "High-scan permission required for box/carton/pallet"
        },
        { status: 403 }
      );
    }

    /* ------------------------------------------------
       5️⃣ Resolve hierarchy
    ------------------------------------------------ */
    let level: "unit" | "box" | "carton" | "pallet" | null = null;
    let result: any = null;

    if (data.sscc) {
      // 1) Pallet by SSCC
      const { data: palletRow } = await supabase
        .from("pallets")
        .select("id")
        .eq("company_id", company_id)
        .eq("sscc", data.sscc)
        .maybeSingle();

      if (palletRow?.id) {
        result = await buildHierarchyForPallet({ supabase, palletId: palletRow.id });
        level = "pallet";
      }

      // 2) Carton by SSCC/code
      if (!result) {
        const { data: carton } = await supabase
          .from("cartons")
          .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
          .eq("company_id", company_id)
          .or(`sscc.eq.${data.sscc},code.eq.${data.sscc}`)
          .maybeSingle();

        if (carton?.id) {
          const { data: boxes } = await supabase
            .from("boxes")
            .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
            .eq("carton_id", carton.id)
            .order("created_at", { ascending: true });

          const boxIds = (boxes ?? []).map((b: any) => b.id).filter(Boolean);
          const { data: units } = boxIds.length
            ? await supabase
                .from("labels_units")
                .select("id, box_id, serial, created_at")
                .in("box_id", boxIds)
                .order("created_at", { ascending: true })
            : { data: [] as any[] };

          const unitsByBox = new Map<string, any[]>();
          for (const u of units ?? []) {
            const key = (u as any).box_id;
            if (!key) continue;
            const list = unitsByBox.get(key) ?? [];
            list.push({ uid: (u as any).serial, id: (u as any).id, created_at: (u as any).created_at });
            unitsByBox.set(key, list);
          }

          const boxesWithUnits = (boxes ?? []).map((b: any) => ({
            ...(b as any),
            units: unitsByBox.get((b as any).id) ?? [],
          }));

          const palletNode = carton.pallet_id
            ? await buildHierarchyForPallet({ supabase, palletId: carton.pallet_id })
            : null;

          result = {
            ...(carton as any),
            boxes: boxesWithUnits,
            pallet: palletNode ? { id: palletNode.id, sscc: palletNode.sscc, sscc_with_ai: palletNode.sscc_with_ai } : null,
          };
          level = "carton";
        }
      }

      // 3) Box by SSCC/code
      if (!result) {
        const { data: box } = await supabase
          .from("boxes")
          .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
          .eq("company_id", company_id)
          .or(`sscc.eq.${data.sscc},code.eq.${data.sscc}`)
          .maybeSingle();

        if (box?.id) {
          const { data: units } = await supabase
            .from("labels_units")
            .select("id, box_id, serial, created_at")
            .eq("box_id", box.id)
            .order("created_at", { ascending: true });

          const { data: cartonNode } = box.carton_id
            ? await supabase
                .from("cartons")
                .select("id, pallet_id, sscc, sscc_with_ai, code, created_at")
                .eq("id", box.carton_id)
                .maybeSingle()
            : { data: null as any };

          const palletId = (cartonNode as any)?.pallet_id ?? box.pallet_id ?? null;
          const palletNode = palletId
            ? await supabase
                .from("pallets")
                .select("id, sscc, sscc_with_ai, created_at")
                .eq("id", palletId)
                .maybeSingle()
            : { data: null as any };

          result = {
            ...(box as any),
            units: (units ?? []).map((u: any) => ({ uid: u.serial, id: u.id, created_at: u.created_at })),
            carton: cartonNode ?? null,
            pallet: (palletNode as any)?.data ?? null,
          };
          level = "box";
        }
      }
    }

    if (!result && data.serialNo) {
      const { data: unit } = await supabase
        .from("labels_units")
        .select("id, box_id, serial, gs1_payload, created_at")
        .eq("company_id", company_id)
        .eq("serial", data.serialNo)
        .maybeSingle();

      if (unit?.id) {
        const { data: boxNode } = unit.box_id
          ? await supabase
              .from("boxes")
              .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, created_at")
              .eq("id", unit.box_id)
              .maybeSingle()
          : { data: null as any };

        const { data: cartonNode } = (boxNode as any)?.carton_id
          ? await supabase
              .from("cartons")
              .select("id, pallet_id, sscc, sscc_with_ai, code, created_at")
              .eq("id", (boxNode as any).carton_id)
              .maybeSingle()
          : { data: null as any };

        const palletId = (cartonNode as any)?.pallet_id ?? (boxNode as any)?.pallet_id ?? null;
        const { data: palletNode } = palletId
          ? await supabase
              .from("pallets")
              .select("id, sscc, sscc_with_ai, created_at")
              .eq("id", palletId)
              .maybeSingle()
          : { data: null as any };

        result = {
          uid: unit.serial,
          id: unit.id,
          created_at: unit.created_at,
          gs1_payload: unit.gs1_payload,
          box: boxNode ?? null,
          carton: cartonNode ?? null,
          pallet: palletNode ?? null,
        };
        level = "unit";
      }
    }

    if (!result || !level) {
      return NextResponse.json(
        { success: false, error: "Code not found in hierarchy" },
        { status: 404 }
      );
    }

    /* ------------------------------------------------
       6️⃣ Billing
    ------------------------------------------------ */
    const price =
      level === "box"
        ? billingConfig.pricing.scan.box
        : level === "carton"
        ? billingConfig.pricing.scan.carton
        : level === "pallet"
        ? billingConfig.pricing.scan.pallet
        : 0;

    if (price > 0) {
      const billingRes = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/billing/charge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            company_id,
            type: "scan",
            subtype: level,
            count: 1
          })
        }
      );

      const billingJson = await billingRes.json();
      if (!billingJson.success) {
        return NextResponse.json(
          { success: false, error: billingJson.error },
          { status: 402 }
        );
      }
    }

    /* ------------------------------------------------
       7️⃣ Log scan
    ------------------------------------------------ */
    await supabase.from("scan_logs").insert({
      company_id,
      handset_id,
      raw_scan: raw,
      parsed: data,
      metadata: { level },
      status: "SUCCESS"
    });

    /* ------------------------------------------------
       8️⃣ Success
    ------------------------------------------------ */
    return NextResponse.json({
      success: true,
      level,
      data: result
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}
