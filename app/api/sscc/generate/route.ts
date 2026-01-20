import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { assertCompanyCanOperate, ensureActiveBillingUsage } from '@/lib/billing/usage';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function resolveSkuId(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  companyId: string;
  skuIdOrCode: string;
}): Promise<string> {
  const { supabase, companyId, skuIdOrCode } = opts;
  const raw = String(skuIdOrCode || '').trim();
  if (!raw) throw new Error('sku_id is required');

  if (isUuid(raw)) return raw;

  const skuCode = raw.toUpperCase();
  const { data: skuRow, error: skuErr } = await supabase
    .from('skus')
    .select('id')
    .eq('company_id', companyId)
    .eq('sku_code', skuCode)
    .maybeSingle();

  if (skuErr) throw new Error(skuErr.message ?? 'Failed to resolve SKU');

  if (!skuRow?.id) {
    const { data: created, error: createErr } = await supabase
      .from('skus')
      .upsert(
        { company_id: companyId, sku_code: skuCode, sku_name: null, deleted_at: null },
        { onConflict: 'company_id,sku_code' }
      )
      .select('id')
      .single();

    if (createErr || !created?.id) {
      throw new Error(createErr?.message ?? `Failed to create SKU in master: ${skuCode}`);
    }

    return created.id;
  }

  return skuRow.id;
}

/**
 * Unified SSCC Generation Endpoint
 * 
 * Enforces hierarchy: Box → Carton → Pallet
 * All levels consume same SSCC quota
 * 
 * Request body:
 * - sku_id: string (required)
 * - company_id: string (required)
 * - batch: string (required)
 * - expiry_date: string (required)
 * - units_per_box: number (required)
 * - boxes_per_carton: number (required if generate_carton or generate_pallet)
 * - cartons_per_pallet: number (required if generate_pallet)
 * - number_of_pallets: number (required)
 * - generate_box: boolean
 * - generate_carton: boolean
 * - generate_pallet: boolean
 */
export async function POST(req: Request) {
  try {
    // Resolve authenticated user and company
    const supabaseAuth = await supabaseServer();
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const {
      company_id,
      sku_id,
      batch,
      expiry_date,
      units_per_box,
      boxes_per_carton,
      cartons_per_pallet,
      number_of_pallets,
      generate_box = false,
      generate_carton = false,
      generate_pallet = false,
    } = body ?? {};

    if (!company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, user_id')
      .eq('id', company_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr || !company) {
      return NextResponse.json({ error: 'Company not found or access denied' }, { status: 403 });
    }

    // Validate required fields
    if (!sku_id || !batch || !expiry_date || !number_of_pallets) {
      return NextResponse.json(
        { error: 'sku_id, batch, expiry_date, and number_of_pallets are required' },
        { status: 400 }
      );
    }

    // Validate hierarchy rules
    if (generate_carton && !generate_box) {
      return NextResponse.json(
        { error: 'SSCC generation must follow hierarchy: Box → Carton → Pallet. Carton requires Box.' },
        { status: 400 }
      );
    }

    if (generate_pallet && (!generate_box || !generate_carton)) {
      return NextResponse.json(
        { error: 'SSCC generation must follow hierarchy: Box → Carton → Pallet. Pallet requires Box and Carton.' },
        { status: 400 }
      );
    }

    if (!generate_box && !generate_carton && !generate_pallet) {
      return NextResponse.json(
        { error: 'At least one SSCC level must be selected (Box, Carton, or Pallet)' },
        { status: 400 }
      );
    }

    // Validate hierarchy quantities
    if ((generate_carton || generate_pallet) && (!boxes_per_carton || boxes_per_carton < 1)) {
      return NextResponse.json(
        { error: 'boxes_per_carton is required when generating Carton or Pallet' },
        { status: 400 }
      );
    }

    if (generate_pallet && (!cartons_per_pallet || cartons_per_pallet < 1)) {
      return NextResponse.json(
        { error: 'cartons_per_pallet is required when generating Pallet' },
        { status: 400 }
      );
    }

    if (!units_per_box || units_per_box < 1) {
      return NextResponse.json(
        { error: 'units_per_box must be a positive integer' },
        { status: 400 }
      );
    }

    await assertCompanyCanOperate({ supabase, companyId: company_id });
    await ensureActiveBillingUsage({ supabase, companyId: company_id });

    const skuUuid = await resolveSkuId({
      supabase,
      companyId: company_id,
      skuIdOrCode: sku_id,
    });

    // Get packing rule
    const { data: rule, error: ruleErr } = await supabase
      .from('packing_rules')
      .select('*')
      .eq('company_id', company_id)
      .eq('sku_id', skuUuid)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ruleErr || !rule) {
      return NextResponse.json(
        { error: 'Packing rule not found for selected SKU' },
        { status: 400 }
      );
    }

    const prefix = rule.sscc_company_prefix;
    const ext = rule.sscc_extension_digit;

    // Calculate total SSCC count needed (all levels combined)
    let totalSSCCCount = 0;
    if (generate_box) {
      // Boxes: number_of_pallets * boxes_per_carton * cartons_per_pallet
      const boxesPerPallet = (boxes_per_carton || 1) * (cartons_per_pallet || 1);
      totalSSCCCount += number_of_pallets * boxesPerPallet;
    }
    if (generate_carton) {
      // Cartons: number_of_pallets * cartons_per_pallet
      totalSSCCCount += number_of_pallets * (cartons_per_pallet || 1);
    }
    if (generate_pallet) {
      // Pallets: number_of_pallets
      totalSSCCCount += number_of_pallets;
    }

    // Apply quota rollover (for yearly plans) and consume quota
    const quotaModule = await import('@/lib/billing/quota');
    const { consumeQuotaBalance, refundQuotaBalance } = quotaModule;
    
    const quotaResult = await consumeQuotaBalance(company_id, 'sscc', totalSSCCCount);
    
    if (!quotaResult.ok) {
      return NextResponse.json(
        {
          error: quotaResult.error || `You've reached your available SSCC quota. Please upgrade your plan or purchase add-on SSCC codes.`,
          code: 'quota_exceeded',
          requires_addon: true,
          addon: 'sscc',
        },
        { status: 403 }
      );
    }

    // Allocate SSCC serials
    const { data: alloc, error: allocErr } = await supabase.rpc('allocate_sscc_serials', {
      p_sequence_key: prefix,
      p_count: totalSSCCCount,
    });

    if (allocErr) {
      // Refund quota
      await refundQuotaBalance(company_id, 'sscc', totalSSCCCount);
      return NextResponse.json(
        { error: allocErr.message ?? 'Failed to allocate SSCC serials' },
        { status: 400 }
      );
    }

    const firstSerial = alloc as any;
    const nowIso = new Date().toISOString();

    // Generate SSCCs for each level
    const boxes: any[] = [];
    const cartons: any[] = [];
    const pallets: any[] = [];
    let serialOffset = 0;

    // Generate Boxes (if selected)
    if (generate_box) {
      const boxesPerPallet = (boxes_per_carton || 1) * (cartons_per_pallet || 1);
      const totalBoxes = number_of_pallets * boxesPerPallet;

      for (let i = 0; i < totalBoxes; i++) {
        const serial = Number(firstSerial) + serialOffset;
        const { data: ssccGen, error: ssccErr } = await supabase.rpc('make_sscc', {
          p_extension_digit: ext,
          p_company_prefix: prefix,
          p_serial: serial,
        });

        if (ssccErr || !ssccGen) {
          // Refund quota and return error
          await refundQuotaBalance(company_id, 'sscc', totalSSCCCount);
          return NextResponse.json(
            { error: ssccErr?.message ?? 'Failed to generate SSCC for box' },
            { status: 400 }
          );
        }

        boxes.push({
          company_id,
          sku_id: skuUuid,
          sscc: ssccGen as any,
          sscc_with_ai: `(00)${ssccGen}`,
          sscc_level: 'box', // Added by migration
          parent_sscc: null, // Added by migration - will be linked to carton later if cartons are generated
          meta: {
            created_at: nowIso,
            batch,
            expiry_date: expiry_date,
            units_per_box: units_per_box,
            box_number: i + 1,
            packing_rule_id: rule.id,
          },
        });
        serialOffset++;
      }
    }

    // Generate Cartons (if selected)
    if (generate_carton) {
      const totalCartons = number_of_pallets * (cartons_per_pallet || 1);

      for (let i = 0; i < totalCartons; i++) {
        const serial = Number(firstSerial) + serialOffset;
        const { data: ssccGen, error: ssccErr } = await supabase.rpc('make_sscc', {
          p_extension_digit: ext,
          p_company_prefix: prefix,
          p_serial: serial,
        });

        if (ssccErr || !ssccGen) {
          await refundQuotaBalance(company_id, 'sscc', totalSSCCCount);
          return NextResponse.json(
            { error: ssccErr?.message ?? 'Failed to generate SSCC for carton' },
            { status: 400 }
          );
        }

        cartons.push({
          company_id,
          sku_id: skuUuid,
          sscc: ssccGen as any,
          sscc_with_ai: `(00)${ssccGen}`,
          sscc_level: 'carton', // Added by migration
          parent_sscc: null, // Added by migration - will be linked to pallet later if pallets are generated
          meta: {
            created_at: nowIso,
            batch,
            expiry_date: expiry_date,
            boxes_per_carton: boxes_per_carton,
            carton_number: i + 1,
            packing_rule_id: rule.id,
          },
        });
        serialOffset++;
      }
    }

    // Generate Pallets (if selected)
    if (generate_pallet) {
      for (let i = 0; i < number_of_pallets; i++) {
        const serial = Number(firstSerial) + serialOffset;
        const { data: ssccGen, error: ssccErr } = await supabase.rpc('make_sscc', {
          p_extension_digit: ext,
          p_company_prefix: prefix,
          p_serial: serial,
        });

        if (ssccErr || !ssccGen) {
          await refundQuotaBalance(company_id, 'sscc', totalSSCCCount);
          return NextResponse.json(
            { error: ssccErr?.message ?? 'Failed to generate SSCC for pallet' },
            { status: 400 }
          );
        }

        pallets.push({
          company_id,
          sku_id: skuUuid,
          sscc: ssccGen as any,
          sscc_with_ai: `(00)${ssccGen}`,
          sscc_level: 'pallet', // Added by migration
          parent_sscc: null, // Added by migration
          meta: {
            created_at: nowIso,
            batch,
            expiry_date: expiry_date,
            cartons_per_pallet: cartons_per_pallet,
            pallet_number: i + 1,
            packing_rule_id: rule.id,
          },
        });
        serialOffset++;
      }
    }

    // Insert all SSCCs into appropriate tables
    const insertedBoxes = boxes.length > 0
      ? await supabase.from('boxes').insert(boxes).select('id, sscc, sscc_with_ai, sku_id')
      : { data: [], error: null };

    const insertedCartons = cartons.length > 0
      ? await supabase.from('cartons').insert(cartons).select('id, sscc, sscc_with_ai, sku_id')
      : { data: [], error: null };

    const insertedPallets = pallets.length > 0
      ? await supabase.from('pallets').insert(pallets).select('id, sscc, sscc_with_ai, sku_id')
      : { data: [], error: null };

    // Check for insertion errors
    if (insertedBoxes.error || insertedCartons.error || insertedPallets.error) {
      // Refund quota
      await refundQuotaBalance(company_id, 'sscc', totalSSCCCount);

      const errorMsg = insertedBoxes.error?.message || insertedCartons.error?.message || insertedPallets.error?.message;
      return NextResponse.json(
        { error: errorMsg ?? 'Failed to insert SSCC codes' },
        { status: 500 }
      );
    }

    // TODO: Link parent-child relationships (box → carton, carton → pallet)
    // This requires updating boxes.carton_id and cartons.pallet_id

    return NextResponse.json({
      boxes: insertedBoxes.data || [],
      cartons: insertedCartons.data || [],
      pallets: insertedPallets.data || [],
      total_sscc_generated: totalSSCCCount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
