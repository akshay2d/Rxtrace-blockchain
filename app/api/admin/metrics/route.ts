// PHASE-7: Metrics endpoint for monitoring
// PHASE-12: Updated to support database storage and time range queries
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getRouteMetrics,
  getOperationMetrics,
  getMetricsSummary,
  TimeRange,
} from "@/lib/observability";

export const runtime = "nodejs";

/**
 * PHASE-12: Parse time range from query parameters
 */
function parseTimeRange(searchParams: URLSearchParams): TimeRange | undefined {
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  
  if (startParam && endParam) {
    const start = new Date(startParam);
    const end = new Date(endParam);
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { start, end };
    }
  }
  
  return undefined;
}

/**
 * GET: Get all metrics
 * PHASE-12: Now supports time range queries via ?start=ISO_DATE&end=ISO_DATE
 * Returns route and operation metrics for monitoring
 */
export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // 'routes', 'operations', 'summary', or null (all)
    const route = searchParams.get("route");
    const method = searchParams.get("method");
    const operation = searchParams.get("operation");
    const timeRange = parseTimeRange(searchParams);

    if (type === "routes") {
      const routes = await getRouteMetrics(route || undefined, method || undefined, timeRange);
      return NextResponse.json({
        success: true,
        metrics: {
          routes,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "operations") {
      const operations = await getOperationMetrics(operation || undefined, timeRange);
      return NextResponse.json({
        success: true,
        metrics: {
          operations,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "summary") {
      const summary = await getMetricsSummary();
      return NextResponse.json({
        success: true,
        summary,
        timestamp: new Date().toISOString(),
      });
    }

    // Return all metrics
    const [routes, operations, summary] = await Promise.all([
      getRouteMetrics(route || undefined, method || undefined, timeRange),
      getOperationMetrics(operation || undefined, timeRange),
      getMetricsSummary(),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        routes,
        operations,
        summary,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get metrics" },
      { status: 500 }
    );
  }
}
