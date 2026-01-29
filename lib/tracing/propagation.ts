// PHASE-15: Trace context propagation
// Handles propagation of trace context across service boundaries

import { context, propagation, Context } from '@opentelemetry/api';

/**
 * PHASE-15: Inject trace context into headers for external API calls
 */
export function injectTraceContext(headers: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

/**
 * PHASE-15: Extract trace context from headers
 */
export function extractTraceContext(headers: Headers | Record<string, string>): Context {
  let headerMap: Record<string, string>;

  if (headers instanceof Headers) {
    headerMap = Object.fromEntries(headers.entries());
  } else {
    headerMap = headers;
  }

  return propagation.extract(context.active(), headerMap);
}

/**
 * PHASE-15: Run a function with extracted trace context
 */
export async function withTraceContext<T>(
  headers: Headers | Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const extractedContext = extractTraceContext(headers);
  return await context.with(extractedContext, fn);
}
