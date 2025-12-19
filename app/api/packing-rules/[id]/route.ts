import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: rule, error } = await supabaseAdmin
      .from("packing_rules")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !rule) {
      return NextResponse.json(
        { error: "Packing rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Failed to fetch packing rule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ruleId = params.id;
    const body = await req.json();

    // Fetch existing rule
    const { data: rule, error: fetchError } = await supabaseAdmin
      .from("packing_rules")
      .select("*")
      .eq("id", ruleId)
      .single();

    if (fetchError || !rule) {
      return NextResponse.json(
        { error: "Packing rule not found" },
        { status: 404 }
      );
    }

    // Update rule (creates new version instead of modifying)
    const newVersion = (rule.version || 0) + 1;
    
    const { data: newRule, error: insertError } = await supabaseAdmin
      .from("packing_rules")
      .insert({
        company_id: rule.company_id,
        sku_id: body.sku_id || rule.sku_id,
        version: newVersion,
        strips_per_box: parseInt(body.strips_per_box) || rule.strips_per_box,
        boxes_per_carton: parseInt(body.boxes_per_carton) || rule.boxes_per_carton,
        cartons_per_pallet: parseInt(body.cartons_per_pallet) || rule.cartons_per_pallet,
        sscc_company_prefix: body.sscc_company_prefix || rule.sscc_company_prefix,
        sscc_sequence_key: body.sscc_sequence_key || rule.sscc_sequence_key,
        allow_partial_last_container: body.allow_partial_last_container ?? rule.allow_partial_last_container,
        meta: body.meta || rule.meta || {},
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json(newRule);
  } catch (error: any) {
    console.error("Packing rule update failed:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabaseAdmin
      .from("packing_rules")
      .delete()
      .eq("id", params.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete packing rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
