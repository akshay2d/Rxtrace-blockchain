// PHASE-1: Company ownership verification utilities
// This module provides functions to verify company ownership and access

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * PHASE-1: Verify that the current user owns the specified company
 */
export async function verifyCompanyOwnership(
  companyId: string
): Promise<{ authorized: boolean; userId: string | null; error?: NextResponse }> {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        authorized: false,
        userId: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    
    const admin = getSupabaseAdmin();
    
    // PHASE-1: Check if company exists and user owns it
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, user_id')
      .eq('id', companyId)
      .maybeSingle();
    
    if (companyError) {
      return {
        authorized: false,
        userId: user.id,
        error: NextResponse.json({ error: 'Database error' }, { status: 500 }),
      };
    }
    
    if (!company) {
      return {
        authorized: false,
        userId: user.id,
        error: NextResponse.json({ error: 'Company not found' }, { status: 404 }),
      };
    }
    
    // PHASE-1: Check ownership
    if (String(company.user_id) !== String(user.id)) {
      return {
        authorized: false,
        userId: user.id,
        error: NextResponse.json(
          { error: 'Forbidden', message: 'You do not have access to this company' },
          { status: 403 }
        ),
      };
    }
    
    return {
      authorized: true,
      userId: user.id,
    };
  } catch (error) {
    console.error('PHASE-1: Error in verifyCompanyOwnership:', error);
    return {
      authorized: false,
      userId: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}

/**
 * PHASE-1: Require company ownership - throws error response if user doesn't own company
 * Use this in API routes that require company ownership
 */
export async function requireCompanyOwnership(
  companyId: string
): Promise<{ userId: string; error?: NextResponse }> {
  const { authorized, userId, error } = await verifyCompanyOwnership(companyId);
  
  if (error) {
    return { userId: userId || '', error };
  }
  
  if (!authorized) {
    return {
      userId: userId || '',
      error: NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this company' },
        { status: 403 }
      ),
    };
  }
  
  return { userId: userId! };
}

/**
 * PHASE-1: Get company ID for current user
 */
export async function getCurrentUserCompanyId(): Promise<{ companyId: string | null; userId: string | null; error?: NextResponse }> {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        companyId: null,
        userId: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    
    const admin = getSupabaseAdmin();
    
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (companyError) {
      return {
        companyId: null,
        userId: user.id,
        error: NextResponse.json({ error: 'Database error' }, { status: 500 }),
      };
    }
    
    return {
      companyId: company?.id || null,
      userId: user.id,
    };
  } catch (error) {
    console.error('PHASE-1: Error in getCurrentUserCompanyId:', error);
    return {
      companyId: null,
      userId: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}

/**
 * PHASE-1: Check if user has access to company (either owner or seat member)
 */
export async function verifyCompanyAccess(
  companyId: string
): Promise<{ authorized: boolean; userId: string | null; error?: NextResponse }> {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        authorized: false,
        userId: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    
    const admin = getSupabaseAdmin();
    
    // PHASE-1: First check if user owns the company
    const ownershipCheck = await verifyCompanyOwnership(companyId);
    if (ownershipCheck.authorized) {
      return ownershipCheck;
    }
    
    // PHASE-1: Check if user has a seat in the company
    const { data: seat, error: seatError } = await admin
      .from('seats')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    
    if (seatError) {
      return {
        authorized: false,
        userId: user.id,
        error: NextResponse.json({ error: 'Database error' }, { status: 500 }),
      };
    }
    
    if (seat) {
      return {
        authorized: true,
        userId: user.id,
      };
    }
    
    return {
      authorized: false,
      userId: user.id,
      error: NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this company' },
        { status: 403 }
      ),
    };
  } catch (error) {
    console.error('PHASE-1: Error in verifyCompanyAccess:', error);
    return {
      authorized: false,
      userId: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}
