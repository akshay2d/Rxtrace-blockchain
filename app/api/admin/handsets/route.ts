import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    // Get last scan time for each handset from scan_logs
    const handsetIds = (handsetsList || []).map(h => h.id);
    const lastScans: Record<string, string> = {};
    
    if (handsetIds.length > 0) {
      // Query scan_logs for most recent scan per handset
      const { data: scanLogs } = await supabase
        .from('scan_logs')
        .select('handset_id, scanned_at')
        .in('handset_id', handsetIds)
        .order('scanned_at', { ascending: false });

      // Group by handset_id and get most recent
      if (scanLogs) {
        scanLogs.forEach(log => {
          if (log.handset_id && !lastScans[log.handset_id]) {
            lastScans[log.handset_id] = log.scanned_at;
          }
        });
      }
    }

    // Transform to match frontend expectations with registration method detection
    const handsets = (handsetsList || []).map(h => {
      // Detect registration method:
      // - register-lite: high_scan_enabled is true by default (new system)
      // - token: activated via token (legacy system)
      // Since register-lite always sets high_scan_enabled: true, we can use that as indicator
      // But to be safe, we'll check activation date: if after 2026-01-23, likely register-lite
      const registerLiteStartDate = new Date('2026-01-23');
      const activatedDate = h.activated_at ? new Date(h.activated_at) : null;
      const isLikelyRegisterLite = activatedDate && activatedDate >= registerLiteStartDate && h.high_scan_enabled;
      
      const registration_method = isLikelyRegisterLite ? 'register-lite' : 'token';

      return {
        id: h.id,
        handset_id: h.device_fingerprint,
        active: h.status === "ACTIVE",
        high_scan_enabled: !!h.high_scan_enabled,
        activated_at: h.activated_at || null,
        deactivated_at: null,
        last_seen: h.activated_at || null,
        last_scan_at: lastScans[h.id] || null,
        registration_method: registration_method
      };
    });

    const { data: activeTokens, error: tokenError } = await supabase
      .from('handset_tokens')
      .select('*')
      .eq('company_id', company.id)
      .or('used.is.null,used.eq.false')
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
