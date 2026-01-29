// PHASE-2: Enhanced audit logging for admin actions
// This module provides comprehensive audit logging with full context

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export interface AdminAuditContext {
  userId: string;
  userEmail?: string | null;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  companyId?: string | null;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  requiresConfirmation?: boolean;
  confirmationToken?: string;
  status: 'success' | 'failed';
}

/**
 * PHASE-2: Write comprehensive admin action audit log
 * Includes: actor identity, IP address, user agent, before/after values, timestamps
 */
export async function writeAdminAuditLog(context: AdminAuditContext): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    
    // PHASE-2: Get request headers for IP and user agent
    let ipAddress = context.ipAddress;
    let userAgent = context.userAgent;
    
    try {
      const headersList = await headers();
      ipAddress = ipAddress || headersList.get('x-forwarded-for') || 
                  headersList.get('x-real-ip') || 
                  headersList.get('cf-connecting-ip') || 
                  'unknown';
      userAgent = userAgent || headersList.get('user-agent') || 'unknown';
    } catch (headerError) {
      // PHASE-2: Headers might not be available in all contexts
      console.warn('PHASE-2: Could not read request headers:', headerError);
    }
    
    const auditEntry = {
      action: context.action,
      company_id: context.companyId,
      actor: context.userId,
      performed_by: context.userId,
      performed_by_email: context.userEmail,
      status: context.status,
      old_value: context.oldValue || null,
      new_value: context.newValue || null,
      metadata: {
        ...context.metadata,
        resource_type: context.resourceType,
        resource_id: context.resourceId,
        ip_address: ipAddress,
        user_agent: userAgent,
        requires_confirmation: context.requiresConfirmation || false,
        confirmation_token: context.confirmationToken || null,
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    };
    
    const { error } = await supabase.from('audit_logs').insert(auditEntry);
    
    if (error) {
      console.error('PHASE-2: Failed to write admin audit log:', error);
      // PHASE-2: Don't throw - audit logging should not break operations
      // But log the error for monitoring
    }
  } catch (error) {
    console.error('PHASE-2: Error in writeAdminAuditLog:', error);
    // PHASE-2: Don't throw - audit logging failures should not break operations
  }
}

/**
 * PHASE-2: Get current user context for audit logging
 */
export async function getAdminAuditContext(): Promise<{
  userId: string;
  userEmail: string | null;
  error?: Response;
}> {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        userId: '',
        userEmail: null,
        error: new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    return {
      userId: user.id,
      userEmail: user.email || null,
    };
  } catch (error) {
    console.error('PHASE-2: Error in getAdminAuditContext:', error);
    return {
      userId: '',
      userEmail: null,
      error: new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
}

/**
 * PHASE-2: Log admin action with automatic context gathering
 */
export async function logAdminAction(params: {
  action: string;
  resourceType?: string;
  resourceId?: string;
  companyId?: string | null;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  status?: 'success' | 'failed';
  requiresConfirmation?: boolean;
  confirmationToken?: string;
}): Promise<void> {
  const context = await getAdminAuditContext();
  
  if (context.error) {
    console.warn('PHASE-2: Cannot log admin action - no authenticated user');
    return;
  }
  
  await writeAdminAuditLog({
    userId: context.userId,
    userEmail: context.userEmail,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    companyId: params.companyId,
    oldValue: params.oldValue,
    newValue: params.newValue,
    metadata: params.metadata,
    status: params.status || 'success',
    requiresConfirmation: params.requiresConfirmation,
    confirmationToken: params.confirmationToken,
  });
}
