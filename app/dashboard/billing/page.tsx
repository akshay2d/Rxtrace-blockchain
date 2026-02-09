'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { supabaseClient } from '@/lib/supabase/client';

export default function BillingPage() {
  const { subscription, loading: subscriptionLoading, refresh } = useSubscription();
  const [company, setCompany] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch company info
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        if (res.ok) {
          if (data.company_name) {
            setCompany({ company_name: data.company_name, id: data.company_id });
          }
          setUsageData(data);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, []);

  // Handle Cancel Trial
  async function handleCancelTrial() {
    if (!confirm('Are you sure you want to cancel your trial? You will lose access to all features immediately.')) {
      return;
    }
    setCancelLoading(true);
    try {
      const res = await fetch('/api/trial/cancel', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || 'Failed to cancel trial');
        return;
      }
      await supabaseClient().auth.signOut();
      window.location.href = '/';
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setCancelLoading(false);
    }
  }

  // Calculate days left in trial
  const daysLeft = subscription?.trial_end
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trial Management</h1>
      </div>

      {/* Trial Status Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🎁</span>
            Free Trial Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!subscriptionLoading && subscription && (subscription.status === 'TRIAL' || subscription.status === 'trialing') ? (
            <div className="space-y-4">
              {/* Trial Active */}
              <div className="flex items-center justify-between p-4 bg-green-100 border border-green-300 rounded-lg">
                <div>
                  <p className="font-semibold text-green-900">Trial Active</p>
                  <p className="text-sm text-green-700 mt-1">
                    {daysLeft} days remaining in your 15-day free trial
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Ends: {new Date(subscription.trial_end!).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-green-700">{daysLeft}</p>
                  <p className="text-xs text-green-600">days left</p>
                </div>
              </div>

              {/* Trial Features */}
              <div className="p-4 bg-white border border-gray-200 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Your Trial Includes:</h3>
                <ul className="grid md:grid-cols-2 gap-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Unlimited label generation
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    GS1-compliant codes
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Supply chain tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Multi-user access
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    ERP integration
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Mobile scanning
                  </li>
                </ul>
              </div>

              {/* Cancel Trial */}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">
                  Want to cancel your trial? You can cancel anytime with no charges.
                </p>
                <Button
                  variant="outline"
                  onClick={handleCancelTrial}
                  disabled={cancelLoading}
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  {cancelLoading ? 'Processing...' : 'Cancel Trial'}
                </Button>
              </div>
            </div>
          ) : subscriptionLoading ? (
            <div className="text-sm text-gray-500">Loading trial information...</div>
          ) : (
            <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
              <p className="text-yellow-900">No active trial found.</p>
              <p className="text-sm text-yellow-700 mt-1">
                Contact support if you believe this is an error.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Profile */}
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
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Company profile is not set up yet.</p>
              <p className="text-xs text-gray-500">Please complete company setup in Settings.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      {usageData && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Usage Summary</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Your trial includes unlimited usage of all features.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{usageData.label_generation?.unit || 0}</p>
                <p className="text-sm text-gray-600">Unit Codes</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{usageData.label_generation?.box || 0}</p>
                <p className="text-sm text-gray-600">Box Codes</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{usageData.label_generation?.carton || 0}</p>
                <p className="text-sm text-gray-600">Carton Codes</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{usageData.label_generation?.pallet || 0}</p>
                <p className="text-sm text-gray-600">SSCC Codes</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
              <span>ℹ️</span>
              <span>All usage is unlimited during your free trial period.</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* FAQ */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Trial FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900">What happens after my trial ends?</h4>
            <p className="text-sm text-gray-600 mt-1">
              After your 15-day trial ends, you can continue using RxTrace by subscribing to a plan. 
              Your data and settings will be preserved.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">Is there any charge during the trial?</h4>
            <p className="text-sm text-gray-600 mt-1">
              No! The trial is completely free. No credit card is required and no charges will be made.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">Can I cancel my trial?</h4>
            <p className="text-sm text-gray-600 mt-1">
              Yes, you can cancel your trial at any time from this page. There are no cancellation fees.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
