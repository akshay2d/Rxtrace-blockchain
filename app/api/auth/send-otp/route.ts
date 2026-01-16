import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, generateOTP, getExpiryDate, clearExistingOTPs, insertOTP, sendOTPEmail } from '@/lib/auth/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Supabase admin client and helpers are centralized in lib/auth/otp

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Generate OTP and expiry
    const otp = generateOTP();
    const expiresAt = getExpiryDate(10);

    // Store OTP in database using service role client
    const supabase = getAdminClient();

    // Delete any existing OTPs for this email
    await clearExistingOTPs(email, supabase);

    // Insert new OTP
    const { error: dbError } = await insertOTP(email, otp, expiresAt, supabase);

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to generate OTP. Please try again.' },
        { status: 500 }
      );
    }

    // Send email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError: any) {
      console.error('Email error details:', {
        message: emailError?.message,
        stack: emailError?.stack,
        code: emailError?.code,
        response: emailError?.response?.data
      });
      return NextResponse.json(
        { error: `Failed to send OTP email: ${emailError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: 600, // seconds
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// sendOTPEmail is imported from '@/lib/auth/otp'
