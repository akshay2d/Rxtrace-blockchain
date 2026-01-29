// PHASE-1: Admin role verification utilities
// This module provides functions to check and enforce admin role requirements

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * PHASE-1: Check if a user is an admin
 * Admin status is stored in auth.users.user_metadata.is_admin or a separate admin_users table
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    
    // PHASE-1: First check auth.users metadata
    const { data: user, error: userError } = await admin.auth.admin.getUserById(userId);
    
    if (userError) {
      console.error('PHASE-1: Error fetching user for admin check:', userError);
      return false;
    }
    
    // PHASE-1: Check user_metadata.is_admin (and raw_user_meta_data in case API exposes it)
    const meta = user?.user_metadata ?? (user as { raw_user_meta_data?: { is_admin?: boolean } })?.raw_user_meta_data;
    if (meta?.is_admin === true) {
      return true;
    }
    
    // PHASE-1: Also check admin_users table if it exists (fallback)
    const { data: adminUser, error: adminError } = await admin
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (adminError) {
      // PHASE-1: Table might not exist yet, that's okay - use metadata only
      if (adminError.code !== '42P01') { // 42P01 = table does not exist
        console.error('PHASE-1: Error checking admin_users table:', adminError);
      }
      return false;
    }
    
    return !!adminUser;
  } catch (error) {
    console.error('PHASE-1: Error in isAdmin check:', error);
    return false;
  }
}

/**
 * PHASE-1: Get current user from session and check if admin
 */
export async function getCurrentUserIsAdmin(): Promise<{ isAdmin: boolean; userId: string | null; error?: NextResponse }> {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        isAdmin: false,
        userId: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    
    const adminStatus = await isAdmin(user.id);
    
    return {
      isAdmin: adminStatus,
      userId: user.id,
    };
  } catch (error) {
    console.error('PHASE-1: Error in getCurrentUserIsAdmin:', error);
    return {
      isAdmin: false,
      userId: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}

/**
 * PHASE-1: Require admin role - throws error response if not admin
 * Use this in admin API routes to enforce admin access
 */
export async function requireAdmin(): Promise<{ userId: string; error?: NextResponse }> {
  const { isAdmin, userId, error } = await getCurrentUserIsAdmin();
  
  if (error) {
    return { userId: userId || '', error };
  }
  
  if (!isAdmin) {
    return {
      userId: userId || '',
      error: NextResponse.json(
        { 
          error: 'Forbidden', 
          message: 'Admin access required' 
        },
        { status: 403 }
      ),
    };
  }
  
  return { userId: userId! };
}

/**
 * PHASE-1: Set admin status for a user
 * This should only be called by super admins or during initial setup
 */
export async function setAdminStatus(userId: string, isAdmin: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getSupabaseAdmin();
    
    // PHASE-1: Update user metadata
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { is_admin: isAdmin },
    });
    
    if (updateError) {
      return { success: false, error: updateError.message };
    }
    
    // PHASE-1: Also update admin_users table if it exists
    try {
      const { error: tableError } = await admin
        .from('admin_users')
        .upsert({
          user_id: userId,
          is_active: isAdmin,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
      
      if (tableError && tableError.code !== '42P01') { // Ignore if table doesn't exist
        console.warn('PHASE-1: Could not update admin_users table:', tableError);
      }
    } catch (tableErr) {
      // PHASE-1: Table might not exist, that's okay
      console.warn('PHASE-1: admin_users table might not exist:', tableErr);
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * PHASE-1: Get all admin users
 */
export async function getAllAdmins(): Promise<Array<{ userId: string; email?: string }>> {
  try {
    const admin = getSupabaseAdmin();
    
    // PHASE-1: Get users with is_admin in metadata
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers();
    
    if (listError) {
      console.error('PHASE-1: Error listing users:', listError);
      return [];
    }
    
    const admins = users
      .filter(user => user.user_metadata?.is_admin === true)
      .map(user => ({
        userId: user.id,
        email: user.email,
      }));
    
    return admins;
  } catch (error) {
    console.error('PHASE-1: Error in getAllAdmins:', error);
    return [];
  }
}
