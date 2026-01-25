import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET: List all users (admin only)
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client to access auth.users
    const adminClient = getSupabaseAdmin();
    
    // List all users from auth.users
    const { data: { users }, error } = await adminClient.auth.admin.listUsers();
    
    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json({ 
      success: true, 
      users: usersWithCompany 
    });
  } catch (err: any) {
    console.error('Users fetch error:', err);
    return NextResponse.json({ 
      error: err.message || 'Failed to fetch users' 
    }, { status: 500 });
  }
}

// DELETE: Delete a user (admin only)
export async function DELETE(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_id } = await req.json();
    
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // Use admin client to delete user from auth.users
    const adminClient = getSupabaseAdmin();
    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    
    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (err: any) {
    console.error('User delete error:', err);
    return NextResponse.json({ 
      error: err.message || 'Failed to delete user' 
    }, { status: 500 });
  }
}
