import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Generate simple 8-digit token: RX-NNNNNN (6 random digits)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const token = `RX-${randomDigits}`;

    const { data: row, error: insertError } = await supabase
      .from('handset_tokens')
      .insert({
        company_id: company.id,
        token,
        used: false,
        high_scan: true, // auto-enabled as per your rule
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    console.log('[DELETE TOKEN] Company ID:', company.id);

    // First check what tokens exist
    const { data: existingTokens } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', company.id);
    
    console.log('[DELETE TOKEN] All tokens for company:', JSON.stringify(existingTokens));

    const { data: unusedTokens } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', company.id)
      .or('used.is.null,used.eq.false');
    
    console.log('[DELETE TOKEN] Unused tokens before update:', JSON.stringify(unusedTokens));

    // Mark all unused tokens as used (invalidate them)
    const { data: result, error: updateError } = await supabase
      .from('handset_tokens')
      .update({ used: true })
      .eq('company_id', company.id)
      .or('used.is.null,used.eq.false')
      .select();

    console.log('[DELETE TOKEN] Update result:', JSON.stringify(result));
    console.log('[DELETE TOKEN] Update error:', updateError);
    console.log('[DELETE TOKEN] Number of tokens updated:', result?.length || 0);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Deactivate all active handsets for this company so scanning actually stops
    const { data: deactivatedHandsets, error: deactivateError } = await supabase
      .from('handsets')
      .update({ status: 'INACTIVE' })
      .eq('company_id', company.id)
      .eq('status', 'ACTIVE')
      .select('id');

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      invalidated: result?.length || 0,
      deactivated_handsets: deactivatedHandsets?.length || 0,
      message: `Invalidated ${result?.length || 0} token(s) and deactivated ${deactivatedHandsets?.length || 0} handset(s)` 
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to invalidate tokens" },
      { status: 500 }
    );
  }
}
