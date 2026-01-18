import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const batch = searchParams.get("batch");
  const sku = searchParams.get("sku");
  const gtin = searchParams.get("gtin");
  const pallet = searchParams.get("pallet"); // SSCC

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
  const actor = req.headers.get("x-actor") || user.email || user.id;
  const auditBase = {
    companyId,
    actor,
    action: "reports.recall.export",
    integrationSystem: "reports",
    metadata: { batch, sku, gtin, pallet },
  } as const;

  if (!batch && !sku && !gtin && !pallet) {
    try {
      await writeAuditLog({
        ...auditBase,
        status: "failed",
        metadata: { ...auditBase.metadata, error: "Provide batch OR sku OR gtin OR pallet" },
      });
    } catch {
      // do not fail response because auditing failed
    }
    return NextResponse.json(
      { error: "Provide batch OR sku OR gtin OR pallet" },
      { status: 400 }
    );
  }

  /* =====================================================
     STEP 1: FIND AFFECTED UNITS
     ===================================================== */

  // Priority 1 fix: Add company_id filter and fix column names
  let unitQuery = supabase
    .from("labels_units")
    .select("id, serial, gtin, batch, mfd, expiry, sku_id, created_at")
    .eq("company_id", companyId);  // CRITICAL: Filter by company_id for multi-tenant isolation

  if (batch) unitQuery = unitQuery.eq("batch", batch);
  if (gtin) unitQuery = unitQuery.eq("gtin", gtin);
  
  // SKU filtering: Resolve sku_id from sku_code if needed
  if (sku) {
    const { data: skuRow } = await supabase
      .from("skus")
      .select("id")
      .eq("company_id", companyId)
      .eq("sku_code", sku.toUpperCase())
      .maybeSingle();
    if (skuRow?.id) {
      unitQuery = unitQuery.eq("sku_id", skuRow.id);
    }
  }

  const { data: units, error: unitError } = await unitQuery;

  if (unitError) {
    try {
      await writeAuditLog({
        ...auditBase,
        status: "failed",
        metadata: { ...auditBase.metadata, error: unitError.message },
      });
    } catch {
      // do not fail response because auditing failed
    }
    return NextResponse.json(
      { error: unitError.message },
      { status: 500 }
    );
  }

  /* =====================================================
     STEP 2: IF PALLET PROVIDED → TRACE DOWNWARD
     ===================================================== */

  let hierarchyRows: any[] = [];

  if (pallet) {
    const { data, error } = await supabase
      .from("packaging_hierarchy")
      .select("*")
      .eq("company_id", companyId)
      .eq("parent_code", pallet);

    if (error) {
      try {
        await writeAuditLog({
          ...auditBase,
          status: "failed",
          metadata: { ...auditBase.metadata, error: error.message },
        });
      } catch {
        // do not fail response because auditing failed
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    hierarchyRows = data || [];
  }

  /* =====================================================
     STEP 3: MAP UNIT → BOX → CARTON → PALLET
     ===================================================== */

  const results: any[] = [];

  for (const unit of units || []) {
    // Priority 1 fix: Use serial instead of unit_code (column name fix)
    const unitSerial = unit.serial;

    const { data: path } = await supabase
      .from("packaging_hierarchy")
      .select("*")
      .eq("company_id", companyId)
      .or(
        `child_code.eq.${unitSerial},parent_code.eq.${unitSerial}`
      );

    const box = path?.find((p) => p.child_level === "unit")?.parent_code;
    const carton = path?.find((p) => p.child_code === box)?.parent_code;
    const palletCode = path?.find((p) => p.child_code === carton)?.parent_code;

    results.push({
      serial: unitSerial,  // Fixed: use serial instead of unit_code
      gtin: unit.gtin,
      sku_id: unit.sku_id,  // Fixed: use sku_id (UUID) instead of sku (string)
      batch: unit.batch,
      box,
      carton,
      pallet: palletCode,
    });
  }

  /* =====================================================
     STEP 4: CSV EXPORT
     ===================================================== */

  const csv = [
    "Serial,GTIN,SKU ID,Batch,Box SSCC,Carton SSCC,Pallet SSCC",
    ...results.map(
      (r) =>
        `"${r.serial}","${r.gtin}","${r.sku_id || ""}","${r.batch}","${r.box || ""}","${r.carton || ""}","${r.pallet || ""}"`
    ),
  ].join("\n");

  try {
    await writeAuditLog({
      ...auditBase,
      status: "success",
      metadata: {
        ...auditBase.metadata,
        matchedUnits: (units || []).length,
        rows: results.length,
        palletProvided: Boolean(pallet),
      },
    });
  } catch {
    // do not fail response because auditing failed
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=recall_impact.csv",
    },
  });
}
