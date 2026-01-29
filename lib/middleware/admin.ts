// PHASE-1: Admin middleware for protecting admin routes
// This middleware checks if the current user is an admin before allowing access

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserIsAdmin } from '@/lib/auth/admin';

/**
 * PHASE-1: Middleware to protect admin routes
 * Use this in API routes that require admin access
 */
export async function adminMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const { isAdmin, error } = await getCurrentUserIsAdmin();
  
  if (error) {
    return error;
  }
  
  if (!isAdmin) {
    return NextResponse.json(
      { 
        error: 'Forbidden', 
        message: 'Admin access required' 
      },
      { status: 403 }
    );
  }
  
  // PHASE-1: User is admin, allow request to proceed
  return null;
}

/**
 * PHASE-1: Helper to use admin middleware in API routes
 * Usage: const adminCheck = await requireAdminMiddleware(request);
 *        if (adminCheck) return adminCheck;
 */
export async function requireAdminMiddleware(request: NextRequest): Promise<NextResponse | null> {
  return adminMiddleware(request);
}
