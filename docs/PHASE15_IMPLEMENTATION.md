# PHASE-15: Distributed Tracing & External Observability Integration

**Status: COMPLETED**

## Objective

Implement distributed tracing and integrate with external observability platforms to enable comprehensive cross-service debugging, performance analysis, and monitoring in production environments.

## Background

Phases 7, 10, 11, and 12 have implemented:
- Correlation IDs for request tracking
- Structured logging
- Performance measurement
- Persistent metrics storage

However, correlation IDs are currently only used within the Next.js application. For distributed systems or when integrating with external services (Razorpay, email providers, etc.), we need:
- Distributed tracing with trace propagation
- Integration with external observability platforms (DataDog, New Relic, Honeycomb, etc.)
- Span-based tracing for cross-service operations

## Scope (in scope)

1. **Implement OpenTelemetry SDK**:
   - Install and configure OpenTelemetry
   - Create trace providers
   - Instrument HTTP requests
   - Instrument database queries
   - Instrument external API calls

2. **Trace propagation**:
   - Propagate trace context via headers
   - Extract trace context from incoming requests
   - Maintain trace context across async operations

3. **Create spans for operations**:
   - Route handler spans
   - Database operation spans
   - External API call spans (Razorpay, email, etc.)
   - Business logic spans

4. **External observability integration**:
   - Configure exporter (DataDog, New Relic, Honeycomb, Jaeger, etc.)
   - Export traces to external platform
   - Export metrics to external platform (optional)

5. **Update existing code**:
   - Add trace context to correlation IDs
   - Create spans for critical operations
   - Propagate trace context in external API calls

## Out of scope

- Custom trace visualization UI (use external platform)
- Trace sampling strategies (use default)
- Custom trace processors (use default)
- Metrics export to Prometheus (future enhancement)

## Implementation pattern

### 1. OpenTelemetry Setup

Install dependencies:
```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/instrumentation
npm install @opentelemetry/instrumentation-http @opentelemetry/instrumentation-fetch
npm install @opentelemetry/exporter-trace-otlp-http  # or DataDog, New Relic, etc.
```

### 2. Trace Configuration

Create `lib/tracing/config.ts`:
- Initialize OpenTelemetry SDK
- Configure trace exporter
- Register instrumentations
- Set up trace context propagation

### 3. Span Creation

Wrap operations in spans:
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('rxtrace-admin');
const span = tracer.startSpan('admin.analytics.overview');
try {
  // ... operation
  span.setStatus({ code: SpanStatusCode.OK });
} catch (err) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.recordException(err);
  throw err;
} finally {
  span.end();
}
```

### 4. Trace Context Propagation

Propagate trace context in external API calls:
```typescript
import { context, propagation } from '@opentelemetry/api';

const headers: Record<string, string> = {};
propagation.inject(context.active(), headers);
// Use headers in external API call
```

## Tasks

| Task | Priority | Status |
|------|----------|--------|
| Install OpenTelemetry dependencies | High | ⬜ |
| Create tracing configuration | High | ⬜ |
| Set up trace exporter (choose platform) | High | ⬜ |
| Create span utilities | High | ⬜ |
| Integrate tracing with correlation IDs | Medium | ⬜ |
| Add spans to critical admin routes | Medium | ⬜ |
| Add spans to external API calls | Medium | ⬜ |
| Test trace propagation | High | ⬜ |
| Test trace export to external platform | High | ⬜ |
| Document trace context propagation | Low | ⬜ |

## Files to create

- `lib/tracing/config.ts` - OpenTelemetry configuration
- `lib/tracing/spans.ts` - Span creation utilities
- `lib/tracing/propagation.ts` - Trace context propagation
- `lib/tracing/index.ts` - Export all tracing utilities
- `.env.example` - Example tracing configuration

## Files to update

- `lib/observability/correlation.ts` - Integrate with trace IDs
- `lib/observability/performance.ts` - Add span creation
- Critical admin routes - Add span instrumentation
- External API calls (Razorpay, email) - Propagate trace context
- `docs/PHASE15_IMPLEMENTATION.md` - This document

## Configuration

Add to environment variables:

```env
# OpenTelemetry configuration
OTEL_SERVICE_NAME=rxtrace-admin-api
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/api/v2/traces  # or your platform
OTEL_EXPORTER_OTLP_HEADERS=DD-API-KEY=your-key  # or platform-specific headers
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp  # Optional
OTEL_METRICS_EXPORTER=otlp  # Optional

# Trace sampling
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0  # 100% sampling (adjust for production)
```

## Testing

1. Test trace creation and export
2. Test trace context propagation
3. Test span creation in routes
4. Test span creation in external API calls
5. Verify traces appear in external platform
6. Test trace correlation with logs
7. Test trace correlation with metrics

## Success criteria

- Traces are created for all admin operations
- Trace context is propagated across services
- Traces are exported to external platform
- Traces can be correlated with logs (via trace ID)
- Traces can be correlated with metrics
- External platform shows complete request traces
- Cross-service debugging is possible via traces

## Platform Options

Choose one external observability platform:

1. **DataDog** - Popular, feature-rich
2. **New Relic** - Enterprise-focused
3. **Honeycomb** - Developer-friendly
4. **Jaeger** - Open-source, self-hosted
5. **Grafana Tempo** - Open-source, integrates with Grafana
6. **Lightstep** - Performance-focused
