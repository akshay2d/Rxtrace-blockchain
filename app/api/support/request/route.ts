import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function resolveCompanyIdFromAuth(): Promise<string | null> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const admin = getSupabaseAdmin();
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    return company?.id ?? null;
  } catch {
    return null;
  }
}

async function sendSupportEmail(params: {
  fullName: string;
  companyName: string;
  email: string;
  category: string;
  priority: string;
  message: string;
}) {
  const { fullName, companyName, email, category, priority, message } = params;

  const emailSubject = `Support Request - ${category.charAt(0).toUpperCase() + category.slice(1)} (Priority: ${priority})`;
  
  const emailBody = `
Support Request Submitted

Name: ${fullName}
Company: ${companyName}
Email: ${email}
Category: ${category.charAt(0).toUpperCase() + category.slice(1)}
Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}

Message:
${message}

---
This support request was submitted through the RxTrace Help & Support form.
  `.trim();

  // Try Resend API first
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resendFrom = process.env.RESEND_FROM || 'RxTrace India <noreply@rxtrace.in>';
    
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: 'customer.support@rxtrace.in',
          replyTo: email,
          subject: emailSubject,
          text: emailBody,
        }),
      });

      if (response.ok) {
        return { success: true };
      }
    } catch (error) {
      console.error('Resend API error:', error);
    }
  }

  // Fallback to SMTP
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    try {
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
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: 'customer.support@rxtrace.in',
        replyTo: email,
        subject: emailSubject,
        text: emailBody,
      });

      return { success: true };
    } catch (error: any) {
      console.error('SMTP send error:', error);
      return { success: false, error: error.message };
    }
  }

  // If no email service configured, log but don't fail
  console.warn('No email service configured. Support request would be sent to: customer.support@rxtrace.in');
  return { success: true, skipped: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const category = typeof body?.category === 'string' ? body.category.trim() : '';
    const priority = typeof body?.priority === 'string' ? body.priority.trim() : 'normal';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    // Validate required fields
    if (!fullName || !companyName || !email || !category || !message) {
      return NextResponse.json(
        { success: false, error: 'Full Name, Company Name, Email, Category, and Message are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    // Resolve company_id from auth (optional - may be null for unauthenticated requests)
    const companyId = await resolveCompanyIdFromAuth();

    // Get metadata for logging
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    const supabase = getSupabaseAdmin();

    // Save to database
    const { data: inserted, error: insertError } = await supabase
      .from('support_requests')
      .insert({
        full_name: fullName,
        company_name: companyName,
        email,
        category,
        priority,
        message,
        company_id: companyId,
        ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert support request:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message || 'Failed to submit support request' },
        { status: 500 }
      );
    }

    // Send email notification
    const emailResult = await sendSupportEmail({
      fullName,
      companyName,
      email,
      category,
      priority,
      message,
    });

    if (!emailResult.success && !emailResult.skipped) {
      console.error('Failed to send support email:', emailResult.error);
      // Don't fail the request if email fails - database record is saved
    }

    return NextResponse.json({ success: true, id: inserted?.id });
  } catch (err: any) {
    console.error('Support request error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to submit support request' },
      { status: 500 }
    );
  }
}
