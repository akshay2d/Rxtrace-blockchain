import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PRICING } from '@/lib/billingConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AddonKind = 'unit' | 'box' | 'carton' | 'pallet' | 'userid';

function unitPricePaise(kind: AddonKind): number {
  if (kind === 'unit') return Math.round(PRICING.unit_label * 100);
  if (kind === 'box') return Math.round(PRICING.box_label * 100);
  if (kind === 'carton') return Math.round(PRICING.carton_label * 100);
  if (kind === 'pallet') return Math.round(PRICING.pallet_label * 100);
  if (kind === 'userid') return Math.round(PRICING.seat_monthly * 100);
  return 0;
}

function normalizeItems(raw: unknown): Array<{ kind: AddonKind; qty: number }> {
  if (!Array.isArray(raw)) return [];
  const normalized: Array<{ kind: AddonKind; qty: number }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as any;
    const kind = String(obj.kind ?? obj.key ?? obj.type ?? '').trim().toLowerCase() as AddonKind;
    const qtyRaw = obj.qty ?? obj.quantity ?? obj.count;
    const qty = typeof qtyRaw === 'string' ? Number(qtyRaw) : Number(qtyRaw);
    const validKind = kind === 'unit' || kind === 'box' || kind === 'carton' || kind === 'pallet' || kind === 'userid';
    if (!validKind || !Number.isInteger(qty) || qty <= 0) continue;
    normalized.push({ kind, qty });
  }
  const merged = new Map<AddonKind, number>();
  for (const item of normalized) {
    merged.set(item.kind, (merged.get(item.kind) ?? 0) + item.qty);
  }
  return Array.from(merged.entries()).map(([kind, qty]) => ({ kind, qty }));
}

/**
 * POST /api/billing/calculate-cart-amount
 * Body: { items: Array<{ kind, qty }>, coupon_code?: string }
 * Returns cart amount breakdown (subtotal, coupon discount, amount to pay).
 * Addon orders do not apply company discount or GST in current backend.
 */
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const companyId = (company as any)?.id;
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const items = normalizeItems(body?.items);
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: 'items required' }, { status: 400 });
    }

    const subtotalPaise = items.reduce((sum, item) => sum + unitPricePaise(item.kind) * item.qty, 0);
    if (!Number.isInteger(subtotalPaise) || subtotalPaise <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid total' }, { status: 400 });
    }

    let discountPaise = 0;
    const couponCode = typeof body?.coupon_code === 'string' ? body.coupon_code.trim() : null;
    if (couponCode) {
      const { data: couponRow } = await admin
        .from('discounts')
        .select('id, code, type, value, valid_from, valid_to, usage_limit, usage_count, is_active')
        .ilike('code', couponCode.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      if (couponRow) {
        const now = new Date();
        const vFrom = new Date((couponRow as any).valid_from);
        const vTo = (couponRow as any).valid_to ? new Date((couponRow as any).valid_to) : null;
        const limit = (couponRow as any).usage_limit;
        const used = (couponRow as any).usage_count ?? 0;
        const { data: assign } = await admin
          .from('company_discounts')
          .select('id')
          .eq('company_id', companyId)
          .eq('discount_id', (couponRow as any).id)
          .maybeSingle();
        if (vFrom <= now && (!vTo || vTo >= now) && (limit == null || used < limit) && assign) {
          const amountInr = subtotalPaise / 100;
          const typ = (couponRow as any).type;
          const val = Number((couponRow as any).value ?? 0);
          const discountInr = typ === 'percentage' ? Math.min(amountInr * (val / 100), amountInr) : Math.min(val, amountInr);
          discountPaise = Math.round(discountInr * 100);
        }
      }
    }

    const orderAmountPaise = Math.max(100, subtotalPaise - discountPaise);

    return NextResponse.json({
      success: true,
      subtotalPaise,
      subtotalInr: Number((subtotalPaise / 100).toFixed(2)),
      couponDiscountPaise: discountPaise,
      couponDiscountInr: Number((discountPaise / 100).toFixed(2)),
      orderAmountPaise,
      orderAmountInr: Number((orderAmountPaise / 100).toFixed(2)),
      hasCoupon: discountPaise > 0,
    });
  } catch (e: any) {
    console.error('calculate-cart-amount error:', e);
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Calculation failed' },
      { status: 500 }
    );
  }
}
