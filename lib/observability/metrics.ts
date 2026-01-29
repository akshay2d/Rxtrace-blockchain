// PHASE-7: Metrics collection and aggregation
// PHASE-12: Now supports both in-memory and database storage

import { MetricsStorage, TimeRange } from './metrics-storage';
import { MemoryMetricsStorage } from './metrics-storage-memory';
import { DatabaseMetricsStorage } from './metrics-storage-db';

export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: string;
}

export interface RouteMetrics {
  route: string;
  method: string;
  totalRequests: number;
  successful: number;
  failed: number;
  averageDuration: number;
  lastRequest: string | null;
}

export interface OperationMetrics {
  operation: string;
  totalExecutions: number;
  successful: number;
  failed: number;
  averageDuration: number;
  lastExecution: string | null;
}

// PHASE-12: Initialize storage based on environment variable
function getStorage(): MetricsStorage {
  const storageMode = process.env.OBSERVABILITY_METRICS_STORAGE || 'memory';
  
  if (storageMode === 'database') {
    try {
      return new DatabaseMetricsStorage();
    } catch (error) {
      console.error('Failed to initialize database metrics storage, falling back to memory:', error);
      return new MemoryMetricsStorage();
    }
  }
  
  return new MemoryMetricsStorage();
}

// PHASE-12: Use storage abstraction
const storage: MetricsStorage = getStorage();

/**
 * PHASE-7: Record a metric for a route
 * PHASE-12: Now uses storage abstraction (memory or database)
 * Note: This is fire-and-forget for backward compatibility
 */
export function recordRouteMetric(
  route: string,
  method: string,
  success: boolean,
  duration: number
): void {
  // Fire and forget - don't block (backward compatible)
  storage.recordRouteMetric(route, method, success, duration).catch(err => {
    console.error('Failed to record route metric:', err);
  });
}

/**
 * PHASE-12: Async version when you need to await completion
 */
export async function recordRouteMetricAsync(
  route: string,
  method: string,
  success: boolean,
  duration: number
): Promise<void> {
  await storage.recordRouteMetric(route, method, success, duration);
}

/**
 * PHASE-7: Record a metric for an operation
 * PHASE-12: Now uses storage abstraction (memory or database)
 * Note: This is fire-and-forget for backward compatibility
 */
export function recordOperationMetric(
  operation: string,
  success: boolean,
  duration: number
): void {
  // Fire and forget - don't block (backward compatible)
  storage.recordOperationMetric(operation, success, duration).catch(err => {
    console.error('Failed to record operation metric:', err);
  });
}

/**
 * PHASE-12: Async version when you need to await completion
 */
export async function recordOperationMetricAsync(
  operation: string,
  success: boolean,
  duration: number
): Promise<void> {
  await storage.recordOperationMetric(operation, success, duration);
}

/**
 * PHASE-7: Get all route metrics
 * PHASE-12: Now supports time range filtering and is async
 */
export async function getRouteMetrics(
  route?: string,
  method?: string,
  timeRange?: TimeRange
): Promise<RouteMetrics[]> {
  return await storage.getRouteMetrics(route, method, timeRange);
}

/**
 * PHASE-7: Get all operation metrics
 * PHASE-12: Now supports time range filtering and is async
 */
export async function getOperationMetrics(
  operation?: string,
  timeRange?: TimeRange
): Promise<OperationMetrics[]> {
  return await storage.getOperationMetrics(operation, timeRange);
}

/**
 * PHASE-7: Get metrics for a specific route
 * PHASE-12: Now async and supports time range
 */
export async function getRouteMetric(
  route: string,
  method: string,
  timeRange?: TimeRange
): Promise<RouteMetrics | null> {
  const metrics = await storage.getRouteMetrics(route, method, timeRange);
  return metrics.length > 0 ? metrics[0] : null;
}

/**
 * PHASE-7: Get metrics for a specific operation
 * PHASE-12: Now async and supports time range
 */
export async function getOperationMetric(
  operation: string,
  timeRange?: TimeRange
): Promise<OperationMetrics | null> {
  const metrics = await storage.getOperationMetrics(operation, timeRange);
  return metrics.length > 0 ? metrics[0] : null;
}

/**
 * PHASE-7: Reset all metrics (for testing or periodic reset)
 * PHASE-12: Now async
 */
export async function resetMetrics(): Promise<void> {
  await storage.resetMetrics();
}

/**
 * PHASE-7: Get summary statistics
 * PHASE-12: Now async
 */
export async function getMetricsSummary(): Promise<{
  totalRoutes: number;
  totalOperations: number;
  totalRouteRequests: number;
  totalOperationExecutions: number;
}> {
  return await storage.getMetricsSummary();
}

// PHASE-12: Export TimeRange type for convenience
export type { TimeRange } from './metrics-storage';
