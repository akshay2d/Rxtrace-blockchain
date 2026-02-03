import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { razorpaySubscriptionPlanAvailability } from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(supabase, user.id, '*');

    if (!resolved || !(resolved.company as any)?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = resolved.company as Record<string, unknown>;

    const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    const planAvailability = razorpaySubscriptionPlanAvailability();

    return NextResponse.json({
      company,
      razorpay: {
        configured: Boolean(keyId && keySecret),
        planAvailability,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
