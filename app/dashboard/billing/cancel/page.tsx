'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CompanySubscription = {
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_end_date?: string | null;
  razorpay_subscription_id?: string | null;
  razorpay_subscription_status?: string | null;
  subscription_cancel_at_period_end?: boolean | null;
  subscription_current_period_end?: string | null;
};

export default function CancelSubscriptionPage() {
  const [company, setCompany] = useState<CompanySubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscription', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load subscription');
      setCompany(body.company ?? null);
    } catch (e: any) {
      setMessage(e.message || String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancelAtPeriodEnd() {
    setLoading(true);
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
      await load();
    } catch (e: any) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Cancel Subscription</h1>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.includes('✅')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">Plan:</span>{' '}
            <span className="font-medium">{company?.subscription_plan ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>{' '}
            <span className="font-medium">{company?.subscription_status ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Razorpay subscription:</span>{' '}
            <span className="font-medium">{company?.razorpay_subscription_id ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Cancel at period end:</span>{' '}
            <span className="font-medium">{company?.subscription_cancel_at_period_end ? 'Yes' : 'No'}</span>
          </div>
          {company?.subscription_current_period_end ? (
            <div>
              <span className="text-gray-500">Current period end:</span>{' '}
              <span className="font-medium">{new Date(company.subscription_current_period_end).toLocaleString()}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cancel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            This will stop auto-renewal and cancel at the end of the current billing period.
          </p>
          <Button
            onClick={cancelAtPeriodEnd}
            disabled={loading || !company?.razorpay_subscription_id}
            variant="destructive"
          >
            {loading ? 'Processing…' : 'Cancel subscription'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
