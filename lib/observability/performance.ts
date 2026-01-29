// PHASE-7: Performance measurement utilities
// PHASE-15: Integrated with OpenTelemetry spans
// Provides timing and performance tracking for operations

import { logWithContext, LogContext } from './logging';
import { withSpan, addSpanAttributes } from '../tracing';

/**
 * PHASE-7: Measure performance of an async operation
 * PHASE-15: Creates OpenTelemetry span for the operation
 * Returns the result and duration in milliseconds
 */
export async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  
  // PHASE-15: Create span for this operation
  return await withSpan(
    operation,
    async (span) => {
      // Add context attributes to span
      if (context) {
        addSpanAttributes({
          ...Object.fromEntries(
            Object.entries(context).map(([k, v]) => [k, String(v)])
          ),
        });
      }

      try {
        const result = await fn();
        const duration = Date.now() - startTime;
        
        span.setAttribute('duration_ms', duration);
        span.setAttribute('success', true);
        
        logWithContext('debug', `Performance: ${operation}`, {
          ...context,
          operation,
          duration,
          success: true,
        });
        
        return { result, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        
        span.setAttribute('duration_ms', duration);
        span.setAttribute('success', false);
        
        logWithContext('error', `Performance: ${operation} failed`, {
          ...context,
          operation,
          duration,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw error;
      }
    },
    {
      operation,
      ...(context ? Object.fromEntries(
        Object.entries(context).map(([k, v]) => [k, String(v)])
      ) : {}),
    }
  );
}

/**
 * PHASE-7: Measure performance of a synchronous operation
 */
export function measurePerformanceSync<T>(
  operation: string,
  fn: () => T,
  context?: LogContext
): { result: T; duration: number } {
  const startTime = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - startTime;
    
    logWithContext('debug', `Performance: ${operation}`, {
      ...context,
      operation,
      duration,
      success: true,
    });
    
    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', `Performance: ${operation} failed`, {
      ...context,
      operation,
      duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}

/**
 * PHASE-7: Create a performance timer
 * Useful for measuring multiple operations within a single function
 */
export function createTimer(operation: string, context?: LogContext) {
  const startTime = Date.now();
  
  return {
    /**
     * Mark a checkpoint in the operation
     */
    checkpoint(checkpointName: string, additionalContext?: LogContext): number {
      const elapsed = Date.now() - startTime;
      logWithContext('debug', `Performance checkpoint: ${operation}.${checkpointName}`, {
        ...context,
        ...additionalContext,
        operation: `${operation}.${checkpointName}`,
        duration: elapsed,
        checkpoint: checkpointName,
      });
      return elapsed;
    },
    
    /**
     * Finish timing and return duration
     */
    finish(): number {
      const duration = Date.now() - startTime;
      logWithContext('debug', `Performance: ${operation} completed`, {
        ...context,
        operation,
        duration,
      });
      return duration;
    },
  };
}
