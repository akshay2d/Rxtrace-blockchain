/**
 * Safe API error handling for production.
 * In production, do not expose internal error messages to clients.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Returns a safe error message for API JSON responses.
 * In production returns fallback; in development returns err message when available.
 */
export function safeApiErrorMessage(err: unknown, fallback: string): string {
  if (!isProd && err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
