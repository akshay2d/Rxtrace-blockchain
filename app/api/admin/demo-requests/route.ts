import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : 100;

    // Use admin client to query demo_requests table
    const adminClient = getSupabaseAdmin();
    
    const { data: rows, error } = await adminClient
      .from('demo_requests')
      .select('id, name, company_name, email, phone, message, source, ip, user_agent, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // If table doesn't exist, return empty array (table will be created when first demo request is submitted)
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return NextResponse.json({ success: true, rows: [] });
      }
      console.error('Error fetching demo requests:', error);
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to load demo requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, rows: rows || [] });
  } catch (err: any) {
    console.error('Demo requests fetch error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load demo requests' },
      { status: 500 }
    );
  }
}
