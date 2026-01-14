import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getDefaultZohoOrganizationId, zohoBooksFetch, type ZohoOrgId } from '@/lib/billing/zohoBooks';

type AddonKind = 'unit' | 'box' | 'carton' | 'pallet' | 'userid' | 'erp';

type InvoiceRow = {
  id: string;
  company_id: string;
  plan: string;
  amount: number;
  currency?: string | null;
  status: string;
  created_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  reference?: string | null;
  metadata?: any;
};

type CompanyRow = {
  id: string;
  company_name?: string | null;
  gst_number?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
};

function addonKindToItemType(kind: AddonKind): string {
  switch (kind) {
    case 'userid':
      return 'addon_seat';
    case 'erp':
      return 'addon_erp';
    case 'unit':
      return 'label_unit';
    case 'box':
      return 'label_box';
    case 'carton':
      return 'label_carton';
    case 'pallet':
      return 'label_pallet';
    default:
      return 'subscription';
  }
}

function isoDateOnly(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureZohoContactId(opts: { organizationId: ZohoOrgId; company: CompanyRow }): Promise<string> {
  const admin = getSupabaseAdmin();

  const { data: existing, error: existingErr } = await admin
    .from('zoho_contact_mapping')
    .select('zoho_contact_id')
    .eq('company_id', opts.company.id)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.zoho_contact_id) return String((existing as any).zoho_contact_id);

  const contactName = (opts.company.company_name ?? '').trim() || `Company ${opts.company.id}`;

  const payload: any = {
    contact_name: contactName,
  };

  if (opts.company.gst_number) payload.gst_no = String(opts.company.gst_number);
  if (opts.company.contact_email) payload.email = String(opts.company.contact_email);
  if (opts.company.contact_phone) payload.phone = String(opts.company.contact_phone);

  const resp = await zohoBooksFetch({
    organizationId: opts.organizationId,
    path: '/contacts',
    method: 'POST',
    body: payload,
  });

  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    throw new Error(`Zoho contact create failed: ${json?.message ?? resp.statusText}`);
  }

  const contactId = String(json?.contact?.contact_id ?? '');
  const contactNameFromZoho = String(json?.contact?.contact_name ?? contactName);
  if (!contactId) throw new Error('Zoho contact create returned no contact_id');

  const { error: insertErr } = await admin.from('zoho_contact_mapping').insert({
    company_id: opts.company.id,
    zoho_contact_id: contactId,
    zoho_contact_name: contactNameFromZoho,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
  });

  if (insertErr) throw new Error(insertErr.message);
  return contactId;
}

async function getZohoItemMapping(opts: { organizationId: ZohoOrgId; itemType: string }) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('zoho_item_mapping')
    .select('zoho_item_id, unit_price, item_name, zoho_item_name, is_active')
    .eq('organization_id', opts.organizationId)
    .eq('item_type', opts.itemType)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.zoho_item_id) return null;

  return {
    itemId: String((data as any).zoho_item_id),
    unitPrice: Number((data as any).unit_price ?? 0),
    name: String((data as any).zoho_item_name ?? (data as any).item_name ?? opts.itemType),
  };
}

function extractAddonItems(metadata: any): Array<{ kind: AddonKind; qty: number }> {
  const type = String(metadata?.type ?? '');
  if (type === 'addon') {
    const kind = String(metadata?.kind ?? '').toLowerCase() as AddonKind;
    const qty = Number(metadata?.qty ?? 0);
    if ((['unit', 'box', 'carton', 'pallet', 'userid', 'erp'] as string[]).includes(kind) && Number.isInteger(qty) && qty > 0) {
      return [{ kind, qty }];
    }
  }
  if (type === 'addon_cart' && Array.isArray(metadata?.items)) {
    const out: Array<{ kind: AddonKind; qty: number }> = [];
    for (const it of metadata.items) {
      const kind = String(it?.kind ?? '').toLowerCase() as AddonKind;
      const qty = Number(it?.qty ?? 0);
      if ((['unit', 'box', 'carton', 'pallet', 'userid', 'erp'] as string[]).includes(kind) && Number.isInteger(qty) && qty > 0) {
        out.push({ kind, qty });
      }
    }
    return out;
  }
  return [];
}

export async function trySyncBillingInvoiceToZoho(invoiceId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  zohoInvoiceId?: string;
  error?: string;
}> {
  const admin = getSupabaseAdmin();

  const orgId = await getDefaultZohoOrganizationId();
  if (!orgId) {
    return { ok: false, skipped: true, error: 'Zoho organization id not configured' };
  }

  const { data: invoice, error: invErr } = await admin
    .from('billing_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  if (!invoice) return { ok: false, error: 'Invoice not found' };

  const inv = invoice as any as InvoiceRow;
  const meta = (inv.metadata ?? {}) as any;
  const zohoMeta = (meta.zoho ?? {}) as any;

  if (zohoMeta?.invoice_id) {
    return { ok: true, skipped: true, zohoInvoiceId: String(zohoMeta.invoice_id) };
  }

  const { data: company, error: compErr } = await admin
    .from('companies')
    .select('id, company_name, gst_number, contact_email, contact_phone, address')
    .eq('id', inv.company_id)
    .maybeSingle();

  if (compErr) return { ok: false, error: compErr.message };
  if (!company) return { ok: false, error: 'Company not found for invoice' };

  const customerId = await ensureZohoContactId({ organizationId: orgId, company: company as any as CompanyRow });

  const lineItems: any[] = [];

  const addonItems = extractAddonItems(inv.metadata);
  if (addonItems.length > 0) {
    for (const it of addonItems) {
      const itemType = addonKindToItemType(it.kind);
      const map = await getZohoItemMapping({ organizationId: orgId, itemType });
      if (!map) {
        throw new Error(`Zoho item mapping missing for item_type=${itemType}`);
      }
      lineItems.push({
        item_id: map.itemId,
        name: map.name,
        quantity: it.qty,
        rate: map.unitPrice,
      });
    }
  } else {
    // Subscription invoice (or unknown invoice type)
    const map = await getZohoItemMapping({ organizationId: orgId, itemType: 'subscription' });
    if (!map) {
      throw new Error('Zoho item mapping missing for item_type=subscription');
    }
    lineItems.push({ item_id: map.itemId, name: map.name, quantity: 1, rate: map.unitPrice });
  }

  const createdAt = inv.created_at ? new Date(inv.created_at) : new Date();
  const invoiceDate = isoDateOnly(createdAt);

  const createBody: any = {
    customer_id: customerId,
    date: invoiceDate,
    due_date: invoiceDate,
    reference_number: inv.reference ?? inv.id,
    notes: 'Generated by RxTrace billing system',
    line_items: lineItems,
  };

  const createResp = await zohoBooksFetch({
    organizationId: orgId,
    path: '/invoices',
    method: 'POST',
    body: createBody,
  });

  const createJson = (await createResp.json().catch(() => null)) as any;
  if (!createResp.ok) {
    throw new Error(`Zoho invoice create failed: ${createJson?.message ?? createResp.statusText}`);
  }

  const zohoInvoiceId = String(createJson?.invoice?.invoice_id ?? '');
  const zohoInvoiceNumber = createJson?.invoice?.invoice_number ? String(createJson.invoice.invoice_number) : null;

  if (!zohoInvoiceId) {
    throw new Error('Zoho invoice create returned no invoice_id');
  }

  const nextMeta = {
    ...(meta ?? {}),
    zoho: {
      status: 'synced',
      synced_at: new Date().toISOString(),
      organization_id: orgId,
      invoice_id: zohoInvoiceId,
      invoice_number: zohoInvoiceNumber,
    },
  };

  const { error: updErr } = await admin
    .from('billing_invoices')
    .update({ metadata: nextMeta })
    .eq('id', invoiceId);

  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true, zohoInvoiceId };
}
