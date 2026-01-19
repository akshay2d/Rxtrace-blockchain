import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { assertCompanyCanOperate, ensureActiveBillingUsage } from '@/lib/billing/usage';
import { generateCanonicalGS1 } from '@/lib/gs1Canonical';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generate unique serial number
const generateSerial = (companyId: string) =>
  `U${companyId.slice(0, 4)}${Date.now().toString(36)}${crypto
    .randomBytes(3)
    .toString('hex')}`;

// Resolve company_id from authenticated user
async function resolveAuthCompany() {
  const supabase = await supabaseServer();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = getSupabaseAdmin();
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  if (companyError || !company?.id) {
    return { error: NextResponse.json({ error: 'Company profile not found' }, { status: 400 }) };
  }

  return { companyId: company.id, companyName: company.company_name || '', userId: user.id };
}

export async function POST(req: Request) {
  try {
    // Resolve company from auth
    const auth = await resolveAuthCompany();
    if ('error' in auth) return auth.error;

    const { companyId, companyName, userId } = auth;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    
    const gtin = typeof body.gtin === 'string' ? body.gtin.trim() : '';
    const batch = typeof body.batch === 'string' ? body.batch.trim() : '';
    const mfd = typeof body.mfd === 'string' ? body.mfd.trim() || null : null;
    const exp = typeof body.exp === 'string' ? body.exp.trim() : '';
    const quantity = typeof body.quantity === 'number' ? body.quantity : parseInt(String(body.quantity || '1'), 10);
    const mrp = body.mrp !== undefined ? String(body.mrp).trim() : '';
    const skuCode = typeof body.sku === 'string' ? body.sku.trim().toUpperCase() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : companyName;
    const printerId = typeof body.printer_id === 'string' ? body.printer_id.trim() : null;

    // Validate required fields
    if (!gtin || !batch || !exp || !quantity || quantity <= 0) {
      return NextResponse.json(
        { error: 'GTIN, batch, expiry date, and quantity are required' },
        { status: 400 }
      );
    }

    // If SKU provided, ensure it exists
    let skuId: string | null = null;
    let finalSkuCode = skuCode;
    if (skuCode) {
      const admin = getSupabaseAdmin();
      const { data: sku } = await admin
        .from('skus')
        .select('id, sku_code')
        .eq('company_id', companyId)
        .eq('sku_code', skuCode)
        .maybeSingle();

      if (sku?.id) {
        skuId = sku.id;
        finalSkuCode = sku.sku_code;
      } else {
        // Auto-create SKU if not exists (non-blocking)
        try {
          const { data: newSku } = await admin
            .from('skus')
            .upsert(
              {
                company_id: companyId,
                sku_code: skuCode,
                sku_name: skuCode,
                deleted_at: null,
              },
              { onConflict: 'company_id,sku_code' }
            )
            .select('id, sku_code')
            .single();

          if (newSku?.id) {
            skuId = newSku.id;
            finalSkuCode = newSku.sku_code;
          }
        } catch {
          // Non-blocking: continue without SKU
        }
      }
    }

    // Validate company can operate and has billing
    const admin = getSupabaseAdmin();
    await assertCompanyCanOperate({ supabase: admin, companyId });
    await ensureActiveBillingUsage({ supabase: admin, companyId });

    // Reserve billing quota
    const { data: reserveRow, error: reserveErr } = await admin.rpc('billing_usage_consume', {
      p_company_id: companyId,
      p_kind: 'unit',
      p_qty: quantity,
    });

    const reserve = Array.isArray(reserveRow) ? reserveRow[0] : reserveRow;
    if (reserveErr || !reserve?.ok) {
      return NextResponse.json(
        {
          error: 'Unit label quota exceeded. Please purchase extra Unit labels add-on.',
          code: reserve?.error ?? reserveErr?.message ?? 'quota_exceeded',
          requires_addon: true,
          addon: 'unit',
        },
        { status: 403 }
      );
    }

    // Generate units
    const items: Array<{ serial: string; gs1: string }> = [];
    const rows: Array<{
      company_id: string;
      sku_id: string | null;
      gtin: string;
      batch: string;
      mfd: string | null;
      expiry: string;
      mrp: string | null;
      serial: string;
      gs1_payload: string;
    }> = [];

    const maxAttempts = 10;

    for (let i = 0; i < quantity; i++) {
      let serial: string = '';
      let attempts = 0;
      let isUnique = false;

      // Generate unique serial
      while (!isUnique && attempts < maxAttempts) {
        serial = generateSerial(companyId);
        const { data: existing } = await admin
          .from('labels_units')
          .select('id')
          .eq('company_id', companyId)
          .eq('gtin', gtin)
          .eq('batch', batch)
          .eq('serial', serial)
          .maybeSingle();

        if (!existing) {
          isUnique = true;
        } else {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      if (!isUnique) {
        // Refund billing quota
        await admin.rpc('billing_usage_refund', { p_company_id: companyId, p_kind: 'unit', p_qty: quantity });
        return NextResponse.json(
          { error: `Failed to generate unique serial after ${maxAttempts} attempts` },
          { status: 500 }
        );
      }

      // Generate GS1 payload
      const mfdDate = mfd || new Date().toISOString().split('T')[0]; // Use today if not provided
      const gs1Payload = generateCanonicalGS1({
        gtin,
        expiry: exp,
        mfgDate: mfdDate,
        batch,
        serial,
        mrp: mrp ? Number(mrp) : undefined,
        sku: finalSkuCode || undefined,
        company: company || undefined,
      });

      items.push({ serial, gs1: gs1Payload });

      rows.push({
        company_id: companyId,
        sku_id: skuId,
        gtin,
        batch,
        mfd: mfdDate,
        expiry: exp,
        mrp: mrp || null,
        serial,
        gs1_payload: gs1Payload,
      });
    }

    // Insert all units
    const { error: insertError } = await admin.from('labels_units').insert(rows);

    if (insertError) {
      // Refund billing quota on failure
      await admin.rpc('billing_usage_refund', { p_company_id: companyId, p_kind: 'unit', p_qty: quantity });
      
      if (insertError.code === '23505' || insertError.message?.includes('unique')) {
        return NextResponse.json(
          { error: 'Duplicate serial detected. Please try again.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: insertError.message || 'Failed to generate units' },
        { status: 500 }
      );
    }

    // Return format expected by frontend
    return NextResponse.json({
      items,
    });
  } catch (err: any) {
    console.error('Issues API error:', err);
    
    if (err?.code === 'PAST_DUE' || err?.code === 'SUBSCRIPTION_INACTIVE') {
      return NextResponse.json(
        { error: err.message || 'Subscription inactive', code: err.code },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: err?.message || 'Unit code generation failed. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
