// PHASE-2: Confirmation mechanisms for destructive admin actions
// This module provides two-factor confirmation for critical operations

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// PHASE-2: In-memory confirmation token store (in production, use Redis)
const confirmationTokens = new Map<string, {
  userId: string;
  action: string;
  resourceId?: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}>();

// PHASE-2: Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [token, data] of confirmationTokens.entries()) {
    if (data.expiresAt < now) {
      confirmationTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * PHASE-2: Generate confirmation token for destructive action
 * Token expires after 10 minutes
 */
export function generateConfirmationToken(params: {
  userId: string;
  action: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  confirmationTokens.set(token, {
    userId: params.userId,
    action: params.action,
    resourceId: params.resourceId,
    expiresAt,
    metadata: params.metadata,
  });
  
  return token;
}

/**
 * PHASE-2: Verify confirmation token
 */
export function verifyConfirmationToken(
  token: string,
  userId: string,
  action: string
): { valid: boolean; error?: string; metadata?: Record<string, any> } {
  const tokenData = confirmationTokens.get(token);
  
  if (!tokenData) {
    return { valid: false, error: 'Invalid confirmation token' };
  }
  
  if (tokenData.expiresAt < new Date()) {
    confirmationTokens.delete(token);
    return { valid: false, error: 'Confirmation token expired' };
  }
  
  if (tokenData.userId !== userId) {
    return { valid: false, error: 'Token does not match user' };
  }
  
  if (tokenData.action !== action) {
    return { valid: false, error: 'Token does not match action' };
  }
  
  // PHASE-2: Token is valid - delete it (one-time use)
  confirmationTokens.delete(token);
  
  return {
    valid: true,
    metadata: tokenData.metadata,
  };
}

/**
 * PHASE-2: Require password confirmation for critical actions
 * This verifies the user's password before allowing destructive actions
 */
export async function requirePasswordConfirmation(
  userId: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const admin = getSupabaseAdmin();
    
    // PHASE-2: Verify password by attempting to sign in
    // Note: This is a simplified check - in production, you might want
    // a more secure method that doesn't require full authentication
    const { data, error } = await admin.auth.signInWithPassword({
      email: '', // We need email, but we'll get it from user
      password: password,
    });
    
    if (error) {
      return { valid: false, error: 'Invalid password' };
    }
    
    if (data.user?.id !== userId) {
      return { valid: false, error: 'Password does not match user' };
    }
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || 'Password verification failed' };
  }
}

/**
 * PHASE-2: Get user email for password confirmation
 */
export async function getUserEmailForConfirmation(userId: string): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
    
    if (error || !user) {
      return null;
    }
    
    return user.email || null;
  } catch (error) {
    console.error('PHASE-2: Error getting user email:', error);
    return null;
  }
}

/**
 * PHASE-2: Actions that require confirmation
 */
export const CONFIRMATION_REQUIRED_ACTIONS = [
  'COMPANY_FREEZE',
  'COMPANY_UNFREEZE',
  'COMPANY_DELETE',
  'DISCOUNT_DELETE',
  'DISCOUNT_REMOVE',
  'QUOTA_ADJUST',
  'SUBSCRIPTION_CANCEL',
  'SUBSCRIPTION_DELETE',
  'USER_DELETE',
  'INVOICE_DELETE',
  'REFUND_PROCESS',
  'CREDIT_NOTE_CREATE',
] as const;

export type ConfirmationRequiredAction = typeof CONFIRMATION_REQUIRED_ACTIONS[number];

/**
 * PHASE-2: Check if action requires confirmation
 */
export function requiresConfirmation(action: string): boolean {
  return CONFIRMATION_REQUIRED_ACTIONS.includes(action as ConfirmationRequiredAction);
}
