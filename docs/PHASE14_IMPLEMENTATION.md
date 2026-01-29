# PHASE-14: Real-Time Alerting & Incident Response

**Status: COMPLETED**

## Objective

Implement real-time alerting based on metrics and logs to proactively notify administrators when system health degrades, errors spike, or performance thresholds are breached. This transforms passive monitoring into active incident response.

## Background

Phase 7, 10, 11, and 12 have implemented comprehensive observability:
- Correlation IDs for request tracking
- Structured logging with context
- Performance measurement
- Persistent metrics storage in database
- Route and operation metrics collection

However, there is no automated alerting when issues occur. Administrators must manually check metrics/logs to discover problems.

## Scope (in scope)

1. **Define SLIs/SLOs**:
   - Error rate thresholds (e.g., > 1% 5xx errors)
   - Latency thresholds (e.g., p95 > 2 seconds)
   - Request volume anomalies
   - Database connectivity issues

2. **Create alerting service**:
   - Alert evaluation engine (checks metrics against thresholds)
   - Alert channel integrations (email, Slack, etc.)
   - Alert deduplication and cooldown
   - Alert severity levels (critical, warning, info)

3. **Implement alert rules**:
   - High error rate alerts
   - High latency alerts
   - Low success rate alerts
   - Database connectivity alerts
   - Custom threshold alerts

4. **Create alerting endpoints**:
   - `POST /api/admin/alerts/rules` - Create/update alert rules
   - `GET /api/admin/alerts/rules` - List alert rules
   - `GET /api/admin/alerts/history` - Alert history
   - `POST /api/admin/alerts/test` - Test alert delivery

5. **Alert evaluation job**:
   - Periodic evaluation of metrics against rules
   - Trigger alerts when thresholds breached
   - Store alert history

## Out of scope

- External alerting systems (PagerDuty, OpsGenie) - future enhancement
- Alert escalation policies - future enhancement
- Machine learning-based anomaly detection - future phase
- Alert correlation and grouping - future enhancement

## Implementation pattern

### 1. Alert Rules Schema

```sql
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL, -- 'error_rate', 'latency', 'success_rate', 'request_volume'
  threshold_type TEXT NOT NULL, -- 'greater_than', 'less_than', 'equals'
  threshold_value NUMERIC NOT NULL,
  route_pattern TEXT, -- Optional: specific route or pattern
  method TEXT, -- Optional: specific HTTP method
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  enabled BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 15,
  channels JSONB, -- Array of channel configs: [{"type": "email", "recipients": [...]}, {"type": "slack", "webhook": "..."}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Alert History Schema

```sql
CREATE TABLE alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  route TEXT,
  method TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'acknowledged'))
);
```

### 3. Alert Evaluation Service

Create a service that:
- Queries metrics from database
- Evaluates against alert rules
- Triggers alerts when thresholds breached
- Handles cooldown periods
- Stores alert history

### 4. Alert Channels

Implement channel handlers:
- Email (via SendGrid, SES, or Supabase SMTP)
- Slack webhook
- Webhook (generic HTTP POST)

## Tasks

| Task | Priority | Status |
|------|----------|--------|
| Create database migration for alert_rules and alert_history | High | ⬜ |
| Create alert evaluation service | High | ⬜ |
| Implement email alert channel | High | ⬜ |
| Implement Slack webhook channel | Medium | ⬜ |
| Create alert rules management endpoints | Medium | ⬜ |
| Create alert evaluation job/scheduler | Medium | ⬜ |
| Add alert history endpoint | Low | ⬜ |
| Test alert triggering | High | ⬜ |
| Test alert cooldown | Medium | ⬜ |

## Files to create

- `supabase/migrations/YYYYMMDD_create_alerting_tables.sql` - Alert rules and history tables
- `lib/alerting/rules.ts` - Alert rule management
- `lib/alerting/evaluator.ts` - Alert evaluation engine
- `lib/alerting/channels.ts` - Alert channel implementations
- `lib/alerting/index.ts` - Export all alerting utilities
- `app/api/admin/alerts/rules/route.ts` - Alert rules CRUD
- `app/api/admin/alerts/history/route.ts` - Alert history
- `app/api/admin/alerts/test/route.ts` - Test alert delivery
- `scripts/evaluate-alerts.ts` - Alert evaluation job (can be cron)

## Files to update

- `docs/PHASE14_IMPLEMENTATION.md` - This document

## Configuration

Add to environment variables:

```env
# Alerting configuration
ALERTING_ENABLED=true
ALERTING_EVALUATION_INTERVAL_MINUTES=5

# Email channel (if using)
ALERT_EMAIL_FROM=noreply@yourdomain.com
ALERT_EMAIL_TO=admin@yourdomain.com
SENDGRID_API_KEY=... # or use Supabase SMTP

# Slack channel (if using)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Default alert thresholds
DEFAULT_ERROR_RATE_THRESHOLD=0.01  # 1%
DEFAULT_LATENCY_P95_THRESHOLD_MS=2000  # 2 seconds
```

## Testing

1. Test alert rule creation
2. Test alert evaluation against metrics
3. Test alert triggering (email, Slack)
4. Test alert cooldown (no duplicate alerts)
5. Test alert resolution
6. Test alert history retrieval
7. Test alert deduplication

## Success criteria

- Alert rules can be created and managed
- Alerts are evaluated periodically
- Alerts are triggered when thresholds breached
- Alerts are delivered via configured channels
- Alert cooldown prevents spam
- Alert history is maintained
- Administrators are notified of issues in real-time
