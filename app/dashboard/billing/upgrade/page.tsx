'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type CompanySubscription = {
  subscription_plan?: string | null;
  subscription_status?: string | null;
  razorpay_subscription_id?: string | null;
  razorpay_subscription_status?: string | null;
};

type RazorpayInfo = {
  configured?: boolean;
  planAvailability?: Record<string, boolean>;
};

type UpgradeResult = {
  ok?: boolean;
  short_url?: string | null;
};

export default function UpgradePlanPage() {
  const [company, setCompany] = useState<CompanySubscription | null>(null);
  const [razorpay, setRazorpay] = useState<RazorpayInfo | null>(null);
  const [plan, setPlan] = useState('growth_monthly');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UpgradeResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const planOptions = useMemo(() => {
    const availability = razorpay?.planAvailability;
    const isDisabled = (key: string) => (availability ? availability[key] === false : false);

    return [
      { key: 'starter_monthly', label: 'Starter (Monthly)', disabled: isDisabled('starter_monthly') },
      { key: 'starter_annual', label: 'Starter (Annual)', disabled: isDisabled('starter_annual') },
      { key: 'growth_monthly', label: 'Growth (Monthly)', disabled: isDisabled('growth_monthly') },
      { key: 'growth_annual', label: 'Growth (Annual)', disabled: isDisabled('growth_annual') },
      { key: 'enterprise_monthly', label: 'Enterprise (Monthly)', disabled: isDisabled('enterprise_monthly') },
      { key: 'enterprise_quarterly', label: 'Enterprise (Quarterly)', disabled: isDisabled('enterprise_quarterly') },
    ];
  }, [razorpay?.planAvailability]);

  const hasAnyConfiguredPlan = useMemo(() => {
    return planOptions.some((p) => !p.disabled);
  }, [planOptions]);

  useEffect(() => {
    // Ensure the selected plan is actually selectable once availability is known.
    const current = planOptions.find((p) => p.key === plan);
    if (current && !current.disabled) return;
    const firstEnabled = planOptions.find((p) => !p.disabled);
    if (firstEnabled) setPlan(firstEnabled.key);
  }, [planOptions, plan]);

  async function load() {
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscription', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load subscription');
      setCompany(body.company ?? null);
      setRazorpay(body.razorpay ?? null);
      if (body?.company?.subscription_plan) {
        const raw = String(body.company.subscription_plan);
        // Back-compat: old values were "starter" | "growth" | "enterprise".
        // Default those to monthly.
        if (raw === 'starter' || raw === 'growth' || raw === 'enterprise') {
          setPlan(`${raw}_monthly`);
        } else if (raw === 'enterprise_annual') {
          // Enterprise annual plans exceed Razorpay limits; treat as quarterly.
          setPlan('enterprise_quarterly');
        } else {
          setPlan(raw);
        }
      }
    } catch (e: any) {
      setMessage(e.message || String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upgrade() {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch('/api/billing/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Upgrade failed');
      setMessage('✅ Upgrade requested.');
      setResult({ ok: true, short_url: body?.short_url ?? body?.subscription?.short_url ?? null });
      await load();
    } catch (e: any) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Upgrade Plan</h1>

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!razorpay?.configured ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              Razorpay is not configured. Set <code>RAZORPAY_KEY_ID</code> (or{' '}
              <code>NEXT_PUBLIC_RAZORPAY_KEY_ID</code>) and <code>RAZORPAY_KEY_SECRET</code>.
            </div>
          ) : null}

          {razorpay?.configured && !hasAnyConfiguredPlan ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              No subscription plans are configured. Set at least one of:{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY</code>,{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY</code>,{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY</code>,{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL</code>,{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL</code>,{' '}
              <code>RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY</code>.
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-2">New plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {planOptions.map((p) => (
                <option key={p.key} value={p.key} disabled={p.disabled}>
                  {p.label}{p.disabled ? ' (not configured)' : ''}
                </option>
              ))}
            </select>
          </div>

          <Button 
            onClick={() => setShowConfirmModal(true)} 
            disabled={loading || !razorpay?.configured || !hasAnyConfiguredPlan}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Processing…' : 'Upgrade Plan'}
          </Button>

          {result?.short_url ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Click the button below to proceed to secure payment:</p>
              <Button
                onClick={() => window.open(result.short_url!, '_blank', 'noopener,noreferrer')}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Proceed to Secure Payment
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Razorpay Upgrade Confirmation Modal */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Plan Change</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Your plan change will take effect as per Razorpay billing cycle.
                </p>
                <div className="bg-gray-50 p-3 rounded-md space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Current Plan:</span>
                    <span className="font-medium text-gray-900">
                      {company?.subscription_plan ? String(company.subscription_plan).replace(/_/g, ' ').toUpperCase() : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">New Plan:</span>
                    <span className="font-medium text-gray-900">
                      {planOptions.find(p => p.key === plan)?.label || plan.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-3">
                  Plan changes are processed by Razorpay at your next billing cycle. You will receive a confirmation email once the change is processed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading || pendingConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setPendingConfirm(true);
                setShowConfirmModal(false);
                await upgrade();
                setPendingConfirm(false);
              }}
              disabled={loading || pendingConfirm}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {pendingConfirm ? 'Processing...' : 'Confirm Upgrade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
