// PHASE-14: Alert evaluation engine
// Evaluates metrics against alert rules and triggers alerts when thresholds are breached

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getRouteMetrics, getOperationMetrics, getMetricsSummary } from '@/lib/observability';
import { sendAlert, Alert } from './channels';
import { logWithContext } from '@/lib/observability';

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metric_type: 'error_rate' | 'latency' | 'success_rate' | 'request_volume' | 'database_health';
  threshold_type: 'greater_than' | 'less_than' | 'equals';
  threshold_value: number;
  route_pattern?: string;
  method?: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldown_minutes: number;
  channels: Array<{ type: string; config: Record<string, any> }>;
}

/**
 * PHASE-14: Evaluate metrics against alert rules
 */
export async function evaluateAlerts(): Promise<{
  evaluated: number;
  triggered: number;
  alerts: Alert[];
}> {
  const supabase = getSupabaseAdmin();
  const alerts: Alert[] = [];

  try {
    // Get all enabled alert rules
    const { data: rules, error: rulesError } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return { evaluated: 0, triggered: 0, alerts: [] };
    }

    // Get current metrics
    const routeMetrics = await getRouteMetrics();
    const operationMetrics = await getOperationMetrics();
    const summary = await getMetricsSummary();

    // Evaluate each rule
    for (const rule of rules as AlertRule[]) {
      try {
        const shouldTrigger = await evaluateRule(rule, routeMetrics, operationMetrics, summary);

        if (shouldTrigger.shouldTrigger) {
          // Check cooldown (has alert been triggered recently for this rule?)
          const { data: recentAlerts } = await supabase
            .from('alert_history')
            .select('triggered_at')
            .eq('rule_id', rule.id)
            .eq('status', 'active')
            .gte('triggered_at', new Date(Date.now() - rule.cooldown_minutes * 60 * 1000).toISOString())
            .limit(1);

          if (recentAlerts && recentAlerts.length > 0) {
            // Still in cooldown, skip
            continue;
          }

          // Create alert
          const alert: Alert = {
            ruleId: rule.id,
            alertType: rule.metric_type,
            severity: rule.severity,
            message: shouldTrigger.message,
            metricValue: shouldTrigger.metricValue,
            thresholdValue: rule.threshold_value,
            route: shouldTrigger.route,
            method: shouldTrigger.method,
            metadata: {
              rule_name: rule.name,
              threshold_type: rule.threshold_type,
            },
          };

          // Send alert via configured channels
          const sendResult = await sendAlert(alert, rule.channels as any);

          // Store alert in history
          const { error: insertError } = await supabase.from('alert_history').insert({
            rule_id: rule.id,
            alert_type: rule.metric_type,
            severity: rule.severity,
            message: shouldTrigger.message,
            metric_value: shouldTrigger.metricValue,
            threshold_value: rule.threshold_value,
            route: shouldTrigger.route,
            method: shouldTrigger.method,
            status: 'active',
            metadata: {
              channels_sent: sendResult.sent,
              channels_failed: sendResult.failed,
              channel_results: sendResult.results,
            },
          });

          if (insertError) {
            logWithContext('error', 'Failed to store alert in history', {
              ruleId: rule.id,
              error: insertError.message,
            });
          }

          alerts.push(alert);
        }
      } catch (ruleError: any) {
        logWithContext('error', 'Error evaluating alert rule', {
          ruleId: rule.id,
          ruleName: rule.name,
          error: ruleError.message || String(ruleError),
        });
      }
    }

    return {
      evaluated: rules.length,
      triggered: alerts.length,
      alerts,
    };
  } catch (error: any) {
    logWithContext('error', 'Alert evaluation failed', {
      error: error.message || String(error),
    });
    throw error;
  }
}

/**
 * PHASE-14: Evaluate a single rule against metrics
 */
async function evaluateRule(
  rule: AlertRule,
  routeMetrics: any[],
  operationMetrics: any[],
  summary: any
): Promise<{
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
  route?: string;
  method?: string;
}> {
  switch (rule.metric_type) {
    case 'error_rate':
      return evaluateErrorRate(rule, routeMetrics);

    case 'latency':
      return evaluateLatency(rule, routeMetrics);

    case 'success_rate':
      return evaluateSuccessRate(rule, routeMetrics);

    case 'request_volume':
      return evaluateRequestVolume(rule, routeMetrics, summary);

    case 'database_health':
      return evaluateDatabaseHealth(rule);

    default:
      return { shouldTrigger: false, message: `Unknown metric type: ${rule.metric_type}` };
  }
}

/**
 * PHASE-14: Evaluate error rate threshold
 */
function evaluateErrorRate(rule: AlertRule, routeMetrics: any[]): {
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
  route?: string;
  method?: string;
} {
  let matchingMetrics = routeMetrics;

  // Filter by route pattern if specified
  if (rule.route_pattern) {
    const pattern = new RegExp(rule.route_pattern.replace('*', '.*'));
    matchingMetrics = routeMetrics.filter((m) => pattern.test(m.route));
  }

  // Filter by method if specified
  if (rule.method) {
    matchingMetrics = matchingMetrics.filter((m) => m.method === rule.method);
  }

  // Calculate error rate for matching routes
  let totalRequests = 0;
  let totalErrors = 0;

  for (const metric of matchingMetrics) {
    totalRequests += metric.totalRequests || 0;
    totalErrors += metric.failed || 0;
  }

  if (totalRequests === 0) {
    return { shouldTrigger: false, message: 'No requests to evaluate' };
  }

  const errorRate = totalErrors / totalRequests;
  const threshold = rule.threshold_value;

  let shouldTrigger = false;
  if (rule.threshold_type === 'greater_than') {
    shouldTrigger = errorRate > threshold;
  } else if (rule.threshold_type === 'less_than') {
    shouldTrigger = errorRate < threshold;
  } else if (rule.threshold_type === 'equals') {
    shouldTrigger = Math.abs(errorRate - threshold) < 0.001; // Small epsilon for float comparison
  }

  if (shouldTrigger) {
    return {
      shouldTrigger: true,
      message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`,
      metricValue: errorRate,
      route: rule.route_pattern,
      method: rule.method,
    };
  }

  return { shouldTrigger: false, message: 'Error rate within threshold' };
}

/**
 * PHASE-14: Evaluate latency threshold
 */
function evaluateLatency(rule: AlertRule, routeMetrics: any[]): {
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
  route?: string;
  method?: string;
} {
  let matchingMetrics = routeMetrics;

  if (rule.route_pattern) {
    const pattern = new RegExp(rule.route_pattern.replace('*', '.*'));
    matchingMetrics = routeMetrics.filter((m) => pattern.test(m.route));
  }

  if (rule.method) {
    matchingMetrics = matchingMetrics.filter((m) => m.method === rule.method);
  }

  if (matchingMetrics.length === 0) {
    return { shouldTrigger: false, message: 'No matching routes to evaluate' };
  }

  // Calculate average latency
  const totalDuration = matchingMetrics.reduce((sum, m) => sum + (m.averageDuration || 0), 0);
  const avgLatency = totalDuration / matchingMetrics.length;

  let shouldTrigger = false;
  if (rule.threshold_type === 'greater_than') {
    shouldTrigger = avgLatency > rule.threshold_value;
  } else if (rule.threshold_type === 'less_than') {
    shouldTrigger = avgLatency < rule.threshold_value;
  } else if (rule.threshold_type === 'equals') {
    shouldTrigger = Math.abs(avgLatency - rule.threshold_value) < 10; // 10ms tolerance
  }

  if (shouldTrigger) {
    return {
      shouldTrigger: true,
      message: `Average latency ${avgLatency.toFixed(0)}ms ${rule.threshold_type === 'greater_than' ? 'exceeds' : 'below'} threshold ${rule.threshold_value}ms`,
      metricValue: avgLatency,
      route: rule.route_pattern,
      method: rule.method,
    };
  }

  return { shouldTrigger: false, message: 'Latency within threshold' };
}

/**
 * PHASE-14: Evaluate success rate threshold
 */
function evaluateSuccessRate(rule: AlertRule, routeMetrics: any[]): {
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
  route?: string;
  method?: string;
} {
  let matchingMetrics = routeMetrics;

  if (rule.route_pattern) {
    const pattern = new RegExp(rule.route_pattern.replace('*', '.*'));
    matchingMetrics = routeMetrics.filter((m) => pattern.test(m.route));
  }

  if (rule.method) {
    matchingMetrics = matchingMetrics.filter((m) => m.method === rule.method);
  }

  let totalRequests = 0;
  let totalSuccess = 0;

  for (const metric of matchingMetrics) {
    totalRequests += metric.totalRequests || 0;
    totalSuccess += metric.successful || 0;
  }

  if (totalRequests === 0) {
    return { shouldTrigger: false, message: 'No requests to evaluate' };
  }

  const successRate = totalSuccess / totalRequests;

  let shouldTrigger = false;
  if (rule.threshold_type === 'less_than') {
    shouldTrigger = successRate < rule.threshold_value;
  } else if (rule.threshold_type === 'greater_than') {
    shouldTrigger = successRate > rule.threshold_value;
  } else if (rule.threshold_type === 'equals') {
    shouldTrigger = Math.abs(successRate - rule.threshold_value) < 0.001;
  }

  if (shouldTrigger) {
    return {
      shouldTrigger: true,
      message: `Success rate ${(successRate * 100).toFixed(2)}% ${rule.threshold_type === 'less_than' ? 'below' : 'exceeds'} threshold ${(rule.threshold_value * 100).toFixed(2)}%`,
      metricValue: successRate,
      route: rule.route_pattern,
      method: rule.method,
    };
  }

  return { shouldTrigger: false, message: 'Success rate within threshold' };
}

/**
 * PHASE-14: Evaluate request volume threshold
 */
function evaluateRequestVolume(
  rule: AlertRule,
  routeMetrics: any[],
  summary: any
): {
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
  route?: string;
  method?: string;
} {
  let volume = 0;

  if (rule.route_pattern || rule.method) {
    // Calculate volume for specific routes/methods
    let matchingMetrics = routeMetrics;
    if (rule.route_pattern) {
      const pattern = new RegExp(rule.route_pattern.replace('*', '.*'));
      matchingMetrics = routeMetrics.filter((m) => pattern.test(m.route));
    }
    if (rule.method) {
      matchingMetrics = matchingMetrics.filter((m) => m.method === rule.method);
    }
    volume = matchingMetrics.reduce((sum, m) => sum + (m.totalRequests || 0), 0);
  } else {
    // Use total volume from summary
    volume = summary.totalRouteRequests || 0;
  }

  let shouldTrigger = false;
  if (rule.threshold_type === 'greater_than') {
    shouldTrigger = volume > rule.threshold_value;
  } else if (rule.threshold_type === 'less_than') {
    shouldTrigger = volume < rule.threshold_value;
  } else if (rule.threshold_type === 'equals') {
    shouldTrigger = Math.abs(volume - rule.threshold_value) < 1;
  }

  if (shouldTrigger) {
    return {
      shouldTrigger: true,
      message: `Request volume ${volume} ${rule.threshold_type === 'greater_than' ? 'exceeds' : 'below'} threshold ${rule.threshold_value}`,
      metricValue: volume,
      route: rule.route_pattern,
      method: rule.method,
    };
  }

  return { shouldTrigger: false, message: 'Request volume within threshold' };
}

/**
 * PHASE-14: Evaluate database health
 */
async function evaluateDatabaseHealth(rule: AlertRule): Promise<{
  shouldTrigger: boolean;
  message: string;
  metricValue?: number;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('companies').select('id').limit(1);

    const isHealthy = !error;
    const healthValue = isHealthy ? 1 : 0;

    let shouldTrigger = false;
    if (rule.threshold_type === 'less_than') {
      shouldTrigger = healthValue < rule.threshold_value;
    } else if (rule.threshold_type === 'equals') {
      shouldTrigger = healthValue === rule.threshold_value;
    }

    if (shouldTrigger) {
      return {
        shouldTrigger: true,
        message: `Database health check failed: ${error?.message || 'Unknown error'}`,
        metricValue: healthValue,
      };
    }

    return { shouldTrigger: false, message: 'Database health check passed' };
  } catch (error: any) {
    return {
      shouldTrigger: true,
      message: `Database health check error: ${error.message || String(error)}`,
      metricValue: 0,
    };
  }
}
