import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { email, fullName, user_id } = await req.json();

    if (!email || !user_id) {
      return NextResponse.json(
        { error: 'Email and user_id required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to user_profiles table
    const { error } = await supabase
      .from('user_profiles')
      .insert({
        id: user_id,
        email: email.toLowerCase(),
        full_name: fullName || '',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Profile creation error:', error);
      // Don't return error - signup should continue even if profile save fails
    }

    return NextResponse.json({
      success: true,
      message: 'Profile created',
    });
  } catch (error) {
    console.error('Create profile error:', error);
    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    );
  }
}
