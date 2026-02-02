'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CreditCard, Settings } from 'lucide-react';

/**
 * Trial & Upgrade card on Dashboard.
 * - No trial/subscription: Trial → Settings, Subscribe → Pricing
 * - Trial active: Trial status + Upgrade button + Manage in Settings
 * - Paid subscription: Link to Billing
 */
export function DashboardTrialCard() {
  const router = useRouter();
  const { subscription, loading } = useSubscription();

  if (loading) return null;

  const status = subscription?.status;
  const isPaid = status === 'ACTIVE' || status === 'EXPIRED';
  const isTrial = status === 'TRIAL' || status === 'trialing';
  const daysLeft = subscription?.trial_end
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Paid subscription: show Billing link
  if (isPaid) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">Active subscription</p>
            <p className="text-xs text-gray-500">Manage billing, invoices, and add-ons</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/billing">Billing</Link>
        </Button>
      </div>
    );
  }

  // Trial active: status + Upgrade + Manage
  if (isTrial) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-green-600 text-white">Trial Active</Badge>
              <span className="text-lg font-bold text-gray-900">
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Ends {subscription?.trial_end && new Date(subscription.trial_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push('/pricing')} className="bg-blue-600 hover:bg-blue-700">
              <CreditCard className="w-4 h-4 mr-2" />
              Upgrade Plan
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings">
                <Settings className="w-4 h-4 mr-2" />
                Manage Trial
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // No trial, no subscription: Trial → Settings, Subscribe → Pricing
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-600" />
        Get started with RxTrace
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Start a free 15-day trial or subscribe to a plan. No credit card required for trial.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/dashboard/settings">
            <Settings className="w-4 h-4 mr-2" />
            Start Free Trial
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">
            <CreditCard className="w-4 h-4 mr-2" />
            Subscribe to Plan
          </Link>
        </Button>
      </div>
    </div>
  );
}
