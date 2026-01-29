// app/api/admin/bulk-upload/route.ts
// PHASE-4: Uses subscription-based quota (SSCC) for pallet/carton; requires admin.
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { makeSscc } from "@/app/lib/sscc";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/audit/admin";
import { ensureActiveBillingUsage } from "@/lib/billing/usage";
import { checkUsageLimits } from "@/lib/usage/tracking";
import {
  consumeQuotaBalance,
  refundQuotaBalance,
} from "@/lib/billing/quota";

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
      const supabase = getSupabaseAdmin();
      await ensureActiveBillingUsage({ supabase, companyId: company_id });
      const limitCheck = await checkUsageLimits(
        supabase,
        company_id,
        "SSCC",
        rows.length
      );
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error:
              limitCheck.reason ?? "SSCC label limit exceeded",
            code: "limit_exceeded",
          },
          { status: 403 }
        );
      }
      const consume = await consumeQuotaBalance(
        company_id,
        "sscc",
        rows.length
      );
      if (!consume.ok) {
        return NextResponse.json(
          { success: false, error: consume.error ?? "Failed to reserve quota" },
          { status: 500 }
        );
      }
      quotaConsumed = true;
      quotaRefundCount = rows.length;
      quotaCompanyId = company_id;
    }

    const details: any[] = [];
    const results = await prisma.$transaction(async (tx) => {
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
          await tx.pallets.create({ data: { sscc, company_id } });
          details.push({ row: rowObj, sscc });
          createdCount++;
        } else if (level === "carton") {
          const sscc = makeSscc();
          const pallet_id =
            header && parent_column
              ? rowObj[parent_column] || null
              : row[1] || null;
          await tx.cartons.create({
            data: {
              code: sscc,
              company_id,
              pallet_id: pallet_id || null,
            },
          });
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
      return { createdCount, details };
    });

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
        await refundQuotaBalance(quotaCompanyId, "sscc", quotaRefundCount);
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
