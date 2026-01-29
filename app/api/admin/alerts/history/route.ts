// PHASE-14: Alert History Endpoint
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";

export const runtime = "nodejs";

/**
 * GET: Get alert history
 * PHASE-14: Returns alert history with filtering options
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert history access denied', {
        correlationId,
        route: '/api/admin/alerts/history',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/alerts/history', 'GET', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    logWithContext('info', 'Admin alert history request', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'GET',
      userId,
      status,
      severity,
    });

    const { result, duration } = await measurePerformance(
      'admin.alerts.history.list',
      async () => {
        let query = supabase
          .from('alert_history')
          .select(`
            *,
            alert_rules(name, description)
          `)
          .order('triggered_at', { ascending: false })
          .limit(limit);

        if (status) {
          query = query.eq('status', status);
        }

        if (severity) {
          query = query.eq('severity', severity);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { alerts: data || [] };
      },
      { correlationId, route: '/api/admin/alerts/history', method: 'GET', userId }
    );

    logWithContext('info', 'Admin alert history completed', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'GET',
      userId,
      alertCount: result.alerts.length,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/history', 'GET', true, duration);
    return NextResponse.json({ success: true, alerts: result.alerts });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert history failed', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/history', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT: Update alert status (acknowledge or resolve)
 * PHASE-14: Allows admins to acknowledge or resolve alerts
 */
export async function PUT(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert history update access denied', {
        correlationId,
        route: '/api/admin/alerts/history',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/alerts/history', 'PUT', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { alert_id, status } = body;

    if (!alert_id || !status) {
      recordRouteMetric('/api/admin/alerts/history', 'PUT', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "alert_id and status are required" },
        { status: 400 }
      );
    }

    if (!['active', 'resolved', 'acknowledged'].includes(status)) {
      recordRouteMetric('/api/admin/alerts/history', 'PUT', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "status must be 'active', 'resolved', or 'acknowledged'" },
        { status: 400 }
      );
    }

    logWithContext('info', 'Admin alert status update request', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'PUT',
      userId,
      alertId: alert_id,
      newStatus: status,
    });

    const updates: any = { status };
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
    } else if (status === 'acknowledged') {
      updates.acknowledged_at = new Date().toISOString();
      updates.acknowledged_by = userId;
    }

    const { result, duration } = await measurePerformance(
      'admin.alerts.history.update',
      async () => {
        const { data: alert, error } = await supabase
          .from('alert_history')
          .update(updates)
          .eq('id', alert_id)
          .select()
          .single();

        if (error) throw error;
        return { alert };
      },
      { correlationId, route: '/api/admin/alerts/history', method: 'PUT', userId, alertId: alert_id }
    );

    logWithContext('info', 'Admin alert status updated', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'PUT',
      userId,
      alertId: alert_id,
      newStatus: status,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/history', 'PUT', true, duration);
    return NextResponse.json({ success: true, alert: result.alert });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert status update failed', {
      correlationId,
      route: '/api/admin/alerts/history',
      method: 'PUT',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/history', 'PUT', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
