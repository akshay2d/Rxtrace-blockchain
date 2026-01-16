import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, fetchLatestOTP, deleteOTPById, markOTPVerified } from '@/lib/auth/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Supabase admin client and helpers are centralized in lib/auth/otp

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'Invalid OTP format. Must be 6 digits.' },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // Fetch OTP record
    const { data: otpRecord, error: fetchError } = await fetchLatestOTP(email, supabase);

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to verify OTP. Please try again.' },
        { status: 500 }
      );
    }

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'No OTP found. Please request a new one.' },
        { status: 404 }
      );
    }

    // Check if OTP has expired
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);

    if (now > expiresAt) {
      // Delete expired OTP
      await deleteOTPById(otpRecord.id, supabase);

      return NextResponse.json(
        { error: 'OTP has expired. Please request a new one.' },
        { status: 410 }
      );
    }

    // Verify OTP matches
    if (otpRecord.otp !== otp) {
      return NextResponse.json(
        { error: 'Invalid OTP. Please check and try again.' },
        { status: 401 }
      );
    }

    // Mark OTP as verified in database
    const { error: updateError } = await markOTPVerified(otpRecord.id, supabase);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to verify OTP. Please try again.' },
        { status: 500 }
      );
    }

    // Schedule deletion of OTP record after 1 hour (cleanup)
    setTimeout(async () => {
      try {
        await supabase
          .from('otp_verifications')
          .delete()
          .eq('id', otpRecord.id);
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    }, 60 * 60 * 1000); // 1 hour

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully',
      email: email.toLowerCase(),
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
