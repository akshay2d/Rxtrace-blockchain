import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { count: activeHandsets } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('status', 'ACTIVE');

    // Fetch detailed handset list
    const { data: handsetsList, error: handsetsError } = await supabase
      .from('handsets')
      .select('id, device_fingerprint, status, high_scan_enabled, activated_at')
      .eq('company_id', company.id)
      .order('activated_at', { ascending: false });

    if (handsetsError) {
      return NextResponse.json({ error: handsetsError.message }, { status: 500 });
    }

    // Transform to match frontend expectations
    const handsets = (handsetsList || []).map(h => ({
      id: h.id,
      handset_id: h.device_fingerprint,
      active: h.status === "ACTIVE",
      activated_at: h.activated_at || null,
      deactivated_at: null,
      last_seen: h.activated_at || null
    }));

    const { data: activeTokens, error: tokenError } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', company.id)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1);

    console.log('[HANDSETS API] Company ID:', company.id);
    console.log('[HANDSETS API] Token query result:', JSON.stringify(activeTokens));
    console.log('[HANDSETS API] Token query error:', tokenError);
    
    // Also try without the used filter
    const { data: allTokens } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(3);
    console.log('[HANDSETS API] All tokens (no used filter):', JSON.stringify(allTokens));

    const activeToken = activeTokens?.[0] || null;

    return NextResponse.json({
      scanning_on: !!activeToken,
      active_handsets: activeHandsets || 0,
      token: activeToken?.token || null,
      handsets: handsets
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
