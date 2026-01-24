/**
 * Simple in-memory rate limiting utility
 * Uses LRU cache to track request counts per identifier
 */

// Simple in-memory cache with TTL
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Cleanup expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitCache.entries()) {
      if (value.resetAt < now) {
        rateLimitCache.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Check if request is within rate limit
 * @param identifier - Unique identifier (e.g., device_fingerprint)
 * @param maxRequests - Maximum requests allowed in the time window
 * @param windowMs - Time window in milliseconds (default: 1 hour)
 * @returns true if within limit, false if exceeded
 */
export function rateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): boolean {
  const now = Date.now();
  const entry = rateLimitCache.get(identifier);

  if (!entry || entry.resetAt < now) {
    // First request or window expired - reset
    rateLimitCache.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    // Rate limit exceeded
    return false;
  }

  // Increment count
  entry.count++;
  return true;
}

/**
 * Get remaining requests for an identifier
 * @param identifier - Unique identifier
 * @param maxRequests - Maximum requests allowed
 * @returns Number of remaining requests, or maxRequests if no entry exists
 */
export function getRemainingRequests(
  identifier: string,
  maxRequests: number = 10
): number {
  const entry = rateLimitCache.get(identifier);
  if (!entry || entry.resetAt < Date.now()) {
    return maxRequests;
  }
  return Math.max(0, maxRequests - entry.count);
}
