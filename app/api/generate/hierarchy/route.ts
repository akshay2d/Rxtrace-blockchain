import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Price per pallet (INR). Set via env PRICE_PER_PALLET if you want a different value.
const PRICE_PER_PALLET = Number(process.env.PRICE_PER_PALLET ?? 10);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      company_id,
      sku_id,
      packing_rule_id,
      total_strips,
      request_id,
      strip_codes
    } = body;

    if (!company_id || !sku_id || !packing_rule_id || !total_strips) {
      return NextResponse.json({ error: "missing required param" }, { status: 400 });
    }

    // 1) fetch packing rule to compute totals (same math as preview)
    const { data: rule, error: ruleErr } = await supabase
      .from("packing_rules")
      .select("strips_per_box, boxes_per_carton, cartons_per_pallet")
      .eq("id", packing_rule_id)
      .single();

    if (ruleErr || !rule) {
      return NextResponse.json({ error: "packing rule not found" }, { status: 400 });
    }

    const stripsPerBox = Number(rule.strips_per_box);
    const boxesPerCarton = Number(rule.boxes_per_carton);
    const cartonsPerPallet = Number(rule.cartons_per_pallet);

    const totalBoxes = Math.ceil(Number(total_strips) / stripsPerBox);
    const totalCartons = Math.ceil(totalBoxes / boxesPerCarton);
    const totalPallets = Math.ceil(totalCartons / cartonsPerPallet);

    const cost = totalPallets * PRICE_PER_PALLET;

    // 2) check wallet available credit
    const { data: wallet, error: wErr } = await supabase
      .from("company_wallets")
      .select("balance, credit_limit, status")
      .eq("company_id", company_id)
      .single();

    const balance = wallet?.balance ? Number(wallet.balance) : 0;
    const credit_limit = wallet?.credit_limit ? Number(wallet.credit_limit) : 0;
    const status = wallet?.status ?? "ACTIVE";
    const available_credit = balance + credit_limit;

    if (status === "FROZEN") {
      return NextResponse.json({ error: "Account frozen. Please top-up.", code: "ACCOUNT_FROZEN" }, { status: 402 });
    }

    if (available_credit < cost) {
      return NextResponse.json({
        error: "Insufficient credit to generate requested hierarchy.",
        available_credit,
        required: cost,
        code: "INSUFFICIENT_CREDIT"
      }, { status: 402 });
    }

    // 3) charge wallet (reserve funds)
    const { data: chargeData, error: chargeErr } = await supabase.rpc("wallet_update_and_record", {
      p_company_id: company_id,
      p_op: "CHARGE",
      p_amount: cost,
      p_reference: request_id ?? null,
      p_created_by: null
    });

    if (chargeErr) {
      return NextResponse.json({ error: "Failed to reserve funds", detail: chargeErr }, { status: 500 });
    }

    // 4) attempt generation
    try {
      const { data, error } = await supabase.rpc("create_full_hierarchy", {
        p_company_id: company_id,
        p_sku_id: sku_id,
        p_packing_rule_id: packing_rule_id,
        p_total_strips: Number(total_strips),
        p_request_id: request_id ?? null,
        p_strip_codes: strip_codes ?? null
      });

      if (error) {
        // refund on error
        await supabase.rpc("wallet_update_and_record", {
          p_company_id: company_id,
          p_op: "TOPUP",
          p_amount: cost,
          p_reference: `refund:${request_id ?? "unknown"}`,
          p_created_by: null
        });
        return NextResponse.json({ error: "Generation failed", detail: error }, { status: 500 });
      }

      // success: return the generation result (and charge stands)
      return NextResponse.json({ success: true, generation: data });
    } catch (genErr) {
      // RPC failed unexpectedly — refund
      await supabase.rpc("wallet_update_and_record", {
        p_company_id: company_id,
        p_op: "TOPUP",
        p_amount: cost,
        p_reference: `refund:${request_id ?? "unknown"}`,
        p_created_by: null
      });

      return NextResponse.json({ error: String(genErr) }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
