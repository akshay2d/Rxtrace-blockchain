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

    const companyId = company.id;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total active handsets
    const { count: totalActive } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE');

    // Handsets registered today
    const { count: registeredToday } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('activated_at', today.toISOString());

    // Handsets registered this week
    const { count: registeredThisWeek } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('activated_at', weekAgo.toISOString());

    // Handsets registered this month
    const { count: registeredThisMonth } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('activated_at', monthAgo.toISOString());

    // Total SSCC scans (from scan_logs where scanType is not 'unit')
    const { data: allScans } = await supabase
      .from('scan_logs')
      .select('metadata, scanned_at, handset_id')
      .eq('company_id', companyId);

    const ssccScans = (allScans || []).filter(scan => {
      const scanType = scan.metadata?.scanType;
      return scanType && scanType !== 'unit';
    });

    const totalSSCCScans = ssccScans.length;
    const ssccScansToday = ssccScans.filter(s => new Date(s.scanned_at) >= today).length;
    const ssccScansThisWeek = ssccScans.filter(s => new Date(s.scanned_at) >= weekAgo).length;
    const ssccScansThisMonth = ssccScans.filter(s => new Date(s.scanned_at) >= monthAgo).length;

    // Most active handsets (by scan count)
    const handsetScanCounts: Record<string, number> = {};
    ssccScans.forEach(scan => {
      if (scan.handset_id) {
        handsetScanCounts[scan.handset_id] = (handsetScanCounts[scan.handset_id] || 0) + 1;
      }
    });

    const topHandsets = Object.entries(handsetScanCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([handsetId, count]) => ({ handset_id: handsetId, scan_count: count }));

    // Get handset details for top handsets
    const topHandsetIds = topHandsets.map(h => h.handset_id);
    const { data: topHandsetsData } = await supabase
      .from('handsets')
      .select('id, device_fingerprint')
      .in('id', topHandsetIds);

    const mostActiveHandsets = topHandsets.map(th => {
      const handset = topHandsetsData?.find(h => h.id === th.handset_id);
      return {
        handset_id: handset?.device_fingerprint || th.handset_id,
        scan_count: th.scan_count
      };
    });

    return NextResponse.json({
      success: true,
      statistics: {
        handsets: {
          total_active: totalActive || 0,
          registered_today: registeredToday || 0,
          registered_this_week: registeredThisWeek || 0,
          registered_this_month: registeredThisMonth || 0
        },
        scans: {
          total_sscc_scans: totalSSCCScans,
          sscc_scans_today: ssccScansToday,
          sscc_scans_this_week: ssccScansThisWeek,
          sscc_scans_this_month: ssccScansThisMonth
        },
        most_active_handsets: mostActiveHandsets
      }
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
