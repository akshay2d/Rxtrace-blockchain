import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { renderInvoicePdfBuffer } from '@/lib/billing/invoicePdf';
import { getDefaultZohoOrganizationId, zohoBooksFetch } from '@/lib/billing/zohoBooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(
      supabase,
      user.id,
      'id, company_name, gst_number, contact_email, contact_phone, address'
    );
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const company = resolved.company as Record<string, unknown>;

    const { data: invoice, error: invErr } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('id', id)
      .eq('company_id', resolved.companyId)
      .maybeSingle();

    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const meta = ((invoice as any)?.metadata ?? {}) as any;
    const zohoInvoiceId = meta?.zoho?.invoice_id ? String(meta.zoho.invoice_id) : null;
    const zohoInvoiceNumber = meta?.zoho?.invoice_number ? String(meta.zoho.invoice_number) : null;
    const zohoOrgId = meta?.zoho?.organization_id ? String(meta.zoho.organization_id) : await getDefaultZohoOrganizationId();

    if (zohoInvoiceId && zohoOrgId) {
      try {
        const resp = await zohoBooksFetch({
          organizationId: zohoOrgId,
          path: `/invoices/${encodeURIComponent(zohoInvoiceId)}`,
          query: { accept: 'pdf' },
          headers: { Accept: 'application/pdf' },
        });

        if (resp.ok) {
          const contentType = resp.headers.get('content-type') ?? '';
          const buf = await resp.arrayBuffer();
          if (/application\/pdf/i.test(contentType) && buf.byteLength > 0) {
            const filename = zohoInvoiceNumber ? `invoice-${zohoInvoiceNumber}.pdf` : `invoice-${zohoInvoiceId}.pdf`;
            return new NextResponse(new Uint8Array(buf), {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'private, max-age=0, no-cache',
              },
            });
          }
        }
      } catch {
        // Fall back to locally-rendered PDF.
      }
    }

    const buf = await renderInvoicePdfBuffer({
      invoice: {
        ...(invoice as any),
        amount: Number((invoice as any).amount ?? 0),
        base_amount: (invoice as any).base_amount != null ? Number((invoice as any).base_amount) : null,
        addons_amount: (invoice as any).addons_amount != null ? Number((invoice as any).addons_amount) : null,
        wallet_applied: (invoice as any).wallet_applied != null ? Number((invoice as any).wallet_applied) : 0,
      },
      company: company as any,
    });

    const filename = `invoice-${invoice.id}.pdf`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
