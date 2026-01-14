'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/billingConfig';

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [company, setCompany] = useState<any>(null);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscription', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load subscription');
      setCompany(body.company ?? null);
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetch('/api/billing/invoices?limit=10');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load invoices');
      setInvoices(body.invoices || []);
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
    fetchInvoices();
  }, [fetchInvoices, fetchSubscription]);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Billing & Usage</h1>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.includes('✅') 
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}

      {/* Billing Policy Info */}
      <Card className="bg-gradient-to-r from-blue-50 to-orange-50 border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">💳 Billing Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-blue-800 mb-1">Free Trial (15 Days)</h4>
              <p className="text-gray-700">Full access to all plan features. No charges during trial period.</p>
            </div>
            <div>
              <h4 className="font-semibold text-blue-800 mb-1">After Trial Ends</h4>
              <p className="text-gray-700">Your selected plan amount will be charged automatically via Razorpay.</p>
            </div>
            <div>
              <h4 className="font-semibold text-blue-800 mb-1">Auto-Renewal</h4>
              <p className="text-gray-700">Automated recurring debit from your saved payment method each billing cycle.</p>
            </div>
            <div>
              <h4 className="font-semibold text-blue-800 mb-1">Payment Method</h4>
              <p className="text-gray-700">Secured by Razorpay. Card details saved for automatic billing.</p>
            </div>
          </div>
          
          {/* Cancellation Policy - Prominent */}
          <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
            <h4 className="font-bold text-red-900 mb-2">🚨 CANCELLATION POLICY (MANDATORY)</h4>
            <ul className="text-red-800 space-y-1">
              <li>• <strong>During Trial:</strong> Cancel anytime before trial ends - absolutely zero charges</li>
              <li>• <strong>After Trial:</strong> Cancel anytime from dashboard before next billing cycle to avoid charges</li>
              <li>• <strong>How to Cancel:</strong> Go to Billing → Cancel Subscription button</li>
              <li>• <strong>Refunds:</strong> No refunds for partial months. Cancel before renewal to avoid next charge</li>
            </ul>
          </div>

          {/* Plan Pricing */}
          <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg">
            <p className="text-blue-900 font-semibold mb-2">📋 Plan Pricing:</p>
            <div className="space-y-1 text-gray-700">
              <p>• <strong>Starter:</strong> ₹18,000/month or ₹2,00,000/year</p>
              <p>• <strong>Growth:</strong> ₹49,000/month or ₹5,00,000/year</p>
              <p>• <strong>Enterprise:</strong> ₹2,00,000/month or ₹5,00,000/quarter (₹20,00,000/year)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Summary */}
      {company && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Plan:</span>{' '}
              <span className="font-medium">{company.subscription_plan ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>{' '}
              <span className="font-medium">{company.subscription_status ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Trial ends:</span>{' '}
              <span className="font-medium">
                {company.trial_end_date ? new Date(company.trial_end_date).toLocaleString() : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Razorpay Subscription ID:</span>{' '}
              <span className="font-mono text-xs">{company.razorpay_subscription_id ?? '—'}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm">
                <a href="/dashboard/billing/upgrade">Upgrade plan</a>
              </Button>
              <Button asChild variant="destructive" size="sm">
                <a href="/dashboard/billing/cancel">Cancel subscription</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add-ons */}
      {company && (
        <Card>
          <CardHeader>
            <CardTitle>Add-ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-md border p-3">
                <div className="text-gray-500">Extra User IDs (Seats)</div>
                <div className="text-lg font-semibold">
                  {Number((company as any)?.extra_user_seats ?? 0) || 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-gray-500">Extra ERP Integrations</div>
                <div className="text-lg font-semibold">
                  {Number((company as any)?.extra_erp_integrations ?? 0) || 0}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-gray-600">
                Purchase add-ons (labels, seats, integrations) from the pricing page.
              </div>
              <Button asChild size="sm">
                <a href="/pricing">Buy add-ons</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="text-sm text-gray-500">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-gray-500">No invoices yet.</div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border rounded-md p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {inv.plan} • {inv.status}
                    </div>
                    <div className="text-xs text-gray-500">
                      {inv.period_start ? new Date(inv.period_start).toLocaleDateString() : '—'} -{' '}
                      {inv.period_end ? new Date(inv.period_end).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">{formatCurrency(Number(inv.amount || 0))}</div>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/billing/invoices/${encodeURIComponent(inv.id)}/download`}>
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !company && <div className="text-sm text-gray-500">Loading subscription information…</div>}
    </div>
  );
}

