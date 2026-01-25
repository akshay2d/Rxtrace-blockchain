'use client';

import { useSubscription } from '@/lib/hooks/useSubscription';
import { AlertCircle, Clock, Ban, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function SubscriptionBanner() {
  const { subscription, loading } = useSubscription();
  const router = useRouter();

  if (loading || !subscription) return null;

  const status = subscription.status;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end) : null;
  const now = new Date();
  const daysUntilTrialEnd = trialEnd ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  // Trial expiring soon (≤ 7 days)
  if (status === 'TRIAL' && daysUntilTrialEnd !== null && daysUntilTrialEnd <= 7 && daysUntilTrialEnd > 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex items-start">
          <Clock className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-900">
              Trial Expiring Soon
            </h3>
            <p className="text-sm text-yellow-800 mt-1">
              Your trial ends in {daysUntilTrialEnd} day{daysUntilTrialEnd !== 1 ? 's' : ''}. 
              Choose a subscription plan to continue using RxTrace.
            </p>
            <Link href="/pricing" className="text-sm font-medium text-yellow-900 underline mt-2 inline-block">
              View Plans →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Subscription paused
  if (status === 'PAUSED') {
    return (
      <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-6">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 mr-3" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-orange-900">
              Subscription Paused
            </h3>
            <p className="text-sm text-orange-800 mt-1">
              Your subscription is currently paused. Paid features are disabled. 
              Contact support to resume your subscription.
            </p>
            <Link href="/dashboard/help" className="text-sm font-medium text-orange-900 underline mt-2 inline-block">
              Contact Support →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Subscription cancelled or expired
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
        <div className="flex items-start">
          {status === 'CANCELLED' ? (
            <Ban className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900">
              {status === 'CANCELLED' ? 'Subscription Cancelled' : 'Subscription Expired'}
            </h3>
            <p className="text-sm text-red-800 mt-1">
              Your subscription is no longer active. Paid features are disabled. 
              {subscription.current_period_end && (
                <> Access will remain until {new Date(subscription.current_period_end).toLocaleDateString('en-IN')}.</>
              )}
            </p>
            <Link href="/pricing" className="text-sm font-medium text-red-900 underline mt-2 inline-block">
              Reactivate Subscription →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
