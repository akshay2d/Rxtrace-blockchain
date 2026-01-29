// PHASE-12: Metrics storage abstraction
// Provides interface for different storage backends (in-memory, database, etc.)

import { RouteMetrics, OperationMetrics } from './metrics';

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * PHASE-12: Metrics storage interface
 * Implementations can use in-memory, database, Redis, etc.
 */
export interface MetricsStorage {
  /**
   * Record a route metric
   */
  recordRouteMetric(
    route: string,
    method: string,
    success: boolean,
    duration: number
  ): Promise<void>;

  /**
   * Record an operation metric
   */
  recordOperationMetric(
    operation: string,
    success: boolean,
    duration: number
  ): Promise<void>;

  /**
   * Get route metrics, optionally filtered by route, method, and time range
   */
  getRouteMetrics(
    route?: string,
    method?: string,
    timeRange?: TimeRange
  ): Promise<RouteMetrics[]>;

  /**
   * Get operation metrics, optionally filtered by operation and time range
   */
  getOperationMetrics(
    operation?: string,
    timeRange?: TimeRange
  ): Promise<OperationMetrics[]>;

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Promise<{
    totalRoutes: number;
    totalOperations: number;
    totalRouteRequests: number;
    totalOperationExecutions: number;
  }>;

  /**
   * Reset all metrics (for testing)
   */
  resetMetrics(): Promise<void>;
}
