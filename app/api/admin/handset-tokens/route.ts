import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Respect activation_enabled master switch
    const { data: headsRow } = await supabase
      .from('company_active_heads')
      .select('heads')
      .eq('company_id', companyId)
      .maybeSingle();
    const heads = (headsRow?.heads as any) ?? {};
    const activationEnabled =
      heads?.scanner_activation_enabled === undefined ? true : !!heads.scanner_activation_enabled;
    if (!activationEnabled) {
      return NextResponse.json({ error: 'Activation disabled by admin' }, { status: 403 });
    }

    // Keep a single active code: invalidate any previously active (unused) tokens
    const { error: invalidateError } = await supabase
      .from('handset_tokens')
      .update({ used: true })
      .eq('company_id', companyId)
      .or('used.is.null,used.eq.false');

    if (invalidateError) {
      return NextResponse.json({ error: invalidateError.message }, { status: 500 });
    }

    // Generate simple 8-digit token: RX-NNNNNN (6 random digits)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const token = `RX-${randomDigits}`;

    const { data: row, error: insertError } = await supabase
      .from('handset_tokens')
      .insert({
        company_id: companyId,
        token,
        used: false,
        high_scan: true, // auto-enabled as per your rule
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(row, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Mark all unused tokens as used (invalidate them)
    const { data: result, error: updateError } = await supabase
      .from('handset_tokens')
      .update({ used: true })
      .eq('company_id', companyId)
      .or('used.is.null,used.eq.false')
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      invalidated: result?.length || 0,
      message: `Invalidated ${result?.length || 0} token(s)` 
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to invalidate tokens" },
      { status: 500 }
    );
  }
}
