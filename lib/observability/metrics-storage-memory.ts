// PHASE-12: In-memory metrics storage implementation
// Provides backward compatibility with Phase 7 in-memory storage

import { MetricsStorage, TimeRange } from './metrics-storage';
import { RouteMetrics, OperationMetrics } from './metrics';

/**
 * PHASE-12: In-memory metrics storage
 * Uses Map-based storage (same as Phase 7 implementation)
 */
export class MemoryMetricsStorage implements MetricsStorage {
  private routeMetrics = new Map<string, RouteMetrics>();
  private operationMetrics = new Map<string, OperationMetrics>();

  async recordRouteMetric(
    route: string,
    method: string,
    success: boolean,
    duration: number
  ): Promise<void> {
    const key = `${method}:${route}`;
    const existing = this.routeMetrics.get(key);
    const now = new Date().toISOString();

    if (existing) {
      existing.totalRequests++;
      if (success) {
        existing.successful++;
      } else {
        existing.failed++;
      }
      // Update average duration (simple moving average)
      const totalTime = existing.averageDuration * (existing.totalRequests - 1) + duration;
      existing.averageDuration = totalTime / existing.totalRequests;
      existing.lastRequest = now;
    } else {
      this.routeMetrics.set(key, {
        route,
        method,
        totalRequests: 1,
        successful: success ? 1 : 0,
        failed: success ? 0 : 1,
        averageDuration: duration,
        lastRequest: now,
      });
    }
  }

  async recordOperationMetric(
    operation: string,
    success: boolean,
    duration: number
  ): Promise<void> {
    const existing = this.operationMetrics.get(operation);
    const now = new Date().toISOString();

    if (existing) {
      existing.totalExecutions++;
      if (success) {
        existing.successful++;
      } else {
        existing.failed++;
      }
      // Update average duration (simple moving average)
      const totalTime = existing.averageDuration * (existing.totalExecutions - 1) + duration;
      existing.averageDuration = totalTime / existing.totalExecutions;
      existing.lastExecution = now;
    } else {
      this.operationMetrics.set(operation, {
        operation,
        totalExecutions: 1,
        successful: success ? 1 : 0,
        failed: success ? 0 : 1,
        averageDuration: duration,
        lastExecution: now,
      });
    }
  }

  async getRouteMetrics(
    route?: string,
    method?: string,
    timeRange?: TimeRange
  ): Promise<RouteMetrics[]> {
    let metrics = Array.from(this.routeMetrics.values());

    // Filter by route if provided
    if (route) {
      metrics = metrics.filter(m => m.route === route);
    }

    // Filter by method if provided
    if (method) {
      metrics = metrics.filter(m => m.method === method);
    }

    // Filter by time range if provided
    if (timeRange) {
      metrics = metrics.filter(m => {
        if (!m.lastRequest) return false;
        const lastRequest = new Date(m.lastRequest);
        return lastRequest >= timeRange.start && lastRequest <= timeRange.end;
      });
    }

    return metrics;
  }

  async getOperationMetrics(
    operation?: string,
    timeRange?: TimeRange
  ): Promise<OperationMetrics[]> {
    let metrics = Array.from(this.operationMetrics.values());

    // Filter by operation if provided
    if (operation) {
      metrics = metrics.filter(m => m.operation === operation);
    }

    // Filter by time range if provided
    if (timeRange) {
      metrics = metrics.filter(m => {
        if (!m.lastExecution) return false;
        const lastExecution = new Date(m.lastExecution);
        return lastExecution >= timeRange.start && lastExecution <= timeRange.end;
      });
    }

    return metrics;
  }

  async getMetricsSummary(): Promise<{
    totalRoutes: number;
    totalOperations: number;
    totalRouteRequests: number;
    totalOperationExecutions: number;
  }> {
    const routes = Array.from(this.routeMetrics.values());
    const operations = Array.from(this.operationMetrics.values());

    return {
      totalRoutes: routes.length,
      totalOperations: operations.length,
      totalRouteRequests: routes.reduce((sum, r) => sum + r.totalRequests, 0),
      totalOperationExecutions: operations.reduce((sum, o) => sum + o.totalExecutions, 0),
    };
  }

  async resetMetrics(): Promise<void> {
    this.routeMetrics.clear();
    this.operationMetrics.clear();
  }
}
