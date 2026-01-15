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
  const [trialInvoice, setTrialInvoice] = useState<any>(null);

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
      // Fetch subscription/add-on invoices
      const res = await fetch('/api/billing/invoices?limit=10');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load invoices');
      setInvoices(body.invoices || []);

      // Fetch trial authorization invoice (₹5) - might not exist for all users
      try {
        const trialRes = await fetch('/api/billing/trial-invoice');
        if (trialRes.ok) {
          const trialBody = await trialRes.json();
          setTrialInvoice(trialBody.invoice || null);
        } else {
          // No trial invoice found - that's okay for existing users
          setTrialInvoice(null);
        }
      } catch (trialErr) {
        // Silently handle trial invoice errors
        console.log('No trial invoice found:', trialErr);
        setTrialInvoice(null);
      }
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

      {/* Subscription Summary - Enhanced */}
      {company && (
        <Card className="border-2 border-blue-300 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-100 to-orange-100">
            <CardTitle className="text-xl text-blue-900">📦 Your Subscription Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {/* Plan Details */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Plan:</span>
                  <span className="font-bold text-lg text-blue-900 uppercase">
                    {company.subscription_plan || 'No Plan'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Status:</span>
                  <span className={`font-bold text-lg uppercase ${
                    company.subscription_status === 'trial' 
                      ? 'text-green-600' 
                      : company.subscription_status === 'active'
                      ? 'text-blue-600'
                      : 'text-red-600'
                  }`}>
                    {company.subscription_status === 'trial' ? '🎉 Trial Active' : company.subscription_status || 'Inactive'}
                  </span>
                </div>

                {company.subscription_status === 'trial' && company.trial_end_date && (
                  <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                    <div className="text-sm text-yellow-800 font-semibold mb-1">⏰ Trial Period</div>
                    <div className="text-2xl font-bold text-yellow-900">
                      {(() => {
                        const now = new Date();
                        const endDate = new Date(company.trial_end_date);
                        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                        return `${daysLeft} days left`;
                      })()}
                    </div>
                    <div className="text-xs text-yellow-700 mt-1">
                      Ends: {new Date(company.trial_end_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Plan Features Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-3">Plan Includes:</h4>
                {company.subscription_plan === 'growth' ? (
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>✓ 10,00,000 Unit labels/month</li>
                    <li>✓ 2,00,000 Box labels/month</li>
                    <li>✓ 20,000 Carton labels/month</li>
                    <li>✓ 2,000 Pallet labels/month</li>
                    <li>✓ 5 User seats</li>
                    <li>✓ 1 ERP integration</li>
                    <li>✓ Unlimited handsets</li>
                    <li className="font-semibold text-blue-700 mt-2">Monthly: ₹49,000</li>
                  </ul>
                ) : company.subscription_plan === 'starter' ? (
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>✓ 2,00,000 Unit labels/month</li>
                    <li>✓ 20,000 Box labels/month</li>
                    <li>✓ 2,000 Carton labels/month</li>
                    <li>✓ 500 Pallet labels/month</li>
                    <li>✓ 1 User seat</li>
                    <li>✓ 1 ERP integration</li>
                    <li>✓ Unlimited handsets</li>
                    <li className="font-semibold text-blue-700 mt-2">Monthly: ₹18,000</li>
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm">No active plan</p>
                )}
              </div>
            </div>

            {/* Razorpay Subscription ID */}
            {company.razorpay_subscription_id && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500">Razorpay Subscription ID:</span>
                <div className="font-mono text-xs text-gray-700 mt-1 break-all">
                  {company.razorpay_subscription_id}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid md:grid-cols-2 gap-3 pt-4 border-t">
              <Button asChild variant="outline" size="lg" className="w-full">
                <a href="/dashboard/billing/upgrade">
                  <span className="text-base">⬆️ Upgrade Plan</span>
                </a>
              </Button>
              <Button asChild variant="destructive" size="lg" className="w-full">
                <a href="/dashboard/billing/cancel">
                  <span className="text-base">🚫 Cancel Subscription</span>
                </a>
              </Button>
            </div>

            {/* Cancellation Reminder */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700">
                <strong>Cancel Anytime:</strong> During trial - no charges. After trial - cancel before next billing to avoid charges.
              </p>
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

      {/* Invoices - Enhanced with Categories */}
      <Card>
        <CardHeader>
          <CardTitle>📄 Invoices & Receipts</CardTitle>
          <p className="text-sm text-gray-600">Download invoices for trial authorization, subscriptions, and add-on purchases</p>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="text-sm text-gray-500">Loading invoices…</div>
          ) : (
            <div className="space-y-6">
              {/* Trial Authorization Invoice (₹5) */}
              {trialInvoice && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Trial</span>
                    Trial Authorization Receipt
                  </h3>
                  <div className="border-2 border-yellow-200 bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="font-semibold text-gray-900">₹5 Payment Method Verification</div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>Order ID: <span className="font-mono">{trialInvoice.order_id}</span></div>
                          <div>Payment ID: <span className="font-mono">{trialInvoice.payment_id || '—'}</span></div>
                          <div>Status: <span className="font-semibold text-green-600 uppercase">{trialInvoice.status}</span></div>
                          <div>Date: {trialInvoice.paid_at ? new Date(trialInvoice.paid_at).toLocaleString('en-IN') : '—'}</div>
                        </div>
                        <div className="text-xs text-yellow-700 mt-2 flex items-start gap-1">
                          <span>💡</span>
                          <span>This is a refundable authorization charge to verify your payment method for the 15-day free trial.</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xl font-bold text-gray-900">
                          ₹{(Number(trialInvoice.amount || 0) / 100).toFixed(2)}
                        </div>
                        <Button asChild variant="outline" size="sm" className="bg-white">
                          <a href="/api/billing/trial-invoice/download" target="_blank">
                            📥 Download PDF
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription & Add-on Invoices */}
              {invoices.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Subscription</span>
                    Monthly Billing & Add-ons
                  </h3>
                  <div className="space-y-3">
                    {invoices.map((inv) => {
                      const invoiceType = inv.reference?.includes('addon') || inv.reference?.includes('topup') 
                        ? 'Add-on Purchase' 
                        : 'Monthly Subscription';
                      const isAddOn = invoiceType === 'Add-on Purchase';
                      
                      return (
                        <div 
                          key={inv.id} 
                          className={`border-2 rounded-lg p-4 ${
                            isAddOn 
                              ? 'border-purple-200 bg-purple-50' 
                              : 'border-blue-200 bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                  isAddOn 
                                    ? 'bg-purple-200 text-purple-900' 
                                    : 'bg-blue-200 text-blue-900'
                                }`}>
                                  {invoiceType}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  inv.status === 'paid' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {inv.status}
                                </span>
                              </div>
                              <div className="font-semibold text-gray-900">
                                {inv.plan ? `${inv.plan.toUpperCase()} Plan` : 'Billing Invoice'}
                              </div>
                              <div className="text-xs text-gray-600">
                                Period: {inv.period_start ? new Date(inv.period_start).toLocaleDateString('en-IN') : '—'} to {inv.period_end ? new Date(inv.period_end).toLocaleDateString('en-IN') : '—'}
                              </div>
                              {inv.reference && (
                                <div className="text-xs text-gray-500">
                                  Ref: <span className="font-mono">{inv.reference}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2 ml-4">
                              <div className="text-xl font-bold text-gray-900">
                                {formatCurrency(Number(inv.amount || 0))}
                              </div>
                              <Button asChild variant="outline" size="sm" className="bg-white">
                                <a href={`/api/billing/invoices/${encodeURIComponent(inv.id)}/download`} target="_blank">
                                  📥 Download PDF
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No Invoices Message */}
              {!trialInvoice && invoices.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📄</div>
                  <div className="text-sm">No invoices available yet.</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Invoices will appear here after your trial activation and monthly billing cycles.
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !company && <div className="text-sm text-gray-500">Loading subscription information…</div>}
    </div>
  );
}

