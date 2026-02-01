/**
 * Production environment validation.
 * Call from health check or startup to fail fast if critical vars are missing.
 */

const PRODUCTION_REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

/** At least one of these must be set for admin client */
const SERVICE_KEY_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'] as const;

/** Webhook signature verification (required for Razorpay webhook route) */

/**
 * Returns list of missing env var names for production.
 * Empty array means all required vars are set.
 */
export function getMissingProductionEnv(): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  const missing: string[] = [];
  for (const key of PRODUCTION_REQUIRED) {
    const val = process.env[key];
    if (!val || String(val).trim() === '') missing.push(key);
  }
  const hasServiceKey = SERVICE_KEY_KEYS.some((k) => process.env[k]?.trim());
  if (!hasServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
  const hasRazorpay = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (hasRazorpay && !process.env.RAZORPAY_KEY_SECRET?.trim()) missing.push('RAZORPAY_KEY_SECRET');
  return missing;
}

/**
 * Returns true if Razorpay webhook can verify signatures (needed for /api/razorpay/webhook).
 */
export function hasWebhookSecret(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim());
}

/**
 * Throws if in production and required env vars are missing.
 */
export function assertProductionEnv(): void {
  const missing = getMissingProductionEnv();
  if (missing.length > 0) {
    throw new Error(`Missing required production env: ${missing.join(', ')}`);
  }
}
