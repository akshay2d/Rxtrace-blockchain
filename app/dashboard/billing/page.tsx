'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, PRICING } from '@/lib/billingConfig';
import { normalizePlanType } from '@/lib/billing/period';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';

// Seat summary component (inline for billing page)
function SeatSummaryDisplay({ company }: { company: any }) {
  const [seatLimits, setSeatLimits] = useState<{
    max_seats: number;
    used_seats: number;
    available_seats: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) {
      setLoading(false);
      return;
    }

    // Calculate fallback from company data (same logic as team page)
    const planRaw = company?.subscription_plan ?? company?.plan_type ?? company?.plan ?? company?.tier;
    const planType = normalizePlanType(planRaw) ?? 'starter';
    const baseMax = PRICING.plans[planType]?.max_seats ?? 1;
    const extra = Number(company?.extra_user_seats ?? 0);
    const maxSeatsFallback = Math.max(1, baseMax + (Number.isFinite(extra) ? extra : 0));

    // Fetch seat limits from API
    fetch(`/api/admin/seat-limits?company_id=${company.id}`)
      .then((res) => res.json())
      .then((body) => {
        if (body?.max_seats !== undefined) {
          setSeatLimits({
            max_seats: Math.max(1, Number(body.max_seats)),
            used_seats: Math.max(1, Number(body.used_seats ?? 1)), // Minimum 1 (primary user)
            available_seats: Math.max(0, Number(body.available_seats ?? 0)),
          });
        } else {
          // Fallback to calculated values
          setSeatLimits({
            max_seats: maxSeatsFallback,
            used_seats: 1, // At least primary user is active
            available_seats: Math.max(0, maxSeatsFallback - 1),
          });
        }
      })
      .catch(() => {
        // Fallback to calculated values on error
        setSeatLimits({
          max_seats: maxSeatsFallback,
          used_seats: 1,
          available_seats: Math.max(0, maxSeatsFallback - 1),
        });
      })
      .finally(() => setLoading(false));
  }, [company?.id, company?.subscription_plan, company?.plan_type, company?.plan, company?.tier, company?.extra_user_seats]);

  if (loading || !seatLimits) {
    return <div className="text-sm text-gray-500">Loading seat information...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-gray-900">
        Seats: {seatLimits.max_seats} total | {seatLimits.used_seats} active | {seatLimits.available_seats} available
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-md border border-gray-200 p-4 bg-gray-50">
          <div className="text-sm text-gray-600 mb-1">Total Allowed</div>
          <div className="text-2xl font-semibold text-gray-900">{seatLimits.max_seats}</div>
        </div>
        <div className="rounded-md border border-gray-200 p-4 bg-blue-50">
          <div className="text-sm text-gray-600 mb-1">Active Users</div>
          <div className="text-2xl font-semibold text-blue-900">{seatLimits.used_seats}</div>
        </div>
        <div className="rounded-md border border-gray-200 p-4 bg-green-50">
          <div className="text-sm text-gray-600 mb-1">Available</div>
          <div className="text-2xl font-semibold text-green-900">{seatLimits.available_seats}</div>
        </div>
      </div>
      {seatLimits.available_seats === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <p className="font-medium mb-1">Seat limit reached</p>
          <p className="text-xs text-amber-700">
            Purchase additional seats to invite more users. Additional seats: ₹3,000/month each.
          </p>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { subscription, add_ons, loading: subscriptionLoading, refresh } = useSubscription();
  const [message, setMessage] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [trialInvoice, setTrialInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [trialUsed, setTrialUsed] = useState<boolean | null>(null);

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
    // Fetch company info for display
    const fetchCompany = async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        if (res.ok && data.company_name) {
          setCompany({ company_name: data.company_name, id: data.company_id });
        }

        // Check if company has used trial before
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('trial_activated_at')
            .eq('user_id', user.id)
            .maybeSingle();
          
          setTrialUsed(!!companyData?.trial_activated_at);
        }
      } catch (err) {
        console.error('Failed to fetch company:', err);
      }
    };
    fetchCompany();
    fetchInvoices();
  }, [fetchInvoices]);

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
      ) : subscription ? (
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
                  <span className="font-bold text-lg text-blue-900">
                    {subscription.plan?.name || 'N/A'} ({subscription.plan?.billing_cycle || 'N/A'})
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-gray-600 font-medium">Status:</span>
                  <Badge className={`font-bold text-lg uppercase ${
                    subscription.status === 'TRIAL' 
                      ? 'bg-green-600' 
                      : subscription.status === 'ACTIVE'
                      ? 'bg-blue-600'
                      : 'bg-red-600'
                  }`}>
                    {subscription.status === 'TRIAL' ? '🎉 Trial' : subscription.status}
                  </Badge>
                </div>

                {subscription.status === 'TRIAL' && subscription.trial_end && (
                  <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                    <div className="text-sm text-yellow-800 font-semibold mb-1">⏰ Trial Period</div>
                    <div className="text-2xl font-bold text-yellow-900">
                      {(() => {
                        const now = new Date();
                        const endDate = new Date(subscription.trial_end);
                        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                        return `${daysLeft} days left`;
                      })()}
                    </div>
                    <div className="text-xs text-yellow-700 mt-2">
                      Ends: {new Date(subscription.trial_end).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}

                {subscription.current_period_end && subscription.status === 'ACTIVE' && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-xs text-gray-600">Current Period Ends:</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {new Date(subscription.current_period_end).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Plan Features Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-3">Plan Details:</h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li className="font-semibold text-blue-700">
                    {subscription.plan?.base_price ? `₹${subscription.plan.base_price.toLocaleString('en-IN')} / ${subscription.plan.billing_cycle}` : 'Plan details not available'}
                  </li>
                  {subscription.plan?.description && (
                    <li className="text-gray-600 mt-2">{subscription.plan.description}</li>
                  )}
                </ul>
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

            {/* Action Buttons */}
            <div className="grid md:grid-cols-2 gap-3 pt-4 border-t">
              <Button 
                asChild 
                variant="outline" 
                size="lg" 
                className="w-full"
                disabled={subscription.status === 'PAUSED' || subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED'}
              >
                <Link href="/pricing">
                  <span className="text-base">Change Plan</span>
                </Link>
              </Button>
              {(subscription.status === 'ACTIVE' || subscription.status === 'TRIAL') && (
                <Button asChild variant="destructive" size="lg" className="w-full">
                  <Link href="/dashboard/billing/cancel">
                    <span className="text-base">Cancel Subscription</span>
                  </Link>
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
              {trialUsed === false ? (
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href="/pricing">Start Free Trial</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/pricing">Choose a Plan</Link>
                </Button>
              )}
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

      {/* Seat Usage Summary */}
      {company && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Seat Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <SeatSummaryDisplay company={company} />
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

    </div>
  );
}

