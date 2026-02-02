/**
 * GET /api/billing/addon-prices
 * Returns per-label add-on prices (unit, box, carton, pallet) in INR from add_ons table.
 * Used by dashboard Cost Usage Chart for indicative cost calculation.
 */

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchAddonPricesFromDb, type AddonKind } from '@/lib/billing/addon-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL_KINDS: AddonKind[] = ['unit', 'box', 'carton', 'pallet'];

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const priceMap = await fetchAddonPricesFromDb(admin);

    const prices: Record<string, number> = {};
    for (const kind of LABEL_KINDS) {
      prices[kind] = priceMap.get(kind) ?? 0;
    }

    return NextResponse.json({ success: true, prices });
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('addon-prices error:', err);
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load add-on prices' },
      { status: 500 }
    );
  }
}
