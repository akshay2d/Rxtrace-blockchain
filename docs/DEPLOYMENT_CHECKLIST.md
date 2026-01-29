# Production Deployment Checklist

**Application:** RxTrace Web Application  
**Version:** 1.0.0  
**Date:** January 30, 2026

---

## Pre-Deployment

### Code & Dependencies
- [x] All code committed to version control
- [x] Dependencies installed (`npm install`)
- [x] No TypeScript errors (`npm run lint`)
- [x] Build successful (`npm run build`)
- [x] Tests passing (`npm test`)

### Database
- [ ] Database migrations reviewed
- [ ] Migration order verified:
  - [ ] `20260129_audit_logs_immutability.sql`
  - [ ] `20260129_create_metrics_tables.sql`
  - [ ] `20260129_create_audit_logs_archive.sql`
  - [ ] `20260130_create_alerting_tables.sql`
- [ ] Database backup created
- [ ] Migrations tested in staging environment

### Environment Configuration
- [ ] All environment variables documented
- [ ] Production environment variables set:
  - [ ] Database connection strings
  - [ ] Authentication secrets
  - [ ] Payment gateway credentials
  - [ ] Email/SMTP configuration
  - [ ] Slack webhook URLs (if using)
  - [ ] OpenTelemetry endpoint (if using)
- [ ] Environment variables validated
- [ ] No secrets committed to repository

### Security
- [ ] Admin access verified
- [ ] Authentication flow tested
- [ ] Authorization checks confirmed
- [ ] Audit logging enabled
- [ ] Input validation active
- [ ] CORS configured correctly

---

## Deployment Steps

### 1. Database Setup
```sql
-- Run migrations in Supabase dashboard or via CLI
-- Order: 20260129_* then 20260130_*
```

### 2. Application Deployment
```bash
# Build application
npm run build

# Start application
npm start
```

### 3. Health Check
- [ ] Verify `/api/admin/health` returns 200
- [ ] Verify `/api/admin/metrics` returns data
- [ ] Verify `/api/admin/stats` returns statistics

### 4. Initial Configuration

#### Create Default Alert Rules
```bash
# Example: High Error Rate Alert
curl -X POST https://your-domain.com/api/admin/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate",
    "metric_type": "error_rate",
    "threshold_type": "greater_than",
    "threshold_value": 0.01,
    "severity": "critical",
    "channels": [
      {
        "type": "email",
        "config": {
          "recipients": ["admin@yourdomain.com"]
        }
      }
    ]
  }'
```

#### Test Alert Evaluation
```bash
# Manual trigger
curl -X POST https://your-domain.com/api/admin/alerts/evaluate
```

### 5. Scheduled Jobs Setup

#### Alert Evaluation (Every 5 minutes)
```bash
# Cron job example
*/5 * * * * cd /path/to/app && npm run alerts:evaluate >> /var/log/alerts.log 2>&1
```

#### Audit Log Archival (Daily)
```bash
# Cron job example (runs at 2 AM daily)
0 2 * * * curl -X POST https://your-domain.com/api/admin/audit-logs/archive
```

---

## Post-Deployment Verification

### Functional Testing
- [ ] User login/logout works
- [ ] Admin routes accessible (admin users only)
- [ ] Company management functions
- [ ] Subscription management functions
- [ ] Payment processing (test mode)
- [ ] Analytics endpoints return data
- [ ] Bulk upload works

### Observability Verification
- [ ] Correlation IDs appear in logs
- [ ] Metrics being collected (check `/api/admin/metrics`)
- [ ] Performance tracking active
- [ ] Audit logs being created
- [ ] Tracing spans created (if OpenTelemetry configured)

### Alerting Verification
- [ ] Alert rules created successfully
- [ ] Alert evaluation runs without errors
- [ ] Email alerts delivered (test)
- [ ] Slack alerts delivered (if configured)
- [ ] Alert history accessible

### Performance Testing
- [ ] API response times acceptable (< 2s for most endpoints)
- [ ] Database queries optimized
- [ ] No memory leaks detected
- [ ] Concurrent request handling verified

---

## Monitoring Setup

### Key Metrics to Monitor
- [ ] Request rate (requests/minute)
- [ ] Error rate (4xx, 5xx percentage)
- [ ] Average latency (p50, p95, p99)
- [ ] Database connection pool usage
- [ ] Alert trigger frequency
- [ ] Trace sampling rate

### Alert Rules to Create
- [ ] High error rate (> 1%)
- [ ] High latency (> 2 seconds)
- [ ] Low success rate (< 95%)
- [ ] Database connectivity issues
- [ ] High request volume anomalies

### Dashboards (if using external platform)
- [ ] Request metrics dashboard
- [ ] Error rate dashboard
- [ ] Latency distribution dashboard
- [ ] Alert history dashboard

---

## Rollback Plan

### If Issues Detected
1. **Immediate Rollback:**
   - Revert to previous deployment
   - Restore database backup if needed
   - Notify team

2. **Partial Rollback:**
   - Disable new features via feature flags
   - Revert specific migrations (if safe)
   - Monitor closely

3. **Communication:**
   - Notify stakeholders
   - Document issues
   - Create incident report

---

## Post-Launch Tasks

### Week 1
- [ ] Monitor error rates daily
- [ ] Review alert history
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Review audit logs

### Week 2-4
- [ ] Performance optimization (if needed)
- [ ] Alert rule tuning
- [ ] Documentation updates
- [ ] Team training (if needed)

### Ongoing
- [ ] Weekly metrics review
- [ ] Monthly security audit
- [ ] Quarterly performance review
- [ ] Regular dependency updates

---

## Support Contacts

### Technical Issues
- Check logs: `/var/log/app.log` (or configured location)
- Check metrics: `/api/admin/metrics`
- Check alerts: `/api/admin/alerts/history`

### Emergency Contacts
- [ ] DevOps team contact
- [ ] Database administrator
- [ ] Security team
- [ ] Product owner

---

## Sign-Off

**Deployment Date:** _______________

**Deployed By:** _______________

**Verified By:** _______________

**Status:** ⬜ Ready for Production | ⬜ Issues Found (see notes)

**Notes:**
_________________________________________________
_________________________________________________
_________________________________________________

---

**Last Updated:** January 30, 2026
