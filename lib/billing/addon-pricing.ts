/**
 * Add-on pricing from add_ons table (admin source of truth).
 * No PRICING constants - all rates from DB.
 * Kind mapping matches API/public/add-ons and pricing page addon keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AddonKind = 'unit' | 'box' | 'carton' | 'pallet' | 'userid';

/** Map API kind to add_ons.name patterns (order matters for first match) */
const KIND_TO_NAME_PATTERNS: Array<{ kind: AddonKind; patterns: string[] }> = [
  { kind: 'unit', patterns: ['Extra Unit label', 'Unit label'] },
  { kind: 'box', patterns: ['Extra Box label', 'Box label'] },
  { kind: 'carton', patterns: ['Extra Carton label', 'Carton label'] },
  { kind: 'pallet', patterns: ['Pallet', 'SSCC'] },
  { kind: 'userid', patterns: ['User ID', 'Seat'] },
];

export type AddonPriceMap = Map<AddonKind, number>;

/** Fetch addon prices from add_ons table. Returns Map<kind, priceInr>. */
export async function fetchAddonPricesFromDb(
  supabase: SupabaseClient
): Promise<AddonPriceMap> {
  const { data: addons, error } = await supabase
    .from('add_ons')
    .select('name, price')
    .eq('is_active', true);

  if (error || !addons?.length) {
    return new Map();
  }

  const map = new Map<AddonKind, number>();
  for (const row of addons) {
    const name = String((row as any)?.name ?? '').toLowerCase();
    const price = Number((row as any)?.price ?? 0);
    if (!name || !Number.isFinite(price) || price < 0) continue;

    for (const { kind, patterns } of KIND_TO_NAME_PATTERNS) {
      if (map.has(kind)) continue;
      const match = patterns.some((p) => name.includes(p.toLowerCase()));
      if (match) {
        map.set(kind, price);
        break;
      }
    }
  }
  return map;
}

/** Get price in paise for a kind. Returns 0 if kind not found. */
export function getPricePaise(priceMap: AddonPriceMap, kind: AddonKind): number {
  const priceInr = priceMap.get(kind) ?? 0;
  return Math.round(priceInr * 100);
}
