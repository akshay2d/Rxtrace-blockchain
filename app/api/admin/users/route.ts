import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/admin';
import { logAdminAction } from '@/lib/audit/admin';
import { requiresConfirmation, generateConfirmationToken, verifyConfirmationToken } from '@/lib/auth/confirmation';
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: List all users (admin only). PHASE-10: Added observability.
export async function GET() {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin users list request', {
      correlationId,
      route: '/api/admin/users',
      method: 'GET',
    });

    // PHASE-1: Require admin access
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/users',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/users', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    // PHASE-10: Measure performance of user listing
    const { result: usersData, duration } = await measurePerformance(
      'admin.users.list',
      async () => {
        const supabase = await supabaseServer();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          throw new Error('Unauthorized');
        }

        // Use admin client to access auth.users
        const adminClient = getSupabaseAdmin();
        
        // List all users from auth.users
        const { data: { users }, error } = await adminClient.auth.admin.listUsers();
        
        if (error) {
          throw error;
        }

        // Get companies to link user emails to companies
        const { data: companies } = await adminClient
          .from('companies')
          .select('id, company_name, user_id');

        // Map users with company info
        const usersWithCompany = (users || []).map((authUser) => {
          const company = companies?.find(c => c.user_id === authUser.id);
          return {
            id: authUser.id,
            email: authUser.email || '',
            company_id: company?.id || null,
            company_name: company?.company_name || null,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            email_confirmed_at: authUser.email_confirmed_at,
          };
        });

        return { users: usersWithCompany };
      },
      { correlationId, route: '/api/admin/users', method: 'GET', userId }
    );
    
    logWithContext('info', 'Admin users list completed', {
      correlationId,
      route: '/api/admin/users',
      method: 'GET',
      userId,
      userCount: usersData.users.length,
      duration,
    });

    recordRouteMetric('/api/admin/users', 'GET', true, duration);

    return NextResponse.json({ 
      success: true, 
      users: usersData.users 
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin users list failed', {
      correlationId,
      route: '/api/admin/users',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/users', 'GET', false, duration);
    
    return NextResponse.json({ 
      error: err.message || 'Failed to fetch users' 
    }, { status: 500 });
  }
}

// DELETE: Delete a user (admin only). PHASE-6: Requires confirmation and audit. PHASE-10: Added observability.
export async function DELETE(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  let bodyUserId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/users',
        method: 'DELETE',
      });
      recordRouteMetric('/api/admin/users', 'DELETE', false, Date.now() - startTime);
      return adminError;
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, confirmation_token } = body;
    bodyUserId = user_id;
    
    logWithContext('info', 'Admin user delete request', {
      correlationId,
      route: '/api/admin/users',
      method: 'DELETE',
      userId,
      targetUserId: user_id,
    });

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const action = 'USER_DELETE';
    const needsConfirmation = requiresConfirmation(action);

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action,
        resourceId: user_id,
        metadata: { user_id },
      });
      
      logWithContext('info', 'User delete requires confirmation', {
        correlationId,
        route: '/api/admin/users',
        method: 'DELETE',
        userId,
        targetUserId: user_id,
        action,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: 'This action requires confirmation. Re-send with confirmation_token in the request body.',
      }, { status: 200 });
    }

    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId!, action);
      if (!verification.valid) {
        return NextResponse.json(
          { error: verification.error || 'Invalid confirmation token' },
          { status: 400 }
        );
      }
    }

    // PHASE-10: Measure performance of user deletion
    const { result, duration } = await measurePerformance(
      'admin.users.delete',
      async () => {
        const adminClient = getSupabaseAdmin();
        const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
        const oldValue = targetUser?.user
          ? { id: targetUser.user.id, email: targetUser.user.email }
          : { id: user_id };

        const { error } = await adminClient.auth.admin.deleteUser(user_id);

        if (error) {
          throw error;
        }

        return { oldValue };
      },
      { correlationId, route: '/api/admin/users', method: 'DELETE', userId, targetUserId: user_id }
    );

    // PHASE-6: Audit logging
    await logAdminAction({
      action: 'USER_DELETE',
      resourceType: 'user',
      resourceId: user_id,
      companyId: null,
      oldValue: result.oldValue,
      newValue: null,
      status: 'success',
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token,
    });

    logWithContext('info', 'Admin user delete completed', {
      correlationId,
      route: '/api/admin/users',
      method: 'DELETE',
      userId,
      targetUserId: user_id,
      duration,
    });

    recordRouteMetric('/api/admin/users', 'DELETE', true, duration);

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin user delete failed', {
      correlationId,
      route: '/api/admin/users',
      method: 'DELETE',
      userId,
      targetUserId: bodyUserId,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/users', 'DELETE', false, duration);
    
    // PHASE-6: Log failed action
    if (bodyUserId) {
      try {
        await logAdminAction({
          action: 'USER_DELETE',
          resourceType: 'user',
          resourceId: bodyUserId,
          companyId: null,
          oldValue: null,
          newValue: null,
          status: 'failed',
          metadata: { error: err.message || String(err) },
        });
      } catch (auditErr) {
        // Don't fail if audit logging fails
      }
    }
    
    return NextResponse.json(
      { error: err?.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}
