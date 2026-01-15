/**
 * Application configuration helper
 * Provides environment-aware settings for the application
 */

/**
 * Get the application URL based on environment
 * Returns production URL from env var, or localhost for development
 */
export function getAppUrl(): string {
  // In production, always use the configured production URL
  if (process.env.NODE_ENV === 'production') {
    return process.env.NEXT_PUBLIC_APP_URL || 'https://rxtrace.in';
  }
  
  // In development, use localhost
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get Supabase configuration
 */
export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

/**
 * Get Razorpay configuration
 */
export function getRazorpayConfig() {
  return {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    isLive: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') || false,
  };
}
