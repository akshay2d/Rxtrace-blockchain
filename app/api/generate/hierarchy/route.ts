import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCompanyAccess } from "@/lib/auth/company";
import {
  assertCompanyCanOperate,
  ensureActiveBillingUsage,
} from "@/lib/billing/usage";
import { checkUsageLimits } from "@/lib/usage/tracking";
import {
  consumeQuotaBalance,
  refundQuotaBalance,
} from "@/lib/billing/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHASE-4: Full hierarchy generation (units + box/carton/pallet) uses
 * subscription-based quota (unit + SSCC), not wallet/credit.
 */
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const {
      company_id,
      sku_id,
      packing_rule_id,
      total_strips,
      request_id,
      strip_codes,
    } = body;

    if (!company_id || !sku_id || !packing_rule_id || !total_strips) {
      return NextResponse.json(
        { error: "missing required param" },
        { status: 400 }
      );
    }

    // PHASE-4: Require authenticated user with access to this company
    const { authorized, error: authErr } = await verifyCompanyAccess(
      company_id
    );
    if (authErr) return authErr;
    if (!authorized) {
      return NextResponse.json(
        { error: "Company not found or access denied" },
        { status: 403 }
      );
    }

    // 1) Fetch packing rule to compute totals (same math as preview)
    const { data: rule, error: ruleErr } = await supabase
      .from("packing_rules")
      .select("strips_per_box, boxes_per_carton, cartons_per_pallet")
      .eq("id", packing_rule_id)
      .single();

    if (ruleErr || !rule) {
      return NextResponse.json(
        { error: "packing rule not found" },
        { status: 400 }
      );
    }

    const stripsPerBox = Number(rule.strips_per_box);
    const boxesPerCarton = Number(rule.boxes_per_carton);
    const cartonsPerPallet = Number(rule.cartons_per_pallet);

    const totalBoxes = Math.ceil(Number(total_strips) / stripsPerBox);
    const totalCartons = Math.ceil(totalBoxes / boxesPerCarton);
    const totalPallets = Math.ceil(totalCartons / cartonsPerPallet);
    const totalUnits = Number(total_strips);
    const totalSSCC = totalBoxes + totalCartons + totalPallets;

    // PHASE-4: Subscription-based quota (no wallet)
    await assertCompanyCanOperate({ supabase, companyId: company_id });
    await ensureActiveBillingUsage({ supabase, companyId: company_id });

    const unitCheck = await checkUsageLimits(
      supabase,
      company_id,
      "UNIT",
      totalUnits
    );
    if (!unitCheck.allowed) {
      return NextResponse.json(
        {
          error: unitCheck.reason ?? "Unit label limit exceeded",
          code: "limit_exceeded",
          limit_type: unitCheck.limit_type,
          current_usage: unitCheck.current_usage,
          limit_value: unitCheck.limit_value,
        },
        { status: 403 }
      );
    }

    const ssccCheck = await checkUsageLimits(
      supabase,
      company_id,
      "SSCC",
      totalSSCC
    );
    if (!ssccCheck.allowed) {
      return NextResponse.json(
        {
          error: ssccCheck.reason ?? "SSCC label limit exceeded",
          code: "limit_exceeded",
          limit_type: ssccCheck.limit_type,
          current_usage: ssccCheck.current_usage,
          limit_value: ssccCheck.limit_value,
        },
        { status: 403 }
      );
    }

    // Consume quota before generation; refund on failure
    const [unitConsume, ssccConsume] = await Promise.all([
      consumeQuotaBalance(company_id, "unit", totalUnits),
      consumeQuotaBalance(company_id, "sscc", totalSSCC),
    ]);

    if (!unitConsume.ok || !ssccConsume.ok) {
      const msg =
        unitConsume.error ?? ssccConsume.error ?? "Failed to reserve quota";
      if (unitConsume.ok)
        await refundQuotaBalance(company_id, "unit", totalUnits);
      if (ssccConsume.ok)
        await refundQuotaBalance(company_id, "sscc", totalSSCC);
      return NextResponse.json(
        { error: msg, code: "quota_error" },
        { status: 500 }
      );
    }

    try {
      const { data, error } = await supabase.rpc("create_full_hierarchy", {
        p_company_id: company_id,
        p_sku_id: sku_id,
        p_packing_rule_id: packing_rule_id,
        p_total_strips: totalUnits,
        p_request_id: request_id ?? null,
        p_strip_codes: strip_codes ?? null,
      });

      if (error) {
        await Promise.all([
          refundQuotaBalance(company_id, "unit", totalUnits),
          refundQuotaBalance(company_id, "sscc", totalSSCC),
        ]);
        return NextResponse.json(
          { error: "Generation failed", detail: error },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, generation: data });
    } catch (genErr) {
      await Promise.all([
        refundQuotaBalance(company_id, "unit", totalUnits),
        refundQuotaBalance(company_id, "sscc", totalSSCC),
      ]);
      return NextResponse.json(
        { error: String(genErr) },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
