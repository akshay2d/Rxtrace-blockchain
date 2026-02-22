import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateCanonicalGS1 } from "@/lib/gs1Canonical";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";
import { enforceEntitlement, refundEntitlement } from "@/lib/entitlement/enforce";
import { UsageType } from "@/lib/entitlement/usageTypes";

// ---------- utils ----------
const generateSerial = (companyId: string) =>
  `U${companyId.slice(0, 4)}${Date.now().toString(36)}${crypto
    .randomBytes(3)
    .toString("hex")}`;

// ---------- API ----------
export async function POST(req: Request) {
  // IMPORTANT:
  // Do NOT implement quota logic in this route.
  // All entitlement enforcement must use lib/entitlement/enforce.ts
  try {
    const authCompanyId = await resolveCompanyIdFromRequest(req);
    if (!authCompanyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const {
      company_id: requestedCompanyId,
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
    const company_id = authCompanyId;

    if (requestedCompanyId && requestedCompanyId !== authCompanyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
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

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    }

    const decision = await enforceEntitlement({
      companyId: company_id,
      usageType: UsageType.UNIT_LABEL,
      quantity: qty,
      metadata: { source: "unit_create" },
    });
    if (!decision.allow) {
      return NextResponse.json(
        {
          error: decision.reason_code,
          remaining: decision.remaining,
        },
        { status: 403 }
      );
    }

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
        await refundEntitlement({
          companyId: company_id,
          usageType: UsageType.UNIT_LABEL,
          quantity: qty,
        });
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
        sku: sku_code
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
        await refundEntitlement({
          companyId: company_id,
          usageType: UsageType.UNIT_LABEL,
          quantity: qty,
        });
        return NextResponse.json(
          { error: "Duplicate serial detected. Please try again." },
          { status: 409 }
        );
      }
      await refundEntitlement({
        companyId: company_id,
        usageType: UsageType.UNIT_LABEL,
        quantity: qty,
      });
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
