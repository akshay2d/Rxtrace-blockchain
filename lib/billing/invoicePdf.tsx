import React from 'react';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

type InvoiceRow = {
  id: string;
  company_id: string;
  plan: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency?: string | null;
  status: string;
  paid_at?: string | null;
  reference?: string | null;
  charge_tx_id?: string | null;
  base_amount?: number | null;
  addons_amount?: number | null;
  wallet_applied?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  has_gst?: boolean | null;
  gst_number?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  billing_cycle?: string | null;
  created_at?: string | null;
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

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `₹${safe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, color: '#111827' },
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700 },
  muted: { color: '#6B7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  box: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: 10 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6, marginBottom: 6 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  bold: { fontWeight: 700 },
});

function InvoicePdfDoc({ invoice, company }: { invoice: InvoiceRow; company: CompanyRow }) {
  const amount = toNumber(invoice.amount);
  const base = invoice.base_amount != null ? toNumber(invoice.base_amount) : toNumber(invoice?.metadata?.pricing?.base);
  const addons = invoice.addons_amount != null ? toNumber(invoice.addons_amount) : toNumber(invoice?.metadata?.pricing?.addons);
  const discountAmount = invoice.discount_amount != null ? toNumber(invoice.discount_amount) : toNumber(invoice?.metadata?.pricing?.discount);
  const taxAmount = invoice.tax_amount != null ? toNumber(invoice.tax_amount) : toNumber(invoice?.metadata?.pricing?.tax);
  const walletApplied = toNumber(invoice.wallet_applied);
  const due = Math.max(0, Number((amount - walletApplied).toFixed(2)));
  const billingCycle = invoice.billing_cycle ?? invoice?.metadata?.billing_cycle ?? null;

  const periodStart = invoice.period_start ? new Date(invoice.period_start).toLocaleDateString('en-IN') : '—';
  const periodEnd = invoice.period_end ? new Date(invoice.period_end).toLocaleDateString('en-IN') : '—';

  const createdAt = invoice.created_at ? new Date(invoice.created_at).toLocaleString('en-IN') : '—';
  const paidAt = invoice.paid_at ? new Date(invoice.paid_at).toLocaleString('en-IN') : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Invoice</Text>
          <View style={styles.row}>
            <Text style={styles.muted}>Invoice ID</Text>
            <Text>{invoice.id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Created</Text>
            <Text>{createdAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Status</Text>
            <Text>{invoice.status}{paidAt ? ` (Paid: ${paidAt})` : ''}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billed To</Text>
          <View style={styles.box}>
            <Text style={styles.bold}>{company.company_name ?? company.id}</Text>
            {company.gst_number ? <Text>GST: {company.gst_number}</Text> : null}
            {company.address ? <Text>{company.address}</Text> : null}
            {company.contact_email ? <Text>Email: {company.contact_email}</Text> : null}
            {company.contact_phone ? <Text>Phone: {company.contact_phone}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billing Period</Text>
          <View style={styles.box}>
            <View style={styles.row}>
              <Text style={styles.muted}>From</Text>
              <Text>{periodStart}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.muted}>To</Text>
              <Text>{periodEnd}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.muted}>Plan</Text>
              <Text>{invoice.plan}</Text>
            </View>
            {billingCycle ? (
              <View style={styles.row}>
                <Text style={styles.muted}>Billing cycle</Text>
                <Text>{String(billingCycle).charAt(0).toUpperCase() + String(billingCycle).slice(1)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Charges</Text>
          <View style={styles.box}>
            <View style={styles.tableHeader}>
              <Text style={styles.bold}>Description</Text>
              <Text style={styles.bold}>Amount</Text>
            </View>

            <View style={styles.tableRow}>
              <Text>Plan base</Text>
              <Text>{formatINR(base)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text>Monthly add-ons</Text>
              <Text>{formatINR(addons)}</Text>
            </View>
            {discountAmount > 0 ? (
              <View style={styles.tableRow}>
                <Text>Discount</Text>
                <Text>-{formatINR(discountAmount)}</Text>
              </View>
            ) : null}
            {taxAmount > 0 ? (
              <View style={styles.tableRow}>
                <Text>GST (18%)</Text>
                <Text>{formatINR(taxAmount)}</Text>
              </View>
            ) : null}

            <View style={styles.tableRow}>
              <Text style={styles.bold}>Subtotal</Text>
              <Text style={styles.bold}>{formatINR(amount)}</Text>
            </View>

            {walletApplied > 0 ? (
              <>
                <View style={styles.tableRow}>
                  <Text>Payment (Wallet)</Text>
                  <Text>-{formatINR(walletApplied)}</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.bold}>Amount due</Text>
                  <Text style={styles.bold}>{formatINR(due)}</Text>
                </View>
                {invoice.charge_tx_id ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.muted}>Wallet charge tx</Text>
                    <Text style={styles.muted}>{invoice.charge_tx_id}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.tableRow}>
                <Text style={styles.bold}>Amount due</Text>
                <Text style={styles.bold}>{formatINR(amount)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.muted}>Reference: {invoice.reference ?? '—'}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdfBuffer(opts: { invoice: InvoiceRow; company: CompanyRow }): Promise<Buffer> {
  const instance = pdf(<InvoicePdfDoc invoice={opts.invoice} company={opts.company} />);
  const buf = await instance.toBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as any);
}
