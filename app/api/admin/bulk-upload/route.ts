// app/api/admin/bulk-upload/route.ts
// PHASE-4: Uses subscription-based quota (SSCC) for pallet/carton; requires admin.
import { NextResponse } from "next/server";
import { makeSscc } from "@/app/lib/sscc";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/audit/admin";
import { enforceEntitlement, refundEntitlement } from "@/lib/entitlement/enforce";
import { UsageType } from "@/lib/entitlement/usageTypes";

/**
 * POST body (JSON) accepted:
 * {
 *   company_id: string,
 *   level: 'pallet'|'carton'|'box'|'unit',
 *   csv: string,
 *   parent_column?: string
 * }
 */
function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { header: null, rows: [] };
  const first = lines[0];
  const hasComma = first.includes(",");
  if (hasComma && /[A-Za-z]/.test(first)) {
    const header = first.split(",").map((h) => h.trim());
    const rows = lines
      .slice(1)
      .map((ln) => ln.split(",").map((c) => c.trim()));
    return { header, rows };
  } else if (hasComma) {
    const rows = lines.map((ln) => ln.split(",").map((c) => c.trim()));
    return { header: null, rows };
  } else {
    return { header: null, rows: lines.map((v) => [v]) };
  }
}

export async function POST(req: Request) {
  // IMPORTANT:
  // Do NOT implement quota logic in this route.
  // All entitlement enforcement must use lib/entitlement/enforce.ts
  let quotaConsumed = false;
  let quotaRefundCount = 0;
  let quotaCompanyId = "";
  let bodyCompanyId: string | null = null;
  let bodyLevel: string | null = null;

  try {
    const { userId, error: adminErr } = await requireAdmin();
    if (adminErr) return adminErr;

    const body = await req.json();
    const { company_id, level, csv, parent_column } = body;
    bodyCompanyId = company_id;
    bodyLevel = level;
    if (!company_id)
      return NextResponse.json(
        { success: false, error: "company_id required" },
        { status: 400 }
      );
    if (!level || !["pallet", "carton", "box", "unit"].includes(level)) {
      return NextResponse.json(
        {
          success: false,
          error: "level must be one of pallet|carton|box|unit",
        },
        { status: 400 }
      );
    }
    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { success: false, error: "csv (string) required" },
        { status: 400 }
      );
    }

    const { header, rows } = parseCsv(csv);
    if (rows.length === 0)
      return NextResponse.json({
        success: true,
        created: 0,
        details: [],
      });

    // PHASE-4: For pallet/carton, consume SSCC quota before creating records
    if (level === "pallet" || level === "carton") {
      const usageType =
        level === "pallet" ? UsageType.PALLET_LABEL : UsageType.CARTON_LABEL;
      const decision = await enforceEntitlement({
        companyId: company_id,
        usageType,
        quantity: rows.length,
        metadata: { source: `admin_bulk_upload_${level}` },
      });
      if (!decision.allow) {
        return NextResponse.json(
          {
            success: false,
            error: decision.reason_code,
            remaining: decision.remaining,
          },
          { status: 403 }
        );
      }
      quotaConsumed = true;
      quotaRefundCount = rows.length;
      quotaCompanyId = company_id;
    }

    const details: any[] = [];
    const supabase = getSupabaseAdmin();
    let createdCount = 0;
    for (const row of rows) {
      const rowObj: Record<string, string> = {};
      if (header) {
        for (let i = 0; i < header.length; i++)
          rowObj[header[i]] = row[i] ?? "";
      } else {
        rowObj["value"] = row[0] ?? "";
      }

      if (level === "pallet") {
        const sscc = makeSscc();
        const { error: insertError } = await supabase
          .from("pallets")
          .insert({ sscc, company_id });
        if (insertError) throw new Error(insertError.message);
        details.push({ row: rowObj, sscc });
        createdCount++;
      } else if (level === "carton") {
        const sscc = makeSscc();
        const pallet_id =
          header && parent_column
            ? rowObj[parent_column] || null
            : row[1] || null;
        const { error: insertError } = await supabase
          .from("cartons")
          .insert({
            code: sscc,
            company_id,
            pallet_id: pallet_id || null,
          });
        if (insertError) throw new Error(insertError.message);
        details.push({ row: rowObj, sscc, parent: pallet_id ?? null });
        createdCount++;
      } else if (level === "box") {
        details.push({
          row: rowObj,
          error: "Box level not implemented",
        });
      } else if (level === "unit") {
        details.push({
          row: rowObj,
          error: "Unit level not implemented",
        });
      }
    }
    const results = { createdCount, details };

    // PHASE-6: Log admin action for audit trail (no confirmation required)
    await logAdminAction({
      action: "BULK_UPLOAD",
      resourceType: "bulk_upload",
      companyId: company_id,
      newValue: { level, created: results.createdCount, total_rows: rows.length },
      status: "success",
      metadata: { level, created_count: results.createdCount, total_rows: rows.length },
    });

    return NextResponse.json({
      success: true,
      created: results.createdCount,
      details: results.details,
    });
  } catch (err: any) {
    if (quotaConsumed && quotaRefundCount > 0 && quotaCompanyId) {
      try {
        await refundEntitlement({
          companyId: quotaCompanyId,
          usageType:
            bodyLevel === "pallet"
              ? UsageType.PALLET_LABEL
              : UsageType.CARTON_LABEL,
          quantity: quotaRefundCount,
        });
      } catch (_) {
        // best-effort refund
      }
    }
    
    // PHASE-6: Log failed action for audit trail
    await logAdminAction({
      action: "BULK_UPLOAD",
      resourceType: "bulk_upload",
      companyId: bodyCompanyId || quotaCompanyId || undefined,
      status: "failed",
      metadata: { error: err?.message ?? String(err), level: bodyLevel },
    });
    
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
