// PHASE-7: Health check endpoint for monitoring
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logInfo } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: Health check endpoint
 * Returns system health status including database connectivity
 */
export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {
        database: "unknown",
        api: "healthy",
      },
    };

    // PHASE-7: Check database connectivity
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("companies").select("id").limit(1);
      
      if (error) {
        health.checks.database = "unhealthy";
        health.status = "degraded";
        logInfo("Health check: Database connectivity issue", { error: error.message });
      } else {
        health.checks.database = "healthy";
      }
    } catch (err: any) {
      health.checks.database = "unhealthy";
      health.status = "unhealthy";
      logInfo("Health check: Database connection failed", { error: err.message });
    }

    const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: err.message || "Health check failed",
      },
      { status: 503 }
    );
  }
}
