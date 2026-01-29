// PHASE-15: Span creation utilities
// Provides helpers for creating and managing OpenTelemetry spans

import { trace, Span, SpanStatusCode, context, Context } from '@opentelemetry/api';

const tracer = trace.getTracer('rxtrace-admin-api');

/**
 * PHASE-15: Create a span for an operation
 */
export function createSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>
): Span {
  const span = tracer.startSpan(name);

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }

  return span;
}

/**
 * PHASE-15: Execute a function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = createSpan(name, attributes);

  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || String(error),
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * PHASE-15: Execute a synchronous function within a span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const span = createSpan(name, attributes);

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || String(error),
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * PHASE-15: Add attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
}

/**
 * PHASE-15: Get current span context
 */
export function getCurrentSpanContext(): Context | undefined {
  return context.active();
}
