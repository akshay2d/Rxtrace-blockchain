// PHASE-7: Correlation ID utilities for request tracking
// PHASE-15: Integrated with OpenTelemetry trace IDs
// Provides unique identifiers to track requests across the system

import { trace } from '@opentelemetry/api';

/**
 * PHASE-7: Generate a unique correlation ID for request tracking
 * PHASE-15: Uses trace ID if available, otherwise generates one
 * Format: {prefix}_{timestamp}_{random}
 */
export function generateCorrelationId(prefix: string = 'req'): string {
  // PHASE-15: Try to use trace ID from OpenTelemetry
  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      if (spanContext.traceId) {
        // Use trace ID as correlation ID (first 16 chars for readability)
        return `${prefix}_${spanContext.traceId.substring(0, 16)}`;
      }
    }
  } catch (error) {
    // Fallback to generation if tracing not available
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * PHASE-7: Extract correlation ID from request headers
 * PHASE-15: Also checks OpenTelemetry traceparent header
 * Checks common headers: x-correlation-id, x-request-id, x-trace-id, traceparent
 */
export function getCorrelationIdFromRequest(headers: Headers | Record<string, string>): string | null {
  let correlationId: string | null = null;

  if (headers instanceof Headers) {
    correlationId = headers.get('x-correlation-id') || 
                    headers.get('x-request-id') || 
                    headers.get('x-trace-id') || 
                    null;
    
    // PHASE-15: Extract trace ID from traceparent header (OpenTelemetry format)
    if (!correlationId) {
      const traceparent = headers.get('traceparent');
      if (traceparent) {
        // traceparent format: version-trace_id-parent_id-trace_flags
        const parts = traceparent.split('-');
        if (parts.length >= 2) {
          correlationId = parts[1]; // Use trace ID
        }
      }
    }
  } else {
    const headerMap = headers as Record<string, string>;
    correlationId = headerMap['x-correlation-id'] || 
                   headerMap['x-request-id'] || 
                   headerMap['x-trace-id'] || 
                   null;
    
    // PHASE-15: Extract trace ID from traceparent header
    if (!correlationId && headerMap['traceparent']) {
      const parts = headerMap['traceparent'].split('-');
      if (parts.length >= 2) {
        correlationId = parts[1];
      }
    }
  }

  return correlationId;
}

/**
 * PHASE-7: Get or generate correlation ID for a request
 * If correlation ID exists in headers, use it; otherwise generate new one
 */
export function getOrGenerateCorrelationId(
  headers: Headers | Record<string, string>,
  prefix: string = 'req'
): string {
  const existing = getCorrelationIdFromRequest(headers);
  return existing || generateCorrelationId(prefix);
}
