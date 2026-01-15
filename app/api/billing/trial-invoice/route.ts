import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get company for this user
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, company_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      console.error('Company fetch error:', companyErr);
      return NextResponse.json(
        { error: companyErr.message || 'Failed to fetch company' },
        { status: 500 }
      );
    }

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Get trial authorization payment (₹5 order)
    const { data: trialOrder, error: orderErr } = await supabase
      .from('razorpay_orders')
      .select('*')
      .eq('user_id', user.id)
      .or('purpose.eq.trial_auth,purpose.like.trial_auth_%')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) {
      console.error('Trial order fetch error:', orderErr);
      return NextResponse.json(
        { error: orderErr.message || 'Failed to fetch trial order' },
        { status: 500 }
      );
    }

    if (!trialOrder) {
      return NextResponse.json(
        { error: 'Trial authorization payment not found' },
        { status: 404 }
      );
    }

    // Return invoice data
    return NextResponse.json({
      invoice: {
        order_id: trialOrder.order_id,
        payment_id: trialOrder.payment_id,
        amount: trialOrder.amount,
        currency: trialOrder.currency || 'INR',
        status: trialOrder.status,
        paid_at: trialOrder.paid_at,
        created_at: trialOrder.created_at,
        purpose: trialOrder.purpose,
        company: {
          name: company.company_name,
          email: company.email,
        },
      },
    });
  } catch (err: any) {
    console.error('Trial invoice fetch error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch trial invoice' },
      { status: 500 }
    );
  }
}
