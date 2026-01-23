/** @jsxImportSource react */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, color: '#111827' },
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  muted: { color: '#6B7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  box: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: 10 },
  bold: { fontWeight: 700 },
  highlight: { backgroundColor: '#FEF3C7', padding: 8, borderRadius: 4, marginTop: 8 },
});

function TrialInvoicePdf({ order, company }: { order: any; company: any }) {
  const amount = Number(order.amount || 0) / 100; // Convert paise to rupees
  const createdAt = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—';
  const paidAt = order.paid_at ? new Date(order.paid_at).toLocaleString('en-IN') : '—';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Trial Authorization Invoice</Text>
          <Text style={styles.subtitle}>RxTrace India - Pharmaceutical Traceability Platform</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.muted}>Order ID</Text>
            <Text>{order.order_id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Payment ID</Text>
            <Text>{order.payment_id || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Created</Text>
            <Text>{createdAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Paid</Text>
            <Text>{paidAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Status</Text>
            <Text style={styles.bold}>{order.status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billed To</Text>
          <View style={styles.box}>
            <Text style={styles.bold}>{company.company_name || 'Company'}</Text>
            {company.email ? <Text>Email: {company.email}</Text> : null}
            {company.address ? <Text>Address: {company.address}</Text> : null}
            {company.pan ? <Text>PAN: {company.pan}</Text> : null}
            {company.gst_number ? <Text>GST: {company.gst_number}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.box}>
            <View style={styles.row}>
              <Text>Description</Text>
              <Text>15-Day Free Trial Authorization</Text>
            </View>
            <View style={styles.row}>
              <Text>Purpose</Text>
              <Text>Payment method verification</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.bold}>Amount Charged</Text>
              <Text style={styles.bold}>₹{amount.toFixed(2)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Currency</Text>
              <Text>{order.currency || 'INR'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.highlight}>
          <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>🎉 TRIAL AUTHORIZATION NOTE</Text>
          <Text style={{ fontSize: 9, lineHeight: 1.4 }}>
            This ₹5 payment is a refundable authorization charge to verify your payment method. 
            You have 15 days of free access to all plan features. No charges will be made during 
            the trial period. After the trial ends, your subscription will activate automatically 
            unless cancelled.
          </Text>
        </View>

        <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 }}>
          <Text style={{ fontSize: 9, color: '#6B7280', textAlign: 'center' }}>
            Thank you for choosing RxTrace India!
          </Text>
          <Text style={{ fontSize: 8, color: '#9CA3AF', textAlign: 'center', marginTop: 4 }}>
            For support, email: support@rxtrace.in | www.rxtrace.in
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get company
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      console.error('Company fetch error:', companyErr);
      return NextResponse.json(
        { error: companyErr.message || 'Failed to fetch company' },
        { status: 500 }
      );
    }

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get trial authorization payment
    const { data: trialOrder, error: orderErr } = await supabase
      .from('razorpay_orders')
      .select('*')
      .eq('user_id', user.id)
      .or('purpose.eq.trial_auth,purpose.like.trial_auth_%')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) {
      console.error('Trial order fetch error:', orderErr);
      return NextResponse.json(
        { error: orderErr.message || 'Failed to fetch trial order' },
        { status: 500 }
      );
    }

    if (!trialOrder) {
      return NextResponse.json({ error: 'Trial payment not found' }, { status: 404 });
    }

    // Generate PDF
    const pdfDoc = pdf(<TrialInvoicePdf order={trialOrder} company={company} />);
    const buffer = await pdfDoc.toBuffer();

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="RxTrace-Trial-Authorization-${trialOrder.order_id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Trial invoice download error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
