import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/validate-coupon
 * Body: { code: string, amount_inr: number, item_type: 'subscription' | 'addon' }
 * Validates coupon for authenticated user's company. Coupon must be assigned to company via admin.
 * Returns discount_amount_inr, discount_amount_paise, discount_id, type, value.
 */
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(admin, user.id, 'id');
    if (!resolved) {
      return NextResponse.json({ valid: false, error: 'Company not found' }, { status: 404 });
    }
    const companyId = resolved.companyId;

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const amountInr = Number(body?.amount_inr ?? body?.amount ?? 0);
    const itemType = body?.item_type === 'addon' ? 'addon' : 'subscription';

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Coupon code is required' }, { status: 400 });
    }
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return NextResponse.json({ valid: false, error: 'Valid amount is required' }, { status: 400 });
    }

    const codeLower = code.toLowerCase();
    const { data: discount, error: discountErr } = await admin
      .from('discounts')
      .select('id, code, type, value, valid_from, valid_to, usage_limit, usage_count, is_active')
      .ilike('code', codeLower)
      .eq('is_active', true)
      .maybeSingle();

    if (discountErr || !discount) {
      return NextResponse.json({ valid: false, error: 'Invalid or inactive coupon' }, { status: 200 });
    }

    const now = new Date();
    const validFrom = new Date((discount as any).valid_from);
    if (validFrom > now) {
      return NextResponse.json({ valid: false, error: 'Coupon not yet valid' }, { status: 200 });
    }
    const validTo = (discount as any).valid_to ? new Date((discount as any).valid_to) : null;
    if (validTo && validTo < now) {
      return NextResponse.json({ valid: false, error: 'Coupon has expired' }, { status: 200 });
    }
    const usageLimit = (discount as any).usage_limit;
    const usageCount = (discount as any).usage_count ?? 0;
    if (usageLimit != null && usageCount >= usageLimit) {
      return NextResponse.json({ valid: false, error: 'Coupon usage limit reached' }, { status: 200 });
    }

    const { data: assignment } = await admin
      .from('company_discounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('discount_id', (discount as any).id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ valid: false, error: 'Coupon not assigned to your company' }, { status: 200 });
    }

    const type = (discount as any).type as 'percentage' | 'flat';
    const value = Number((discount as any).value ?? 0);
    let discountAmountInr = 0;
    if (type === 'percentage') {
      discountAmountInr = Math.min(amountInr * (value / 100), amountInr);
    } else if (type === 'flat') {
      discountAmountInr = Math.min(value, amountInr);
    }
    const discountAmountPaise = Math.round(discountAmountInr * 100);

    return NextResponse.json({
      valid: true,
      discount_id: (discount as any).id,
      code: (discount as any).code,
      type,
      value,
      discount_amount_inr: Number(discountAmountInr.toFixed(2)),
      discount_amount_paise: discountAmountPaise,
    });
  } catch (e: any) {
    console.error('validate-coupon error:', e);
    return NextResponse.json({ valid: false, error: e?.message ?? 'Validation failed' }, { status: 500 });
  }
}
