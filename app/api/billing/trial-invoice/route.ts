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
    // First get company's trial payment from billing_transactions
    const { data: trialTransaction, error: transactionErr } = await supabase
      .from('billing_transactions')
      .select('*')
      .eq('company_id', company.id)
      .eq('transaction_type', 'trial_activation')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transactionErr) {
      console.error('Trial transaction fetch error:', transactionErr);
    }

    // Also try to get from razorpay_orders if it exists (using company_id instead of user_id)
    let trialOrder = null;
    if (!trialTransaction) {
      const { data: orderData, error: orderErr } = await supabase
        .from('razorpay_orders')
        .select('*')
        .eq('company_id', company.id)
        .or('purpose.eq.trial_auth,purpose.like.trial_auth_%')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderErr) {
        console.error('Trial order fetch error:', orderErr);
      } else {
        trialOrder = orderData;
      }
    }

    // Use trialTransaction if available, otherwise use trialOrder
    const invoiceData = trialTransaction || trialOrder;

    if (!invoiceData) {
      return NextResponse.json(
        { error: 'Trial authorization payment not found' },
        { status: 404 }
      );
    }

    // Return invoice data (handle both billing_transactions and razorpay_orders formats)
    return NextResponse.json({
      invoice: {
        order_id: invoiceData.order_id || invoiceData.payment_id || null,
        payment_id: invoiceData.payment_id || invoiceData.id || null,
        amount: invoiceData.amount || (invoiceData.amount ? invoiceData.amount * 100 : 500), // Convert to paise if needed
        currency: invoiceData.currency || 'INR',
        status: invoiceData.status || 'success',
        paid_at: invoiceData.paid_at || invoiceData.created_at,
        created_at: invoiceData.created_at,
        purpose: invoiceData.purpose || invoiceData.transaction_type || 'trial_activation',
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
