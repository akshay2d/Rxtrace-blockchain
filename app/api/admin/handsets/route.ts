import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { count: activeHandsets } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE');

    // Fetch detailed handset list
    const { data: handsetsList, error: handsetsError } = await supabase
      .from('handsets')
      .select('id, device_fingerprint, status, high_scan_enabled, activated_at')
      .eq('company_id', companyId)
      .order('activated_at', { ascending: false });

    if (handsetsError) {
      return NextResponse.json({ error: handsetsError.message }, { status: 500 });
    }

    // Transform to match frontend expectations
    const handsets = (handsetsList || []).map(h => ({
      id: h.id,
      handset_id: h.device_fingerprint,
      active: h.status === "ACTIVE",
      high_scan_enabled: !!h.high_scan_enabled,
      activated_at: h.activated_at || null,
      deactivated_at: null,
      last_seen: h.activated_at || null
    }));

    const { data: activeTokens, error: tokenError } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', companyId)
      .or('used.is.null,used.eq.false')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tokenError) {
      return NextResponse.json({ error: tokenError.message }, { status: 500 });
    }

    const activeToken = activeTokens?.[0] || null;

    return NextResponse.json({
      scanning_on: !!activeToken,
      active_handsets: activeHandsets || 0,
      token: activeToken?.token || null,
      handsets: handsets
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
