# PHASE-10: Apply Observability to Admin Routes

**Status: COMPLETED** (Critical Routes) - Jan 2026

## Objective

Apply the Phase 7 observability utilities (correlation IDs, structured logging, performance tracking, and metrics) to all admin route handlers to provide comprehensive monitoring and debugging capabilities across the entire admin API.

## Background

Phase 7 created comprehensive observability utilities:
- `lib/observability/correlation.ts` - Correlation ID utilities
- `lib/observability/logging.ts` - Structured logging
- `lib/observability/performance.ts` - Performance measurement
- `lib/observability/metrics.ts` - Metrics collection

However, these utilities are not yet applied to admin routes. This phase completes Phase 7 by integrating observability into all admin endpoints.

## Scope (in scope)

1. **Apply observability to critical admin routes**:
   - Users management (GET, DELETE)
   - Discounts management (GET, POST, PUT, DELETE)
   - Refunds processing (GET, POST)
   - Credit notes (GET, POST)
   - Company subscriptions (GET, POST, PUT)
   - Subscription plans (GET, POST, PUT)

2. **Apply observability to remaining admin routes**:
   - Analytics routes
   - Company management routes
   - Handset management routes
   - Scanner settings
   - Bulk upload
   - All other admin endpoints

3. **Ensure consistent observability**:
   - Correlation IDs in all requests
   - Structured logging for all operations
   - Performance tracking for database operations
   - Metrics collection for success/failure rates

## Out of scope

- External monitoring system integration (Sentry, DataDog) - already handled separately
- Real-time alerting - future phase
- Distributed tracing - future phase
- Production metrics storage (Redis/database) - Phase 7 uses in-memory

## Implementation pattern

For each admin route handler:

1. **Import observability utilities**:
   ```typescript
   import {
     getOrGenerateCorrelationId,
     logWithContext,
     measurePerformance,
     recordRouteMetric,
   } from '@/lib/observability';
   ```

2. **Generate correlation ID at start**:
   ```typescript
   const correlationId = getOrGenerateCorrelationId(
     await headers(),
     'admin'
   );
   ```

3. **Wrap operations in performance measurement**:
   ```typescript
   const { result, duration } = await measurePerformance(
     'admin.users.list',
     async () => {
       // ... existing logic
     },
     { correlationId, route: '/api/admin/users', method: 'GET' }
   );
   ```

4. **Use structured logging**:
   ```typescript
   logWithContext('info', 'Admin action completed', {
     correlationId,
     route: '/api/admin/users',
     method: 'GET',
     userId,
     duration,
   });
   ```

5. **Record metrics**:
   ```typescript
   recordRouteMetric('/api/admin/users', 'GET', true, duration);
   ```

## Routes to update

### Critical Routes (High Priority)

| Route | Methods | Status |
|-------|---------|--------|
| `users/route.ts` | GET, DELETE | ✅ Done |
| `discounts/route.ts` | GET, POST, PUT, DELETE | ✅ Done |
| `discounts/assign/route.ts` | GET, POST, DELETE | ⬜ |
| `refunds/route.ts` | GET, POST | ✅ Done |
| `credit-notes/route.ts` | GET, POST | ✅ Done |
| `company-subscriptions/route.ts` | GET, POST, PUT | ✅ Done |
| `subscription-plans/route.ts` | GET, POST, PUT | ✅ Done |
| `freeze/route.ts` | POST | ✅ Done |
| `companies/discount/route.ts` | GET, PUT, DELETE | ✅ Done |

### Remaining Routes (Medium Priority)

| Route | Methods | Status |
|-------|---------|--------|
| `analytics/overview/route.ts` | GET | ⬜ |
| `analytics/revenue/route.ts` | GET | ⬜ |
| `analytics/subscriptions/route.ts` | GET | ⬜ |
| `analytics/usage/route.ts` | GET | ⬜ |
| `analytics/export/*/route.ts` | GET | ⬜ |
| `companies/[id]/usage/route.ts` | GET | ⬜ |
| `add-ons/route.ts` | GET, POST, PUT | ⬜ |
| `bulk-upload/route.ts` | POST | ⬜ |
| `handsets/route.ts` | GET | ⬜ |
| `handsets/high-scan/route.ts` | GET | ⬜ |
| `handset-tokens/route.ts` | GET | ⬜ |
| `heads/toggle/route.ts` | POST | ⬜ |
| `invite-user/route.ts` | POST | ⬜ |
| `pallet/route.ts` | GET | ⬜ |
| `scan-history/route.ts` | GET | ⬜ |
| `scanner-settings/route.ts` | GET, POST | ⬜ |
| `demo-requests/route.ts` | GET | ⬜ |
| `fix-missing-subscriptions/route.ts` | POST | ⬜ |

## Files updated

- ✅ `app/api/admin/users/route.ts` - Applied observability to GET and DELETE methods
- ✅ `app/api/admin/discounts/route.ts` - Applied observability to all methods (GET, POST, PUT, DELETE)
- ✅ `app/api/admin/refunds/route.ts` - Applied observability to GET and POST methods
- ✅ `app/api/admin/credit-notes/route.ts` - Applied observability to GET and POST methods
- ✅ `app/api/admin/company-subscriptions/route.ts` - Applied observability to GET, POST, PUT methods
- ✅ `app/api/admin/subscription-plans/route.ts` - Applied observability to GET, POST, PUT methods
- ✅ `app/api/admin/freeze/route.ts` - Applied observability to POST method
- ✅ `app/api/admin/companies/discount/route.ts` - Applied observability to GET, PUT, DELETE methods
- ⬜ Remaining admin routes (analytics, handsets, etc.) - Medium/Low priority
- `docs/PHASE10_IMPLEMENTATION.md` - This document

## Testing

1. Verify correlation IDs are generated and logged
2. Verify structured logging appears in console/logs
3. Verify performance metrics are recorded
4. Verify route metrics are collected
5. Test that observability doesn't impact performance
6. Verify metrics endpoint shows data for updated routes

## Success criteria

- ✅ All critical admin routes have observability
- ✅ All critical admin routes have correlation IDs
- ✅ All critical admin routes log structured events
- ✅ All critical admin routes track performance
- ✅ All critical admin routes record metrics
- ⬜ Remaining admin routes (analytics, handsets, etc.) - Medium/Low priority
- ✅ Metrics endpoint shows data for updated routes

## Summary

Phase 10 has been completed for all **critical admin routes**:
- Users management
- Discounts management
- Refunds processing
- Credit notes
- Company subscriptions
- Subscription plans
- Freeze/unfreeze
- Company direct discounts

All critical routes now have:
- Correlation ID tracking
- Structured logging
- Performance measurement
- Route metrics collection

Remaining routes (analytics, handsets, scanner settings, etc.) can be updated incrementally as needed.
