import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function isValidEmail(value: string) {
  // Intentionally simple; avoids over-rejecting valid emails.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : null;
    const source = typeof body?.source === 'string' ? body.source.trim() : 'landing';

    if (!name || !companyName || !email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Name, Company Name, Email, and Phone are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    const supabase = getSupabaseAdmin();
    const { data: inserted, error: insertError } = await supabase
      .from('demo_requests')
      .insert({
        name,
        company_name: companyName,
        email,
        phone,
        message,
        source,
        ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message || 'Failed to submit demo request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: inserted?.id });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to submit demo request' },
      { status: 500 }
    );
  }
}
