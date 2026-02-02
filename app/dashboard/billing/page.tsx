'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/billingConfig';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';

// PRIORITY-3: Usage Quota Row Component (Read-Only)
function UsageQuotaRow({ codeType, planItems }: { codeType: string; planItems: any[] }) {
  // Map code type to plan item label pattern
  const findQuotaItem = (codeType: string) => {
    const normalized = codeType.toLowerCase();
    return planItems.find((item: any) => {
      const label = (item.label || '').toLowerCase();
      if (normalized.includes('unit')) return label.includes('unit');
      if (normalized.includes('box') && !normalized.includes('carton') && !normalized.includes('pallet')) {
        return label.includes('box') && !label.includes('carton') && !label.includes('pallet');
      }
      if (normalized.includes('carton')) return label.includes('carton');
      if (normalized.includes('pallet') || normalized.includes('sscc')) {
        return label.includes('pallet') || label.includes('sscc');
      }
      return false;
    });
  };
  
  const quotaItem = findQuotaItem(codeType);
  const quota = quotaItem?.limit_value ?? null;
  const limitType = quotaItem?.limit_type || 'NONE';
  
  return (
    <tr>
      <td className="border border-gray-300 px-4 py-2 font-medium">{codeType}</td>
      <td className="border border-gray-300 px-4 py-2 text-right">
        {quota === null ? 'Unlimited' : quota.toLocaleString('en-IN')}
      </td>
      <td className="border border-gray-300 px-4 py-2">
        <span className={`px-2 py-1 rounded text-xs ${
          limitType === 'HARD' ? 'bg-red-100 text-red-800' :
          limitType === 'SOFT' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {limitType}
        </span>
      </td>
    </tr>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const { subscription, add_ons, loading: subscriptionLoading, refresh } = useSubscription();
  const [message, setMessage] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  // Trial invoice removed - free trial requires no payment
  const [company, setCompany] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [planItems, setPlanItems] = useState<any[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      // Fetch subscription/add-on invoices
      const res = await fetch('/api/billing/invoices?limit=10');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load invoices');
      setInvoices(body.invoices || []);

      // Trial invoice removed - free trial requires no payment
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch company info and usage data for display
    const fetchCompany = async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        if (res.ok) {
          if (data.company_name) {
            setCompany({ company_name: data.company_name, id: data.company_id });
          }
          // Store usage data for quota display
          setUsageData(data);
        }

        // No need to check trial_activated_at - trial state is ONLY in company_subscriptions
      } catch (err) {
        console.error('Failed to fetch company:', err);
      }
    };
    fetchCompany();
    fetchInvoices();
  }, [fetchInvoices]);

  // PRIORITY-3: Fetch plan items for quota display (read-only)
  useEffect(() => {
    if (subscription?.plan_id) {
      fetch(`/api/admin/subscription-plans`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.plans) {
            const currentPlan = data.plans.find((p: any) => p.id === subscription.plan_id);
            if (currentPlan?.items) {
              setPlanItems(currentPlan.items);
            }
          }
        })
        .catch(err => {
          console.error('Failed to fetch plan items:', err);
        });
    } else {
      // TRIAL or no plan - no quota limits
      setPlanItems([]);
    }
  }, [subscription?.plan_id]);

  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? This will stop auto-renewal at the end of your current billing period. You can resume anytime before the period ends.'
    );
    if (!confirmed) return;

    setCancelLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ at_period_end: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Cancel failed');
      setMessage('✅ Subscription cancellation requested (end of billing period).');
      await refresh();
    } catch (e: any) {
      setMessage(e.message || String(e));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    setResumeLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscription/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Resume failed');
      setMessage('✅ Subscription resumed successfully.');
      await refresh();
    } catch (e: any) {
      setMessage(e.message || String(e) || 'Failed to resume subscription. Please contact support.');
    } finally {
      setResumeLoading(false);
    }
  };

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


      {/* Subscription Summary - Enhanced */}
      {subscriptionLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Loading subscription information...</div>
          </CardContent>
        </Card>
      ) : subscription && subscription.status !== 'TRIAL' && subscription.status !== 'trialing' ? (
        <Card className="border-2 border-blue-300 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-100 to-orange-100">
            <CardTitle className="text-xl text-blue-900">📦 Your Subscription Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Plan:</span>
                  <span className="font-bold text-lg text-blue-900">
                    {subscription.plan?.name ? `${subscription.plan.name} (${subscription.plan.billing_cycle})` : 'Plan details loading...'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Status:</span>
                  <Badge className={`font-bold text-lg uppercase ${
                    subscription.status === 'ACTIVE'
                      ? 'bg-blue-600'
                      : subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                      ? 'bg-orange-600'
                      : 'bg-red-600'
                  }`}>
                    {subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                      ? '⚠️ Subscription Cancelled'
                      : subscription.status}
                  </Badge>
                </div>

                {subscription.current_period_end && (subscription.status === 'ACTIVE' || subscription.status === 'CANCELLED' || subscription.status === 'PAUSED') && (
                  <div className={`p-4 border-2 rounded-lg ${
                    subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                      ? 'bg-orange-50 border-orange-300'
                      : 'bg-blue-50 border-blue-300'
                  }`}>
                    <div className={`text-sm font-semibold mb-1 ${
                      subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                        ? 'text-orange-800'
                        : 'text-blue-800'
                    }`}>
                      {subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                        ? '⏰ Access Active Until'
                        : '⏰ Billing Period'}
                    </div>
                    <div className={`text-2xl font-bold ${
                      subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                        ? 'text-orange-900'
                        : 'text-blue-900'
                    }`}>
                      {(() => {
                        const now = new Date();
                        const endDate = new Date(subscription.current_period_end);
                        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                        return `${daysLeft} days left`;
                      })()}
                    </div>
                    <div className={`text-xs mt-2 ${
                      subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                        ? 'text-orange-700'
                        : 'text-blue-700'
                    }`}>
                      {subscription.status === 'CANCELLED' || subscription.status === 'PAUSED'
                        ? 'Access will end: '
                        : 'Ends: '}
                      {new Date(subscription.current_period_end).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    {(subscription.status === 'CANCELLED' || subscription.status === 'PAUSED') && (
                      <div className="text-xs text-orange-700 mt-2 font-medium">
                        Resume subscription to continue access after this date.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Plan Features Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-3">Plan Details:</h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  {subscription.plan ? (
                    <>
                      <li className="font-semibold text-blue-700">
                        ₹{subscription.plan.base_price.toLocaleString('en-IN')} / {subscription.plan.billing_cycle}
                      </li>
                      {subscription.plan.description && (
                        <li className="text-gray-600 mt-2">{subscription.plan.description}</li>
                      )}
                    </>
                  ) : (
                    <li className="text-gray-500">Plan details loading...</li>
                  )}
                </ul>
                {/* Phase 7: Tax & discount breakdown from latest subscription invoice */}
                {invoices?.length > 0 && (() => {
                  const latestSubInvoice = invoices.find((inv: any) => inv.plan != null && String(inv.plan).trim() !== '') ?? invoices[0];
                  const taxAmount = Number(latestSubInvoice?.tax_amount ?? 0);
                  const discountAmount = Number(latestSubInvoice?.discount_amount ?? 0);
                  const total = Number(latestSubInvoice?.amount ?? 0);
                  const hasBreakdown = taxAmount > 0 || discountAmount > 0;
                  if (!hasBreakdown) return null;
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <h5 className="font-medium text-gray-800 mb-1">Amount breakdown (latest invoice)</h5>
                      <ul className="text-xs text-gray-600 space-y-0.5">
                        {discountAmount > 0 && (
                          <li>Discount: -₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
                        )}
                        {taxAmount > 0 && (
                          <li>GST: +₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
                        )}
                        <li className="font-medium text-gray-800">Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Razorpay Subscription ID */}
            {subscription.razorpay_subscription_id && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500">Razorpay Subscription ID:</span>
                <div className="font-mono text-xs text-gray-700 mt-1 break-all">
                  {subscription.razorpay_subscription_id}
                </div>
              </div>
            )}

            {/* Action Buttons - Subscription only (trial cancel is in Settings) */}
            <div className="grid md:grid-cols-2 gap-3 pt-4 border-t">
              {subscription.status !== 'EXPIRED' && (
                <Button 
                  onClick={() => router.push('/pricing')}
                  variant="outline"
                  size="lg" 
                  className="w-full"
                >
                  <span className="text-base">Change / Upgrade Plan</span>
                </Button>
              )}

              {subscription.status === 'ACTIVE' && (
                <Button 
                  onClick={handleCancelSubscription}
                  disabled={cancelLoading}
                  variant="destructive" 
                  size="lg" 
                  className="w-full"
                >
                  <span className="text-base">
                    {cancelLoading ? 'Processing...' : 'Cancel Subscription'}
                  </span>
                </Button>
              )}

              {(subscription.status === 'CANCELLED' || subscription.status === 'PAUSED') && (
                <Button 
                  onClick={handleResumeSubscription}
                  disabled={resumeLoading}
                  variant="default" 
                  size="lg" 
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <span className="text-base">
                    {resumeLoading ? 'Processing...' : 'Resume Subscription'}
                  </span>
                </Button>
              )}
            </div>

          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No active subscription</p>
              <p className="text-sm text-gray-500 mb-4">
                Choose a plan to subscribe and start using RxTrace.
              </p>
              <div className="flex gap-3 justify-center">
                <Button asChild>
                  <Link href="/pricing">Choose a Plan</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Profile Section */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Company Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {company && company.company_name ? (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Company Name:</span>
                  <p className="font-medium text-gray-900 mt-1">{company.company_name}</p>
                </div>
                {company.pan && (
                  <div>
                    <span className="text-gray-600">PAN:</span>
                    <p className="font-medium text-gray-900 mt-1">{company.pan}</p>
                  </div>
                )}
                {company.gst_number && (
                  <div>
                    <span className="text-gray-600">GST:</span>
                    <p className="font-medium text-gray-900 mt-1">{company.gst_number}</p>
                  </div>
                )}
                {company.address && (
                  <div className="md:col-span-2">
                    <span className="text-gray-600">Address:</span>
                    <p className="font-medium text-gray-900 mt-1">{company.address}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Company profile is not set up yet.</p>
              <p className="text-xs text-gray-500">Please complete company setup in Settings to access billing features.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage & Quotas - subscription only (no trial; indicative cost on Dashboard) */}
      {subscription && usageData && (subscription.status !== 'TRIAL' && subscription.status !== 'trialing') && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Usage & Cost Breakdown (Read-Only)</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Transparent view of your usage, quotas, and indicative costs. This is for reference only and does not affect billing.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* A. Usage by Code Type */}
              <div>
                <h3 className="text-md font-semibold text-gray-800 mb-3">A. Usage by Code Type</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">Code Type</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Used</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Period</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-medium">Unit</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{usageData.label_generation?.unit || 0}</td>
                        <td className="border border-gray-300 px-4 py-2">Billing Period</td>
                        <td className="border border-gray-300 px-4 py-2 text-xs text-gray-600">billing_usage</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-medium">Box</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{usageData.label_generation?.box || 0}</td>
                        <td className="border border-gray-300 px-4 py-2">Billing Period</td>
                        <td className="border border-gray-300 px-4 py-2 text-xs text-gray-600">billing_usage</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-medium">Carton</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{usageData.label_generation?.carton || 0}</td>
                        <td className="border border-gray-300 px-4 py-2">Billing Period</td>
                        <td className="border border-gray-300 px-4 py-2 text-xs text-gray-600">billing_usage</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-medium">Pallet / SSCC</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{usageData.label_generation?.pallet || 0}</td>
                        <td className="border border-gray-300 px-4 py-2">Billing Period</td>
                        <td className="border border-gray-300 px-4 py-2 text-xs text-gray-600">billing_usage</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                  <span>ℹ️</span>
                  <span>Billing usage is calculated per billing period, not calendar month.</span>
                </p>
              </div>

              {/* B. Applicable Quotas (Plan-Level) */}
              <div>
                <h3 className="text-md font-semibold text-gray-800 mb-3">B. Applicable Quotas (Plan-Level)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">Code Type</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Quota</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Limit Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      <UsageQuotaRow 
                        codeType="Unit" 
                        planItems={planItems}
                      />
                      <UsageQuotaRow 
                        codeType="Box" 
                        planItems={planItems}
                      />
                      <UsageQuotaRow 
                        codeType="Carton" 
                        planItems={planItems}
                      />
                      <UsageQuotaRow 
                        codeType="Pallet / SSCC" 
                        planItems={planItems}
                      />
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                  <span>ℹ️</span>
                  <span>Quota limits are defined by your subscription plan.</span>
                </p>
              </div>

              {/* Indicative cost moved to Dashboard */}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add-ons */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Add-ons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {add_ons.length > 0 ? (
            <div className="space-y-3">
              {add_ons.map((addOn) => (
                <div key={addOn.id} className="rounded-md border border-gray-200 p-4 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-gray-900 font-semibold mb-1">{addOn.add_ons.name}</div>
                      <div className="text-xs text-gray-600 mb-2">{addOn.add_ons.description}</div>
                      <div className="text-sm text-gray-700">
                        Quantity: <span className="font-semibold">{addOn.quantity}</span>
                        {' • '}
                        Price: <span className="font-semibold">₹{addOn.add_ons.price.toLocaleString('en-IN')} / {addOn.add_ons.unit}</span>
                        {addOn.add_ons.recurring && <Badge variant="outline" className="ml-2">Recurring</Badge>}
                      </div>
                    </div>
                    <Badge variant={addOn.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {addOn.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 p-4 bg-gray-50">
              <div className="text-gray-600 mb-2">No add-ons purchased</div>
              <p className="text-xs text-gray-500">Purchase additional resources from the pricing page.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-gray-600 text-sm">
              Purchase additional seats or labels from the pricing page.
            </div>
            <Button asChild size="sm" variant="outline" className="border-gray-300">
              <Link href="/pricing">Buy Add-ons</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices - Enhanced with Categories */}
      <Card>
        <CardHeader>
          <CardTitle>📄 Invoices & Receipts</CardTitle>
          <p className="text-sm text-gray-600">Download invoices for subscriptions and add-on purchases</p>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="text-sm text-gray-500">Loading invoices…</div>
          ) : (
            <div className="space-y-6">
              {/* Trial invoice section removed - free trial requires no payment */}

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
              {invoices.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📄</div>
                  <div className="text-sm">No invoices available yet.</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Invoices will appear here after you subscribe and monthly billing cycles.
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

