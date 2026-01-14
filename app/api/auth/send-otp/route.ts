import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database using service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete any existing OTPs for this email
    await supabase
      .from('otp_verifications')
      .delete()
      .eq('email', email.toLowerCase());

    // Insert new OTP
    const { error: dbError } = await supabase
      .from('otp_verifications')
      .insert({
        email: email.toLowerCase(),
        otp,
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

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
    } catch (emailError) {
      console.error('Email error:', emailError);
      return NextResponse.json(
        { error: 'Failed to send OTP email. Please check your email address.' },
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

async function sendOTPEmail(email: string, otp: string) {
  // Check if Resend API key is available
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM || 'RxTrace India <onboarding@resend.dev>';

  if (resendApiKey) {
    // Use Resend for email delivery
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        subject: 'Your RxTrace Email Verification Code',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #0052CC, #FF6B35); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .otp-box { background: white; border: 2px dashed #0052CC; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
              .otp-code { font-size: 32px; font-weight: bold; color: #0052CC; letter-spacing: 8px; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>RxTrace India</h1>
                <p>Email Verification</p>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>Thank you for setting up your company profile with RxTrace India. To verify your email address, please use the following One-Time Password (OTP):</p>
                
                <div class="otp-box">
                  <div class="otp-code">${otp}</div>
                </div>
                
                <p><strong>This OTP will expire in 10 minutes.</strong></p>
                <p>If you didn't request this verification, please ignore this email.</p>
                
                <div class="footer">
                  <p>© ${new Date().getFullYear()} RxTrace India. All rights reserved.</p>
                  <p>Pharmaceutical Traceability & Authentication Platform</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${error.message || 'Unknown error'}`);
    }

    return;
  }

  // Fallback: Use SMTP (Nodemailer) if Resend is not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error(
      'Email not configured. Set RESEND_API_KEY (recommended) or SMTP_USER/SMTP_PASSWORD (SMTP fallback).'
    );
  }

  const nodemailerModule: any = await import('nodemailer');
  const nodemailer: any = nodemailerModule?.default ?? nodemailerModule;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"RxTrace India" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your RxTrace Email Verification Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0052CC, #FF6B35); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .otp-box { background: white; border: 2px dashed #0052CC; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #0052CC; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>RxTrace India</h1>
            <p>Email Verification</p>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Thank you for setting up your company profile with RxTrace India. To verify your email address, please use the following One-Time Password (OTP):</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request this verification, please ignore this email.</p>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} RxTrace India. All rights reserved.</p>
              <p>Pharmaceutical Traceability & Authentication Platform</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}
