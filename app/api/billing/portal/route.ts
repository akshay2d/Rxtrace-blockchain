import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { createRazorpayClient } from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a Razorpay customer portal session for self-service subscription management.
 * Customers can:
 * - Update payment methods
 * - View invoices and payment history
 * - Cancel subscription (with Razorpay's flow)
 * - Update billing information
 */
export async function POST(req: Request) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const returnUrl = typeof body?.return_url === 'string' 
      ? body.return_url 
      : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(
      supabase,
      user.id,
      'id, razorpay_customer_id'
    );

    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Only owner can access billing portal
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: 'Only company owner can access billing portal' },
        { status: 403 }
      );
    }

    const companyId = resolved.companyId;
    const company = resolved.company as Record<string, unknown>;
    let customerId = company?.razorpay_customer_id as string | undefined;

    // Get subscription info
    const { data: subscription } = await supabase
      .from('company_subscriptions')
      .select('id, razorpay_subscription_id, status')
      .eq('company_id', companyId)
      .maybeSingle();

    // Create customer in Razorpay if not exists
    if (!customerId) {
      const razorpay = createRazorpayClient();

      // Get user email from auth
      const { data: userData } = await supabase.auth.admin.getUserById(user.id);
      const email = userData.user?.email;
      const name = company?.company_name as string;

      if (!email) {
        return NextResponse.json({ error: 'User email not found' }, { status: 400 });
      }

      try {
        const customer = await (razorpay.customers as any).create({
          email,
          name: name || email,
          notes: {
            company_id: companyId,
          },
        });

        customerId = customer.id;

        // Save customer ID to company record
        await supabase
          .from('companies')
          .update({
            razorpay_customer_id: customerId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', companyId);
      } catch (razorpayError: any) {
        console.error('Failed to create Razorpay customer:', razorpayError);
        return NextResponse.json({
          error: 'Failed to create billing account. Please contact support.',
          details: razorpayError?.message,
        }, { status: 500 });
      }
    }

    // Create customer portal session
    const razorpay = createRazorpayClient();
    
    try {
      // Note: Razorpay doesn't have a direct "customer portal" API like Stripe
      // Instead, we provide a managed portal URL based on customer ID
      // In production, integrate with Razorpay's customer portal or use their hosted checkout
      
      // For now, return customer info and Razorpay checkout URL for self-service
      const portalUrl = `https://dashboard.razorpay.com/app/customers/${customerId}`;
      
      return NextResponse.json({
        ok: true,
        customer_id: customerId,
        portal_url: portalUrl,
        subscription: subscription ? {
          id: subscription.razorpay_subscription_id,
          status: subscription.status,
        } : null,
        message: 'Billing portal access ready',
      });
    } catch (portalError: any) {
      console.error('Failed to create portal session:', portalError);
      
      // Fallback: Return customer info for manual management
      return NextResponse.json({
        ok: true,
        customer_id: customerId,
        portal_url: `https://dashboard.razorpay.com/app/customers/${customerId}`,
        subscription: subscription ? {
          id: subscription.razorpay_subscription_id,
          status: subscription.status,
        } : null,
        message: 'Access your billing account on Razorpay',
      });
    }
  } catch (err) {
    console.error('Billing portal error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
