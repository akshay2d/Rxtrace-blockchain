import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertCompanyCanOperate, ensureActiveBillingUsage } from "@/lib/billing/usage";
import { generateCanonicalGS1 } from "@/lib/gs1Canonical";

// ---------- utils ----------
const generateSerial = (companyId: string) =>
  `U${companyId.slice(0, 4)}${Date.now().toString(36)}${crypto
    .randomBytes(3)
    .toString("hex")}`;

// ---------- API ----------
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const {
      company_id,
      company_name,
      sku_code,
      sku_name,
      gtin,
      batch,
      mfd,
      expiry,
      mrp,
      quantity
    } = body;

    if (
      !company_id ||
      !sku_code ||
      !gtin ||
      !batch ||
      !mfd ||
      !expiry ||
      mrp === undefined ||
      !quantity
    ) {
      return NextResponse.json(
        { error: "Invalid / missing fields" },
        { status: 400 }
      );
    }

    await assertCompanyCanOperate({ supabase, companyId: company_id });
    await ensureActiveBillingUsage({ supabase, companyId: company_id });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    }

    const { data: reserveRow, error: reserveErr } = await supabase.rpc('billing_usage_consume', {
      p_company_id: company_id,
      p_kind: 'unit',
      p_qty: qty,
    });

    const reserve = Array.isArray(reserveRow) ? reserveRow[0] : reserveRow;
    if (reserveErr || !reserve?.ok) {
      return NextResponse.json(
        {
          error: "Unit label quota exceeded. Please purchase extra Unit labels add-on.",
          code: reserve?.error ?? reserveErr?.message ?? 'quota_exceeded',
          requires_addon: true,
          addon: 'unit'
        },
        { status: 403 }
      );
    }

    // Keep for debugging / future logs
    const usageId = reserve.usage_id as string | undefined;

    // ---------- SKU UPSERT ----------
    const { data: sku, error: skuErr } = await supabase
      .from("skus")
      .upsert(
        {
          company_id,
          sku_code,
          sku_name
        },
        { onConflict: "company_id,sku_code" }
      )
      .select("id")
      .single();

    if (skuErr || !sku) throw skuErr;

    // ---------- UNIT GENERATION ----------
    // Generate units with uniqueness validation
    const rows: any[] = [];
    const maxAttempts = 10; // Maximum retries per unit to avoid infinite loops
    
    for (let i = 0; i < qty; i++) {
      let serial: string;
      let attempts = 0;
      let isUnique = false;
      
      // Generate unique serial with retry logic
      while (!isUnique && attempts < maxAttempts) {
        serial = generateSerial(company_id);
        
        // Check if serial already exists for this company/GTIN/batch combination
        const { data: existing } = await supabase
          .from("labels_units")
          .select("id")
          .eq("company_id", company_id)
          .eq("gtin", gtin)
          .eq("batch", batch)
          .eq("serial", serial)
          .maybeSingle();
        
        if (!existing) {
          isUnique = true;
        } else {
          attempts++;
          // Add small delay to avoid timestamp collisions
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      if (!isUnique) {
        await supabase.rpc('billing_usage_refund', { p_company_id: company_id, p_kind: 'unit', p_qty: qty });
        return NextResponse.json(
          { error: `Failed to generate unique serial after ${maxAttempts} attempts for unit ${i + 1}` },
          { status: 500 }
        );
      }

      // Generate canonical GS1 payload (machine format, no parentheses)
      const gs1Payload = generateCanonicalGS1({
        gtin,
        expiry,
        mfgDate: mfd,
        batch,
        serial: serial!,
        mrp: Number(mrp),
        sku: sku_code,
        company: company_name || ""
      });

      rows.push({
        company_id,
        sku_id: sku.id,
        gtin,
        batch,
        mfd,
        expiry,
        mrp,
        serial: serial!,
        gs1_payload: gs1Payload
      });
    }

    // Insert all rows in a single transaction
    const { error } = await supabase.from("labels_units").insert(rows);
    if (error) {
      // Check if it's a uniqueness constraint violation
      if (error.code === '23505' || error.message?.includes('unique')) {
        await supabase.rpc('billing_usage_refund', { p_company_id: company_id, p_kind: 'unit', p_qty: qty });
        return NextResponse.json(
          { error: "Duplicate serial detected. Please try again." },
          { status: 409 }
        );
      }
      await supabase.rpc('billing_usage_refund', { p_company_id: company_id, p_kind: 'unit', p_qty: qty });
      throw error;
    }

    return NextResponse.json({
      success: true,
      generated: rows.length
    });
  } catch (err: any) {
    if (err?.code === 'PAST_DUE' || err?.code === 'SUBSCRIPTION_INACTIVE') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 402 });
    }
    return NextResponse.json(
      { error: err?.message || "Unit generation failed" },
      { status: 500 }
    );
  }
}
