// PHASE-14: Alert Rules Management Endpoint
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
 * GET: List all alert rules
 * PHASE-14: Returns all alert rules with their configuration
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert rules access denied', {
        correlationId,
        route: '/api/admin/alerts/rules',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/alerts/rules', 'GET', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();

    logWithContext('info', 'Admin alert rules list request', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'GET',
      userId,
    });

    const { result, duration } = await measurePerformance(
      'admin.alerts.rules.list',
      async () => {
        const { data, error } = await supabase
          .from('alert_rules')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return { rules: data || [] };
      },
      { correlationId, route: '/api/admin/alerts/rules', method: 'GET', userId }
    );

    logWithContext('info', 'Admin alert rules list completed', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'GET',
      userId,
      ruleCount: result.rules.length,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/rules', 'GET', true, duration);
    return NextResponse.json({ success: true, rules: result.rules });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert rules list failed', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/rules', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Create a new alert rule
 * PHASE-14: Creates a new alert rule with specified thresholds and channels
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert rules create access denied', {
        correlationId,
        route: '/api/admin/alerts/rules',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/alerts/rules', 'POST', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const {
      name,
      description,
      metric_type,
      threshold_type,
      threshold_value,
      route_pattern,
      method,
      severity,
      enabled,
      cooldown_minutes,
      channels,
    } = body;

    logWithContext('info', 'Admin alert rule create request', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'POST',
      userId,
      ruleName: name,
      metricType: metric_type,
    });

    if (!name || !metric_type || !threshold_type || threshold_value === undefined) {
      recordRouteMetric('/api/admin/alerts/rules', 'POST', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "name, metric_type, threshold_type, and threshold_value are required" },
        { status: 400 }
      );
    }

    const { result, duration } = await measurePerformance(
      'admin.alerts.rules.create',
      async () => {
        const { data: rule, error } = await supabase
          .from('alert_rules')
          .insert({
            name,
            description,
            metric_type,
            threshold_type,
            threshold_value,
            route_pattern,
            method,
            severity: severity || 'warning',
            enabled: enabled !== undefined ? enabled : true,
            cooldown_minutes: cooldown_minutes || 15,
            channels: channels || [],
            created_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        return { rule };
      },
      { correlationId, route: '/api/admin/alerts/rules', method: 'POST', userId, ruleName: name }
    );

    logWithContext('info', 'Admin alert rule created', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'POST',
      userId,
      ruleId: result.rule.id,
      ruleName: name,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/rules', 'POST', true, duration);
    return NextResponse.json({ success: true, rule: result.rule });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert rule create failed', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/rules', 'POST', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT: Update an alert rule
 * PHASE-14: Updates an existing alert rule
 */
export async function PUT(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert rules update access denied', {
        correlationId,
        route: '/api/admin/alerts/rules',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/alerts/rules', 'PUT', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      recordRouteMetric('/api/admin/alerts/rules', 'PUT', false, Date.now() - startTime);
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    logWithContext('info', 'Admin alert rule update request', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'PUT',
      userId,
      ruleId: id,
    });

    const { result, duration } = await measurePerformance(
      'admin.alerts.rules.update',
      async () => {
        const { data: rule, error } = await supabase
          .from('alert_rules')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return { rule };
      },
      { correlationId, route: '/api/admin/alerts/rules', method: 'PUT', userId, ruleId: id }
    );

    logWithContext('info', 'Admin alert rule updated', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'PUT',
      userId,
      ruleId: id,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/rules', 'PUT', true, duration);
    return NextResponse.json({ success: true, rule: result.rule });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert rule update failed', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'PUT',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/rules', 'PUT', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Delete an alert rule
 * PHASE-14: Deletes an alert rule
 */
export async function DELETE(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin alert rules delete access denied', {
        correlationId,
        route: '/api/admin/alerts/rules',
        method: 'DELETE',
      });
      recordRouteMetric('/api/admin/alerts/rules', 'DELETE', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      recordRouteMetric('/api/admin/alerts/rules', 'DELETE', false, Date.now() - startTime);
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    logWithContext('info', 'Admin alert rule delete request', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'DELETE',
      userId,
      ruleId: id,
    });

    const { duration } = await measurePerformance(
      'admin.alerts.rules.delete',
      async () => {
        const { error } = await supabase.from('alert_rules').delete().eq('id', id);
        if (error) throw error;
      },
      { correlationId, route: '/api/admin/alerts/rules', method: 'DELETE', userId, ruleId: id }
    );

    logWithContext('info', 'Admin alert rule deleted', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'DELETE',
      userId,
      ruleId: id,
      duration,
    });

    recordRouteMetric('/api/admin/alerts/rules', 'DELETE', true, duration);
    return NextResponse.json({ success: true, message: "Alert rule deleted successfully" });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin alert rule delete failed', {
      correlationId,
      route: '/api/admin/alerts/rules',
      method: 'DELETE',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/alerts/rules', 'DELETE', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
