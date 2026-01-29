// PHASE-14: Alert Evaluation Endpoint
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/admin";
import { evaluateAlerts } from "@/lib/alerting";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";

export const runtime = "nodejs";

/**
 * POST: Manually trigger alert evaluation
 * PHASE-14: Allows admins to manually trigger alert evaluation
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert evaluation access denied', {
        correlationId,
        route: '/api/admin/alerts/evaluate',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/alerts/evaluate', 'POST', false, Date.now() - startTime);
      return adminError;
    }

    logWithContext('info', 'Admin alert evaluation request', {
      correlationId,
      route: '/api/admin/alerts/evaluate',
      method: 'POST',
      userId,
    });

    const { result, duration } = await measurePerformance(
      'admin.alerts.evaluate',
      async () => {
        return await evaluateAlerts();
      },
      { correlationId, route: '/api/admin/alerts/evaluate', method: 'POST', userId }
    );

    logWithContext('info', 'Admin alert evaluation completed', {
      correlationId,
      route: '/api/admin/alerts/evaluate',
      method: 'POST',
      userId,
      evaluated: result.evaluated,
      triggered: result.triggered,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/evaluate', 'POST', true, duration);
    return NextResponse.json({
      success: true,
      message: 'Alert evaluation completed',
      result: {
        evaluated: result.evaluated,
        triggered: result.triggered,
        alerts: result.alerts,
      },
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert evaluation failed', {
      correlationId,
      route: '/api/admin/alerts/evaluate',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/evaluate', 'POST', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
