'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Building2, Users, Activity, TrendingUp, RefreshCw, AlertCircle, CheckCircle, Wrench } from 'lucide-react';

type Company = {
  id: string;
  company_name: string;
  created_at: string;
  user_id: string;
};

type Stats = {
  totalCompanies: number;
  totalUsers: number;
  totalScans: number;
  validScans: number;
  duplicateScans: number;
  expiredScans: number;
  invalidScans: number;
  last24h: number;
};

type RevenueStats = {
  mrr: number;
  arr: number;
  add_on_mrr: number;
  total_mrr: number;
  revenue_by_plan: Record<string, number>;
  revenue_by_addon: Record<string, number>;
  total_refunds: number;
  active_subscriptions: number;
};

type SubscriptionStats = {
  status_breakdown: Record<string, number>;
  total_subscriptions: number;
  active_subscriptions: number;
  trial_to_active_conversions: number;
  conversion_rate: number;
  churned_subscriptions: number;
  churn_rate: number;
};

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalCompanies: 0,
    totalUsers: 0,
    totalScans: 0,
    validScans: 0,
    duplicateScans: 0,
    expiredScans: 0,
    invalidScans: 0,
    last24h: 0
  });
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats | null>(null);
  const [fixingSubscriptions, setFixingSubscriptions] = useState(false);
  const [fixMessage, setFixMessage] = useState<string | null>(null);
  const [syncingPlans, setSyncingPlans] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch companies
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch scan logs
      const { data: logsData } = await supabase
        .from('scan_logs')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(1000);

      if (companiesData) {
        setCompanies(companiesData);
      }

      if (logsData) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        setStats({
          totalCompanies: companiesData?.length || 0,
          totalUsers: companiesData?.length || 0, // Assuming 1 user per company for now
          totalScans: logsData.length,
          validScans: logsData.filter(s => s.metadata?.status === 'VALID').length,
          duplicateScans: logsData.filter(s => s.metadata?.status === 'DUPLICATE').length,
          expiredScans: logsData.filter(s => s.metadata?.status === 'EXPIRED').length,
          invalidScans: logsData.filter(s => s.metadata?.status === 'INVALID').length,
          last24h: logsData.filter(s => new Date(s.scanned_at) > yesterday).length
        });
      }

      // Fetch revenue analytics
      try {
        const revenueRes = await fetch('/api/admin/analytics/revenue');
        const revenueData = await revenueRes.json();
        if (revenueData.success) {
          setRevenueStats(revenueData);
        }
      } catch (err) {
        console.error('Failed to fetch revenue stats:', err);
      }

      // Fetch subscription analytics
      try {
        const subRes = await fetch('/api/admin/analytics/subscriptions');
        const subData = await subRes.json();
        if (subData.success) {
          setSubscriptionStats(subData);
        }
      } catch (err) {
        console.error('Failed to fetch subscription stats:', err);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">🔐 Super Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">System-wide monitoring and management</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Fix Missing Subscriptions Tool */}
      <Card className="border-2 border-yellow-300 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-900">
            <Wrench className="w-5 h-5" /> System Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-800 font-medium mb-1">Fix Missing Subscription Records</p>
              <p className="text-xs text-yellow-700 max-w-2xl">
                Creates <code className="bg-yellow-200/70 px-1 rounded">company_subscriptions</code> rows for companies that have
                <code className="bg-yellow-200/70 px-1 rounded">subscription_status=active</code> and
                <code className="bg-yellow-200/70 px-1 rounded">razorpay_subscription_id</code> but no subscription record.
                Use when Billing shows &quot;No active subscription&quot; for paid users. Trial is company-level only — not touched.
              </p>
              <p className="text-xs text-yellow-600 mt-1 italic">
                Does not fix &quot;Payment gateway created but DB failed&quot; — in that case, contact support or use Razorpay dashboard to sync.
              </p>
            </div>
            <Button 
              onClick={async () => {
                setFixingSubscriptions(true);
                setFixMessage(null);
                setSyncMessage(null);
                try {
                  const res = await fetch('/api/admin/fix-missing-subscriptions', { method: 'POST' });
                  const data = await res.json();
                  if (data.success) {
                    setFixMessage(`✅ ${data.message}`);
                  } else {
                    setFixMessage(`❌ Error: ${data.error}`);
                  }
                } catch (err: any) {
                  setFixMessage(`❌ Error: ${err.message}`);
                } finally {
                  setFixingSubscriptions(false);
                }
              }}
              disabled={fixingSubscriptions}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {fixingSubscriptions ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Fixing...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4 mr-2" />
                  Fix Missing Subscriptions
                </>
              )}
            </Button>
            <div className="flex flex-col gap-2 mt-4">
              <div>
                <p className="text-sm text-amber-800 font-medium mb-1">Sync Razorpay Plan IDs</p>
                <p className="text-xs text-amber-700 max-w-2xl">
                  Copies env vars to <code className="bg-amber-200/70 px-1 rounded">subscription_plans.razorpay_plan_id</code>.
                  Run after updating env with correct Razorpay plan IDs (fixes ₹5 trial plan issue).
                </p>
              </div>
              <Button
                onClick={async () => {
                  setSyncingPlans(true);
                  setSyncMessage(null);
                  setFixMessage(null);
                  try {
                    const res = await fetch('/api/admin/sync-razorpay-plan-ids', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      setSyncMessage(`✅ ${data.message}`);
                    } else {
                      setSyncMessage(`❌ Error: ${data.error}`);
                    }
                  } catch (err: any) {
                    setSyncMessage(`❌ Error: ${err.message}`);
                  } finally {
                    setSyncingPlans(false);
                  }
                }}
                disabled={syncingPlans}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {syncingPlans ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4 mr-2" />
                    Sync Razorpay Plan IDs
                  </>
                )}
              </Button>
            </div>
          </div>
          {(fixMessage || syncMessage) && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              (fixMessage || syncMessage)?.includes('✅')
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {fixMessage && <div>{fixMessage}</div>}
              {syncMessage && <div className={fixMessage ? 'mt-2' : ''}>{syncMessage}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0052CC]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#0052CC]">{stats.totalCompanies}</div>
            <p className="text-xs text-gray-500 mt-1">Registered organizations</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalUsers}</div>
            <p className="text-xs text-gray-500 mt-1">Active accounts</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.totalScans}</div>
            <p className="text-xs text-gray-500 mt-1">Last 1000 records</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Last 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.last24h}</div>
            <p className="text-xs text-gray-500 mt-1">Recent activity</p>
          </CardContent>
        </Card>
      </div>

      {/* Scan Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System-Wide Scan Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.validScans}
              </div>
              <div>
                <div className="font-semibold text-green-700">Valid Scans</div>
                <div className="text-xs text-gray-600">Authentic products</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.duplicateScans}
              </div>
              <div>
                <div className="font-semibold text-yellow-700">Duplicates</div>
                <div className="text-xs text-gray-600">Re-scanned codes</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.expiredScans}
              </div>
              <div>
                <div className="font-semibold text-orange-700">Expired</div>
                <div className="text-xs text-gray-600">Past expiry date</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.invalidScans}
              </div>
              <div>
                <div className="font-semibold text-red-700">Invalid</div>
                <div className="text-xs text-gray-600">Malformed codes</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Analytics */}
      {revenueStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Revenue Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-gray-600 mb-1">Monthly Recurring Revenue</div>
                <div className="text-2xl font-bold text-blue-700">₹{revenueStats.mrr.toLocaleString('en-IN')}</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm text-gray-600 mb-1">Annual Recurring Revenue</div>
                <div className="text-2xl font-bold text-green-700">₹{revenueStats.arr.toLocaleString('en-IN')}</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="text-sm text-gray-600 mb-1">Add-on MRR</div>
                <div className="text-2xl font-bold text-purple-700">₹{revenueStats.add_on_mrr.toLocaleString('en-IN')}</div>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="text-sm text-gray-600 mb-1">Total MRR</div>
                <div className="text-2xl font-bold text-orange-700">₹{revenueStats.total_mrr.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-semibold text-gray-700 mb-2">Active Subscriptions: {revenueStats.active_subscriptions}</div>
              {revenueStats.total_refunds > 0 && (
                <div className="text-sm text-red-600">Total Refunds: ₹{revenueStats.total_refunds.toLocaleString('en-IN')}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription Analytics */}
      {subscriptionStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Subscription Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              {Object.entries(subscriptionStats.status_breakdown).map(([status, count]) => (
                <div key={status} className="p-4 bg-gray-50 rounded-lg border">
                  <div className="text-sm text-gray-600 mb-1">{status}</div>
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
                <div className="text-xl font-bold text-green-600">{subscriptionStats.conversion_rate}%</div>
                <div className="text-xs text-gray-500 mt-1">{subscriptionStats.trial_to_active_conversions} trial → active</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Churn Rate</div>
                <div className="text-xl font-bold text-red-600">{subscriptionStats.churn_rate}%</div>
                <div className="text-xs text-gray-500 mt-1">{subscriptionStats.churned_subscriptions} churned</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Companies List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Registered Companies ({companies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <div key={company.id} className="p-4 border rounded-lg hover:border-orange-500 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-[#0052CC] text-lg">{company.company_name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {company.id.substring(0, 8)}...
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Registered: {new Date(company.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge className="bg-green-500 text-white">Active</Badge>
                </div>
              </div>
            ))}
            {companies.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-500">
                No companies registered yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
