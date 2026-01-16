import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/auth/welcome';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, fullName } = await req.json();

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    await sendWelcomeEmail(email, fullName || 'there');

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully',
    });
  } catch (error: any) {
    console.error('Send welcome email error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
