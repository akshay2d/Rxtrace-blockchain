// PHASE-7: Statistics endpoint for monitoring
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logInfo } from "@/lib/observability";

export const runtime = "nodejs";

/**
 * GET: Get system statistics
 * Returns various system statistics for monitoring
 */
export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const supabase = getSupabaseAdmin();

    // Get counts from various tables
    const [
      companiesResult,
      usersResult,
      subscriptionsResult,
      invoicesResult,
    ] = await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }),
      supabase.auth.admin.listUsers(),
      supabase.from("company_subscriptions").select("id", { count: "exact", head: true }),
      supabase.from("invoices").select("id", { count: "exact", head: true }),
    ]);

    const stats = {
      timestamp: new Date().toISOString(),
      counts: {
        companies: companiesResult.count || 0,
        users: usersResult.data?.users?.length || 0,
        subscriptions: subscriptionsResult.count || 0,
        invoices: invoicesResult.count || 0,
      },
      system: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        timestamp: new Date().toISOString(),
      },
    };

    logInfo("Statistics retrieved", { stats });

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logInfo("Failed to get statistics", { error: err.message });
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get statistics" },
      { status: 500 }
    );
  }
}
